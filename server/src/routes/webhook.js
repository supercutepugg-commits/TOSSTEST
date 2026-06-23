const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { knex } = require('../db/schema');
const { sendLowStockAlert } = require('../mailer');
const { broadcast } = require('./sse');

async function adjustStock(lineItems, multiplier, storeId) {
  const lowStockIngredients = [];
  for (const item of lineItems) {
    const menuName = (item.item && item.item.title) || item.name || item.menuName;
    const quantity = item.quantity || 1;

    const menu = await knex('menus')
      .where({ store_id: storeId, name: menuName })
      .orWhere({ store_id: storeId, toss_menu_id: item.menuId || '' })
      .first();
    if (!menu) continue;

    const recipes = await knex('recipes')
      .join('ingredients', 'recipes.ingredient_id', 'ingredients.id')
      .where({ menu_id: menu.id })
      .select('recipes.ingredient_id', 'recipes.amount', 'ingredients.threshold');

    for (const recipe of recipes) {
      const delta = recipe.amount * quantity * multiplier;
      if (delta > 0) {
        await knex('ingredients').where({ id: recipe.ingredient_id }).decrement('stock', delta);
      } else {
        await knex('ingredients').where({ id: recipe.ingredient_id }).increment('stock', Math.abs(delta));
      }

      if (multiplier > 0) {
        const updated = await knex('ingredients').where({ id: recipe.ingredient_id }).first();
        if (updated.stock <= updated.threshold && !lowStockIngredients.find(x => x.id === updated.id)) {
          lowStockIngredients.push(updated);
        }
      }
    }
  }
  return lowStockIngredients;
}

async function handleWebhook(req, res, store) {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
    const payload = Buffer.isBuffer(req.body) ? JSON.parse(rawBody) : req.body;

    // 시크릿키 검증 (시크릿이 설정된 가맹점은 서명 헤더가 반드시 있어야 하고 일치해야 함)
    const secret = store.webhook_secret;
    if (secret) {
      const signature = req.headers['x-tossplace-signature'] || req.headers['x-signature'] || '';
      if (!signature) return res.sendStatus(401);
      const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
      const sigBuf = Buffer.from(signature);
      const hmacBuf = Buffer.from(hmac);
      if (sigBuf.length !== hmacBuf.length || !crypto.timingSafeEqual(sigBuf, hmacBuf)) {
        return res.sendStatus(401);
      }
    }

    const type = payload.type || '';
    console.log(`[웹훅] 가맹점(${store.name}) 수신:`, type);

    if (!type.startsWith('order.order.')) return res.sendStatus(200);

    // ── 주문 취소 ──────────────────────────────────────
    if (type === 'order.order.cancelled.v1') {
      const cancelledOrderId = payload.data && payload.data.orderId;
      const original = await knex('orders').where({ toss_order_id: cancelledOrderId, store_id: store.id }).first();
      if (!original) return res.sendStatus(200);

      const originalPayload = JSON.parse(original.raw_payload);
      const lineItems = (originalPayload.data && originalPayload.data.order && originalPayload.data.order.lineItems)
        || (originalPayload.data && originalPayload.data.lineItems)
        || [];

      await adjustStock(lineItems, -1, store.id);
      await knex('sales_items').where({ toss_order_id: cancelledOrderId, store_id: store.id }).delete();
      console.log('[웹훅] 취소 처리 완료, 재고 복구:', cancelledOrderId);
      return res.sendStatus(200);
    }

    // ── 주문 생성 ──────────────────────────────────────
    if (type === 'order.order.created.v1') {
      const orderId = (payload.data && payload.data.order && payload.data.order.id)
        || (payload.data && payload.data.orderId)
        || payload.id
        || `manual_${Date.now()}`;

      const existing = await knex('orders').where({ toss_order_id: orderId }).first();
      if (existing) return res.sendStatus(200);

      const soldAt = (payload.data && payload.data.order && payload.data.order.createdAt)
        || (payload.data && payload.data.createdAt)
        || new Date().toISOString();

      await knex('orders').insert({
        toss_order_id: orderId, raw_payload: JSON.stringify(payload),
        store_id: store.id, brand_id: store.brand_id, processed_at: soldAt,
      });

      const lineItems = (payload.data && payload.data.order && payload.data.order.lineItems)
        || (payload.data && payload.data.lineItems)
        || [];

      // sales_items에 정규화 저장
      for (const item of lineItems) {
        const menuName = (item.item && item.item.title) || item.name || item.menuName || '';
        const menuId = (item.item && item.item.id) || item.menuId || null;
        const qty = item.quantity || 1;
        const unitPrice = (item.itemPrice && item.itemPrice.priceValue) || (item.item && item.item.price) || item.unitPrice || item.price || 0;
        if (!menuName) continue;
        await knex('sales_items').insert({
          brand_id: store.brand_id, store_id: store.id,
          toss_order_id: orderId, menu_name: menuName, toss_menu_id: menuId,
          quantity: qty, unit_price: unitPrice, amount: unitPrice * qty,
          sold_at: soldAt,
        }).onConflict(['toss_order_id', 'menu_name']).ignore();
      }

      const lowStockIngredients = await adjustStock(lineItems, 1, store.id);

      if (lowStockIngredients.length > 0) {
        const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
        const toAlert = [];
        for (const i of lowStockIngredients) {
          const recent = await knex('alert_log')
            .where({ ingredient_id: i.id, store_id: store.id })
            .where('sent_at', '>', oneHourAgo)
            .first();
          if (!recent) toAlert.push(i);
        }
        if (toAlert.length > 0) {
          await sendLowStockAlert(toAlert, store.name);
          await knex('alert_log').insert(toAlert.map(i => ({ ingredient_id: i.id, stock_at_alert: i.stock, store_id: store.id })));
          broadcast({ type: 'LOW_STOCK', storeId: store.id, storeName: store.name, ingredients: toAlert.map(i => ({ name: i.name, stock: i.stock, unit: i.unit, threshold: i.threshold })) });
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err);
    res.sendStatus(500);
  }
}

// 가맹점별 웹훅: /webhook/:storeId (숫자 ID 또는 가맹점명 모두 지원)
router.post('/:storeId', express.raw({ type: 'application/json' }), async (req, res) => {
  const param = req.params.storeId;
  const store = await knex('stores')
    .where({ id: isNaN(param) ? 0 : param })
    .orWhere({ name: param })
    .first();
  if (!store) return res.sendStatus(404);
  await handleWebhook(req, res, store);
});

// 기본 웹훅: /webhook (하위 호환)
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const store = await knex('stores').first();
  if (!store) return res.sendStatus(404);
  await handleWebhook(req, res, store);
});

module.exports = router;
