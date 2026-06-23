const createAsyncRouter = require('../middleware/asyncRouter');
const router = createAsyncRouter();
const { knex } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { createRisk } = require('./risks');

async function checkSalesDownOrderUp(brand_id, store_id) {
  const fourteenAgo = new Date(Date.now() - 14 * 86400000).toISOString();
  const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // 최근 14일 vs 7일 주문 건수 비교 (POS 판매)
  const older = await knex('orders').where({ brand_id, store_id }).where('processed_at', '>=', fourteenAgo).where('processed_at', '<', sevenAgo).count('id as cnt').first();
  const recent = await knex('orders').where({ brand_id, store_id }).where('processed_at', '>=', sevenAgo).count('id as cnt').first();

  const olderCnt = Number(older?.cnt || 0);
  const recentCnt = Number(recent?.cnt || 0);

  // 최근 7일 발주 금액
  const recentOrder = await knex('purchase_orders')
    .where({ brand_id, store_id }).whereNotIn('status', ['DRAFT', 'CANCELED'])
    .where('created_at', '>=', sevenAgo).sum('total_amount as total').first();
  const prevOrder = await knex('purchase_orders')
    .where({ brand_id, store_id }).whereNotIn('status', ['DRAFT', 'CANCELED'])
    .where('created_at', '>=', fourteenAgo).where('created_at', '<', sevenAgo).sum('total_amount as total').first();

  const recentOrderAmt = Number(recentOrder?.total || 0);
  const prevOrderAmt = Number(prevOrder?.total || 0);

  // 매출 20% 감소 & 발주 20% 증가
  const SALES_DROP_RATIO = 0.8;   // 최근 7일 판매건수가 이전 7일의 80% 미만
  const ORDER_SPIKE_RATIO = 1.2;  // 최근 7일 발주금액이 이전 7일의 120% 초과
  if (olderCnt > 0 && recentCnt < olderCnt * SALES_DROP_RATIO && prevOrderAmt > 0 && recentOrderAmt > prevOrderAmt * ORDER_SPIKE_RATIO) {
    await createRisk(brand_id, store_id, 'SALES_DOWN_ORDER_UP', 'HIGH',
      `매출 감소·발주 증가: 판매 ${olderCnt}건→${recentCnt}건, 발주 ${Math.round(prevOrderAmt).toLocaleString()}원→${Math.round(recentOrderAmt).toLocaleString()}원`,
      { older_sales: olderCnt, recent_sales: recentCnt, prev_order: prevOrderAmt, recent_order: recentOrderAmt }
    );
  }
}

async function logHistory(order_id, action, before, after, reason, user_id, item_id = null) {
  await knex('order_history').insert({
    order_id, item_id,
    changed_by: user_id || null,
    action,
    before_value: before ? JSON.stringify(before) : null,
    after_value: after ? JSON.stringify(after) : null,
    reason: reason || null,
  });
}

// ── 발주서 목록 ───────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { status, store_id } = req.query;
  const q = knex('purchase_orders as po')
    .join('stores as s', 'po.store_id', 's.id')
    .leftJoin('users as u', 'po.created_by', 'u.id')
    .select('po.*', 's.name as store_name', 'u.name as created_by_name')
    .where('po.brand_id', req.user.brand_id)
    .orderBy('po.created_at', 'desc');

  if (status) q.where('po.status', status);
  if (store_id) q.where('po.store_id', store_id);
  // 가맹점 역할은 본인 가맹점만
  if (['STORE_OWNER', 'STORE_STAFF'].includes(req.user.role)) {
    q.where('po.store_id', req.user.store_id);
  }
  res.json(await q);
});

