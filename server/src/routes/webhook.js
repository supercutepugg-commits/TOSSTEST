const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { knex } = require('../db/schema');
const { broadcast } = require('./sse');
const { extractOrderFinance } = require('../orderFinance');
const { logStockMovement } = require('../stockLedger');

// store: { id, brand_id }. orderId는 수불부에 어떤 판매 건이 이 변동을 일으켰는지 남기기 위함
async function adjustStock(lineItems, multiplier, store, orderId) {
  const lowStockIngredients = [];
  for (const item of lineItems) {
    const menuName = (item.item && item.item.title) || item.name || item.menuName;
    const quantity = item.quantity || 1;

    const menu = await knex('menus')
      .where({ store_id: store.id, name: menuName })
      .orWhere({ store_id: store.id, toss_menu_id: item.menuId || '' })
      .first();
    if (!menu) continue;

    const recipes = await knex('recipes')
      .join('ingredients', 'recipes.ingredient_id', 'ingredients.id')
      .where({ menu_id: menu.id })
      .select('recipes.ingredient_id', 'recipes.amount', 'ingredients.threshold', 'ingredients.stock');

    for (const recipe of recipes) {
      const delta = recipe.amount * quantity * multiplier;
      const beforeStock = recipe.stock || 0;
      let afterStock;
      if (delta > 0) {
        afterStock = beforeStock - delta;
        await knex('ingredients').where({ id: recipe.ingredient_id }).decrement('stock', delta);
      } else {
        afterStock = beforeStock + Math.abs(delta);
        await knex('ingredients').where({ id: recipe.ingredient_id }).increment('stock', Math.abs(delta));
      }
      await logStockMovement(null, {
        brand_id: store.brand_id, store_id: store.id, ingredient_id: recipe.ingredient_id,
        type: multiplier > 0 ? 'SALE' : 'SALE_CANCEL', delta: -delta,
        before_stock: beforeStock, after_stock: afterStock,
        ref_type: 'order', ref_id: null, memo: orderId ? `주문 ${orderId}` : null,
      });

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

    // 시크릿키 검증: 가맹점별로 등록한 webhook_secret을 우선 사용 (가맹점관리 화면에서 설정하는 값이
    // 실제로는 전혀 안 쓰이고 환경변수 하나로만 검증하던 문제 — store_id만 알면(URL에 그대로 노출됨)
    // 누구나 서명 없이 가짜 주문/취소 이벤트를 보내 재고·매출을 조작할 수 있었음). 과거 호환을 위해
    // 가맹점에 시크릿이 없으면 전역 환경변수로 폴백
    const secret = store.webhook_secret || process.env.TOSS_WEBHOOK_SECRET;
    if (secret) {
      const signature = req.headers['x-toss-signature'] || '';
      const timestamp = req.headers['x-toss-timestamp'] || '';
      if (!signature || !timestamp) return res.sendStatus(401);

      // 타임스탬프가 초/밀리초 단위 모두 올 수 있어 둘 다 처리, 5분 이상 차이나면 재전송 공격으로 간주해 거부
      const tsNum = Number(timestamp);
      const tsMs = tsNum < 10_000_000_000 ? tsNum * 1000 : tsNum;
      if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
        return res.sendStatus(401);
      }

      const hmac = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
      const expected = `v1=${hmac}`;
      const sigBuf = Buffer.from(signature);
      const expectedBuf = Buffer.from(expected);
      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
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

      await adjustStock(lineItems, -1, store, cancelledOrderId);
      await knex('sales_items').where({ toss_order_id: cancelledOrderId, store_id: store.id }).delete();
      // orders 행도 취소 상태로 갱신해야 한다 — 대시보드 매출/건수가 sales_items가 아니라
      // orders.order_state === 'COMPLETED' 기준으로 집계되기 때문에, 여기서 안 갱신하면
      // 취소된 주문의 결제금액이 영원히 매출로 잡힌 채로 남아있게 됨 (REST 동기화도 취소 주문은
      // orderStates=COMPLETED 조건에 안 걸려서 다시 안 내려오므로 다른 경로로 고쳐질 일이 없음)
      await knex('orders').where({ toss_order_id: cancelledOrderId, store_id: store.id }).update({
        order_state: 'CANCELLED',
        list_price: 0, discount_amount: 0, supply_amount: 0, total_amount: 0,
        cash_amount: 0, card_amount: 0, other_amount: 0,
      });
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
      // REST 동기화가 이미 결제완료 데이터로 채워둔 행을, 나중에 도착한 생성(OPENED) 웹훅이 다시 덮어쓰지 않도록 방지
      if (existing && existing.order_state === 'COMPLETED') return res.sendStatus(200);

      const soldAt = (payload.data && payload.data.order && payload.data.order.createdAt)
        || (payload.data && payload.data.createdAt)
        || new Date().toISOString();

      await knex('orders').insert({
        toss_order_id: orderId, raw_payload: JSON.stringify(payload),
        store_id: store.id, brand_id: store.brand_id, processed_at: soldAt,
        ...extractOrderFinance(payload),
      }).onConflict('toss_order_id').merge();

      // 같은 주문에 대한 생성 웹훅이 재전송된 경우 — 주문행 자체는 위에서 최신 내용으로 갱신했지만,
      // 재고 차감/판매내역 적립은 이미 처리됐으므로 중복 실행을 막기 위해 여기서 멈춤
      if (existing) return res.sendStatus(200);

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

      const lowStockIngredients = await adjustStock(lineItems, 1, store, orderId);

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

module.exports = router;