// ── 발주서 상세 ───────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  const order = await knex('purchase_orders as po')
    .join('stores as s', 'po.store_id', 's.id')
    .select('po.*', 's.name as store_name')
    .where('po.id', req.params.id)
    .where('po.brand_id', req.user.brand_id)
    .first();
  if (!order) return res.status(404).json({ error: '발주서 없음' });

  const items = await knex('purchase_order_items').where({ order_id: order.id });
  const history = await knex('order_history as h')
    .leftJoin('users as u', 'h.changed_by', 'u.id')
    .select('h.*', 'u.name as changed_by_name')
    .where('h.order_id', order.id)
    .orderBy('h.created_at', 'desc');

  res.json({ ...order, items, history });
});

// ── 발주서 생성 (임시저장 or 발주완료) ────────────────
router.post('/', requireAuth, async (req, res) => {
  const { items, memo, submit } = req.body;
  const store_id = req.user.store_id;
  if (!store_id) return res.status(400).json({ error: '가맹점 정보 없음' });

  const total = items.reduce((s, i) => s + (i.unit_price * i.quantity), 0);
  const status = submit ? 'ORDERED' : 'DRAFT';

  const [id] = await knex('purchase_orders').insert({
    brand_id: req.user.brand_id,
    store_id,
    created_by: req.user.id,
    status, total_amount: total, memo,
    ordered_at: submit ? new Date().toISOString() : null,
  });

  for (const item of items) {
    await knex('purchase_order_items').insert({
      order_id: id,
      product_id: item.product_id || null,
      product_name: item.product_name,
      unit: item.unit,
      unit_price: item.unit_price || 0,
      quantity: item.quantity,
      amount: (item.unit_price || 0) * item.quantity,
    });
  }

  await logHistory(id, 'CREATED', null, { status }, null, req.user.id);

  // 발주 시 매출감소·발주증가 리스크 체크 (비동기)
  if (submit) {
    checkSalesDownOrderUp(req.user.brand_id, store_id).catch(() => {});
  }

  res.json({ id });
});

// ── 발주서 수정 (임시저장 상태에서만) ─────────────────
router.put('/:id', requireAuth, async (req, res) => {
  const order = await knex('purchase_orders').where({ id: req.params.id }).first();
  if (!order) return res.status(404).json({ error: '없음' });
  if (!['DRAFT', 'REVISION_REQUESTED'].includes(order.status)) {
    return res.status(400).json({ error: '수정 불가 상태' });
  }

  const { items, memo, submit } = req.body;
  const total = items.reduce((s, i) => s + (i.unit_price * i.quantity), 0);
  const status = submit ? 'ORDERED' : order.status;

  await knex('purchase_orders').where({ id: order.id }).update({
    status, total_amount: total, memo,
    ordered_at: submit && !order.ordered_at ? new Date().toISOString() : order.ordered_at,
  });
  await knex('purchase_order_items').where({ order_id: order.id }).delete();
  for (const item of items) {
    await knex('purchase_order_items').insert({
      order_id: order.id,
      product_id: item.product_id || null,
      product_name: item.product_name,
      unit: item.unit,
      unit_price: item.unit_price || 0,
      quantity: item.quantity,
      amount: (item.unit_price || 0) * item.quantity,
    });
  }
  await logHistory(order.id, 'UPDATED', { status: order.status }, { status }, null, req.user.id);
  res.json({ ok: true });
});

// ── 상태 변경 (본사용) ────────────────────────────────
router.post('/:id/status', requireAuth, async (req, res) => {
  const { status, reason } = req.body;
  const order = await knex('purchase_orders').where({ id: req.params.id, brand_id: req.user.brand_id }).first();
  if (!order) return res.status(404).json({ error: '없음' });

  const update = { status };
  if (status === 'CONFIRMED') update.confirmed_at = new Date().toISOString();
  if (status === 'SHIPPED') update.shipped_at = new Date().toISOString();
  if (status === 'DELIVERED') update.delivered_at = new Date().toISOString();

  await knex('purchase_orders').where({ id: order.id }).update(update);
  await logHistory(order.id, 'STATUS_CHANGE', { status: order.status }, { status }, reason, req.user.id);

  // 납품 완료 시 linked ingredient 재고 반영 (없으면 자동 생성)
  if (status === 'DELIVERED') {
    const items = await knex('purchase_order_items').where({ order_id: order.id });
    for (const item of items) {
      if (!item.product_id) continue;
      const product = await knex('products').where({ id: item.product_id }).first();
      if (!product) continue;
      const qty = item.confirmed_quantity ?? item.quantity;
      const delta = qty * (product.unit_conversion || 1);

      if (product.ingredient_id) {
        // 해당 가맹점에 ingredient 있는지 확인
        let ing = await knex('ingredients')
          .where({ id: product.ingredient_id, store_id: order.store_id }).first();

        if (!ing) {
          // 브랜드 공통 ingredient 복사해서 가맹점 전용으로 생성
          const base = await knex('ingredients').where({ id: product.ingredient_id }).first();
          if (base) {
            const [newId] = await knex('ingredients').insert({
              brand_id: base.brand_id,
              store_id: order.store_id,
              name: base.name,
              unit: base.unit,
              stock: 0,
              threshold: base.threshold || 0,
            });
            ing = { id: newId };
            // product도 이 가맹점 ingredient를 참조하도록 갱신
            await knex('purchase_order_items').where({ id: item.id }).update({ product_id: item.product_id });
          }
          if (ing) await knex('ingredients').where({ id: ing.id }).increment('stock', delta);
        } else {
          await knex('ingredients').where({ id: ing.id }).increment('stock', delta);
        }
      } else {
        // ingredient 미연결 — 상품명으로 가맹점 재료 자동 생성
        let ing = await knex('ingredients')
          .where({ brand_id: order.brand_id, store_id: order.store_id, name: item.product_name }).first();
        if (!ing) {
          const [newId] = await knex('ingredients').insert({
            brand_id: order.brand_id,
            store_id: order.store_id,
            name: item.product_name,
            unit: product.base_unit || product.unit || '개',
            stock: 0,
            threshold: 0,
          });
          ing = { id: newId };
        }
        await knex('ingredients').where({ id: ing.id }).increment('stock', delta);
      }
    }
  }

  res.json({ ok: true });
});

// ── 본사 수량 수정 / 품절 / 대체상품 ─────────────────
router.put('/:id/items/:itemId', requireAuth, async (req, res) => {
  const { confirmed_quantity, status, reason, substitute_note } = req.body;
  const item = await knex('purchase_order_items').where({ id: req.params.itemId, order_id: req.params.id }).first();
  if (!item) return res.status(404).json({ error: '없음' });

  const before = { quantity: item.confirmed_quantity ?? item.quantity, status: item.status };
  await knex('purchase_order_items').where({ id: item.id }).update({
    confirmed_quantity: confirmed_quantity ?? item.quantity,
    status: status || item.status,
    substitute_note: substitute_note !== undefined ? substitute_note : item.substitute_note,
  });
  await logHistory(req.params.id, 'QUANTITY_CHANGE', before, { confirmed_quantity, status, substitute_note }, reason, req.user.id, item.id);

  // 확정금액 재계산
  const items = await knex('purchase_order_items').where({ order_id: req.params.id });
  const total = items.reduce((s, i) => s + (i.unit_price * (i.confirmed_quantity ?? i.quantity)), 0);
  await knex('purchase_orders').where({ id: req.params.id }).update({ confirmed_amount: total });

  res.json({ ok: true });
});

// ── 발주서 취소 ───────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  const order = await knex('purchase_orders').where({ id: req.params.id, brand_id: req.user.brand_id }).first();
  if (!order) return res.status(404).json({ error: '없음' });
  if (['PAID', 'SHIPPED', 'DELIVERED', 'CLOSED'].includes(order.status)) {
    return res.status(400).json({ error: '취소 불가 상태' });
  }
  await knex('purchase_orders').where({ id: order.id }).update({ status: 'CANCELED' });
  await logHistory(order.id, 'STATUS_CHANGE', { status: order.status }, { status: 'CANCELED' }, '취소', req.user.id);
  res.json({ ok: true });
});

module.exports = router;
