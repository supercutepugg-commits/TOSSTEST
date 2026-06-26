const createAsyncRouter = require('../middleware/asyncRouter');
const router = createAsyncRouter();
const { knex } = require('../db/schema');
const { requireAuth, requireRole, LOGISTICS_ROLES } = require('../middleware/auth');

function isStoreRole(role) {
  return ['STORE_OWNER', 'STORE_STAFF'].includes(role);
}
const { createRisk, getRiskSettings } = require('./risks');
const { logAudit } = require('../auditLog');
const { logStockMovement } = require('../stockLedger');
const crypto = require('crypto');

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || '';
const TOSS_API_BASE = 'https://api.tosspayments.com/v1/payments';

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

  // 매출 감소 & 발주 증가 — 본사가 설정한 비율 기준
  const settings = await getRiskSettings(brand_id);
  if (olderCnt > 0 && recentCnt < olderCnt * settings.salesDropRatio && prevOrderAmt > 0 && recentOrderAmt > prevOrderAmt * settings.orderSpikeRatio) {
    await createRisk(brand_id, store_id, 'SALES_DOWN_ORDER_UP', 'HIGH',
      `매출 감소·발주 증가: 판매 ${olderCnt}건→${recentCnt}건, 발주 ${Math.round(prevOrderAmt).toLocaleString()}원→${Math.round(recentOrderAmt).toLocaleString()}원`,
      { older_sales: olderCnt, recent_sales: recentCnt, prev_order: prevOrderAmt, recent_order: recentOrderAmt }
    );
  }
}

// 클라이언트가 보낸 unit_price를 신뢰하지 않고, product_id가 있으면 서버에 저장된 단가로 덮어쓴다
async function resolveItemPrices(brand_id, items) {
  const productIds = items.filter(i => i.product_id).map(i => i.product_id);
  const products = productIds.length
    ? await knex('products').where({ brand_id }).whereIn('id', productIds)
    : [];
  const byId = new Map(products.map(p => [p.id, p]));
  return items.map(item => {
    const product = item.product_id ? byId.get(Number(item.product_id)) : null;
    return {
      ...item,
      unit_price: product ? product.price : (item.unit_price || 0),
      unit: product ? product.unit : item.unit,
    };
  });
}

// 클라이언트를 신뢰하지 않고 서버에서 다시 한번 항목 유효성을 검증
function validateOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '발주 항목이 비어있습니다';
  }
  for (const item of items) {
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return `${item.product_name || '상품'}의 수량이 올바르지 않습니다`;
    }
  }
  return null;
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
    .leftJoin('users as au', 's.assigned_user_id', 'au.id')
    .select('po.*', 's.name as store_name', 'u.name as created_by_name', 'au.name as assigned_user_name')
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
    .leftJoin('users as u', 'po.created_by', 'u.id')
    .leftJoin('users as au', 's.assigned_user_id', 'au.id')
    .select('po.*', 's.name as store_name', 'u.name as created_by_name', 'au.name as assigned_user_name')
    .where('po.id', req.params.id)
    .where('po.brand_id', req.user.brand_id)
    .first();
  if (!order) return res.status(404).json({ error: '발주서 없음' });
  if (isStoreRole(req.user.role) && order.store_id !== req.user.store_id) {
    return res.status(403).json({ error: '권한 없음' });
  }

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
  const store_id = req.user.store_id;
  if (!store_id) return res.status(400).json({ error: '가맹점 정보 없음' });

  const itemError = validateOrderItems(req.body.items);
  if (itemError) return res.status(400).json({ error: itemError });

  const items = await resolveItemPrices(req.user.brand_id, req.body.items);
  const { memo, submit } = req.body;
  const total = items.reduce((s, i) => s + (i.unit_price * i.quantity), 0);
  const status = submit ? 'ORDERED' : 'DRAFT';

  const [{ id }] = await knex('purchase_orders').insert({
    brand_id: req.user.brand_id,
    store_id,
    created_by: req.user.id,
    status, total_amount: total, memo,
    ordered_at: submit ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).returning('id');

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
  const order = await knex('purchase_orders').where({ id: req.params.id, brand_id: req.user.brand_id }).first();
  if (!order) return res.status(404).json({ error: '없음' });
  if (isStoreRole(req.user.role) && order.store_id !== req.user.store_id) {
    return res.status(403).json({ error: '권한 없음' });
  }
  if (!['DRAFT', 'REVISION_REQUESTED'].includes(order.status)) {
    return res.status(400).json({ error: '수정 불가 상태' });
  }
  // 같은 발주서를 다른 직원이 먼저 수정한 경우, 화면에 보고 있던 시점 이후 변경됐다면 덮어쓰지 않고 알림
  if (req.body.updated_at && order.updated_at &&
      new Date(req.body.updated_at).getTime() !== new Date(order.updated_at).getTime()) {
    return res.status(409).json({ error: '다른 직원이 먼저 이 발주서를 수정했습니다. 새로고침 후 다시 시도해주세요' });
  }

  const itemError = validateOrderItems(req.body.items);
  if (itemError) return res.status(400).json({ error: itemError });

  const items = await resolveItemPrices(req.user.brand_id, req.body.items);
  const { memo, submit } = req.body;
  const total = items.reduce((s, i) => s + (i.unit_price * i.quantity), 0);
  const status = submit ? 'ORDERED' : order.status;
  const nowIso = new Date().toISOString();

  await knex.transaction(async (trx) => {
    await trx('purchase_orders').where({ id: order.id }).update({
      status, total_amount: total, memo,
      ordered_at: submit && !order.ordered_at ? nowIso : order.ordered_at,
      updated_at: nowIso,
    });
    await trx('purchase_order_items').where({ order_id: order.id }).delete();
    for (const item of items) {
      await trx('purchase_order_items').insert({
        order_id: order.id,
        product_id: item.product_id || null,
        product_name: item.product_name,
        unit: item.unit,
        unit_price: item.unit_price || 0,
        quantity: item.quantity,
        amount: (item.unit_price || 0) * item.quantity,
      });
    }
  });
  await logHistory(order.id, 'UPDATED', { status: order.status }, { status }, null, req.user.id);
  res.json({ ok: true, updated_at: nowIso });
});

// ── 상태 변경 (본사용) ────────────────────────────────
router.post('/:id/status', requireAuth, requireRole(...LOGISTICS_ROLES), async (req, res) => {
  const { status, reason } = req.body;
  const order = await knex('purchase_orders').where({ id: req.params.id, brand_id: req.user.brand_id }).first();
  if (!order) return res.status(404).json({ error: '없음' });
  if (status === 'DELIVERED' && !order.paid_at) {
    return res.status(400).json({ error: '결제가 완료되지 않은 발주서는 납품완료로 변경할 수 없습니다' });
  }

  const update = { status };
  if (status === 'CONFIRMED') update.confirmed_at = new Date().toISOString();
  if (status === 'SHIPPED') update.shipped_at = new Date().toISOString();
  if (status === 'DELIVERED') update.delivered_at = new Date().toISOString();

  await knex('purchase_orders').where({ id: order.id }).update(update);
  await logHistory(order.id, 'STATUS_CHANGE', { status: order.status }, { status }, reason, req.user.id);

  // 납품 완료 시 linked ingredient 재고 반영 (없으면 자동 생성)
  // stock_applied=false 조건의 원자적 업데이트로, 같은 발주서에 대해 중복 호출되거나 환불과 동시에 들어와도 재고가 두 번 반영되지 않도록 함
  if (status === 'DELIVERED') {
    await knex.transaction(async (trx) => {
      const claimed = await trx('purchase_orders').where({ id: order.id, stock_applied: false }).update({ stock_applied: true });
      if (claimed) await applyDeliveryStock(order, 1, trx);
    });
  }

  res.json({ ok: true });
});

// sign: 1 = 납품 완료(입고), -1 = 환불로 인한 입고 취소. qty가 없으면 품목의 (확정수량 - 이미 환불된 수량)을 사용
// trx: 호출자가 트랜잭션 안에서 실행 중이면 그 트랜잭션을 그대로 사용 (납품확정/환불이 동시에 들어와도 재고가 중복·누락 반영되지 않도록)
async function applyDeliveryStock(order, sign, trx = knex) {
  const items = await trx('purchase_order_items').where({ order_id: order.id });
  for (const item of items) {
    const baseQty = item.confirmed_quantity ?? item.quantity;
    const qty = sign > 0 ? baseQty : baseQty - (item.refunded_quantity || 0);
    if (qty <= 0) continue;
    await applyItemStock(order, item, qty, sign, trx);
  }
}

// 품목 하나에 대해 재고를 가감 (전체 재고반영/전체환불/품목별 환불 모두 공용으로 사용)
async function applyItemStock(order, item, qty, sign, trx = knex) {
  if (!item.product_id) return;
  const product = await trx('products').where({ id: item.product_id }).first();
  if (!product) return;
  const delta = sign * qty * (product.unit_conversion || 1);

  // ingredient 연결 상품은 브랜드 공통 원본을 이름으로 매칭해서 가맹점별 ingredient를 찾고,
  // 미연결 상품은 상품명 그대로 가맹점 재료를 찾는다 — 둘 다 없으면(환불 외 신규) 새로 만든다
  let baseName, unit, threshold;
  if (product.ingredient_id) {
    const base = await trx('ingredients').where({ id: product.ingredient_id }).first();
    if (!base) return;
    baseName = base.name || product.name;
    unit = base.unit;
    threshold = base.threshold || 0;
  } else {
    baseName = item.product_name || product.name;
    unit = product.base_unit || product.unit || '개';
    threshold = 0;
  }
  if (!baseName) return; // 이름을 알 수 없으면 빈 이름 재료를 만들지 않고 건너뜀

  let ing = await trx('ingredients')
    .where({ brand_id: order.brand_id, store_id: order.store_id, name: baseName }).first();
  if (!ing) {
    if (sign < 0) return; // 환불 시 재료가 없으면 만들지 않음
    const [{ id: newId }] = await trx('ingredients').insert({
      brand_id: order.brand_id, store_id: order.store_id,
      name: baseName, unit, stock: 0, threshold,
    }).returning('id');
    ing = { id: newId, stock: 0 };
  }

  const beforeStock = ing.stock || 0;
  const afterStock = Math.max(0, beforeStock + delta);
  if (sign < 0) await trx('ingredients').where({ id: ing.id }).update({ stock: afterStock });
  else await trx('ingredients').where({ id: ing.id }).increment('stock', delta);

  await logStockMovement(trx, {
    brand_id: order.brand_id, store_id: order.store_id, ingredient_id: ing.id,
    type: sign > 0 ? 'DELIVERY' : 'REFUND', delta,
    before_stock: beforeStock, after_stock: afterStock,
    ref_type: 'purchase_order', ref_id: order.id,
  });
}

// ── 본사 수량 수정 / 품절 / 대체상품 ─────────────────
// 결제 단계 이후(결제대기~완료/배송)에는 수량을 건드릴 수 없게 막는다 — 결제 금액·재고반영 기준이 confirmed_quantity라서
// 결제 후 수량이 바뀌면 결제승인 금액 검증이 깨지거나(이미 낸 돈과 불일치) 납품 시 재고가 실제와 다르게 반영됨
const ITEM_EDIT_LOCKED_STATUSES = ['PAYMENT_PENDING', 'PAID', 'PREPARING_SHIPMENT', 'SHIPPED', 'DELIVERED', 'CLOSED', 'CANCELED'];

router.put('/:id/items/:itemId', requireAuth, requireRole(...LOGISTICS_ROLES), async (req, res) => {
  const order = await knex('purchase_orders').where({ id: req.params.id, brand_id: req.user.brand_id }).first();
  if (!order) return res.status(404).json({ error: '없음' });
  if (ITEM_EDIT_LOCKED_STATUSES.includes(order.status)) {
    return res.status(400).json({ error: '결제가 시작된 이후에는 품목 수량을 수정할 수 없습니다' });
  }
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

// ── 결제 준비 (대금 결제용 주문 코드 발급) ─────────────
router.post('/:id/payment/prepare', requireAuth, async (req, res) => {
  const order = await knex('purchase_orders as po')
    .join('stores as s', 'po.store_id', 's.id')
    .select('po.*', 's.name as store_name')
    .where('po.id', req.params.id)
    .where('po.brand_id', req.user.brand_id)
    .first();
  if (!order) return res.status(404).json({ error: '없음' });
  if (['STORE_OWNER', 'STORE_STAFF'].includes(req.user.role) && order.store_id !== req.user.store_id) {
    return res.status(403).json({ error: '권한 없음' });
  }
  if (!['CONFIRMED', 'PAYMENT_PENDING'].includes(order.status)) {
    return res.status(400).json({ error: '결제 가능 상태가 아닙니다' });
  }

  const amount = Math.round(order.confirmed_amount ?? order.total_amount);
  const orderCode = order.toss_order_code || `po-${order.id}-${crypto.randomBytes(6).toString('hex')}`;

  await knex('purchase_orders').where({ id: order.id }).update({ toss_order_code: orderCode, status: 'PAYMENT_PENDING' });
  await logHistory(order.id, 'STATUS_CHANGE', { status: order.status }, { status: 'PAYMENT_PENDING' }, '결제 시작', req.user.id);

  res.json({
    orderId: orderCode,
    amount,
    orderName: `발주서 #${order.id} (${order.store_name})`,
  });
});

// ── 결제 승인 (Toss 결제창에서 successUrl로 돌아온 뒤 호출) ─────────────
router.post('/:id/payment/confirm', requireAuth, async (req, res) => {
  const { paymentKey, orderId, amount } = req.body;
  const order = await knex('purchase_orders').where({ id: req.params.id, brand_id: req.user.brand_id }).first();
  if (!order) return res.status(404).json({ error: '없음' });
  if (isStoreRole(req.user.role) && order.store_id !== req.user.store_id) {
    return res.status(403).json({ error: '권한 없음' });
  }
  if (order.toss_order_code !== orderId) return res.status(400).json({ error: '주문 정보 불일치' });
  // 중복 클릭/재시도로 같은 결제승인이 두 번 들어와도 Toss에 다시 확인 요청을 보내지 않도록 가드
  if (order.status === 'PAID') return res.status(400).json({ error: '이미 결제가 완료된 발주서입니다' });

  const expectedAmount = Math.round(order.confirmed_amount ?? order.total_amount);
  if (Math.round(amount) !== expectedAmount) return res.status(400).json({ error: '결제 금액 불일치' });
  if (!TOSS_SECRET_KEY) return res.status(500).json({ error: '결제 설정 오류 (TOSS_SECRET_KEY 미설정)' });

  const authHeader = 'Basic ' + Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
  const tossRes = await fetch(`${TOSS_API_BASE}/confirm`, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  const result = await tossRes.json();
  if (!tossRes.ok) {
    return res.status(tossRes.status).json({ error: result.message || '결제 승인 실패', code: result.code });
  }

  await knex('purchase_orders').where({ id: order.id }).update({
    status: 'PAID', toss_payment_key: paymentKey, paid_at: new Date().toISOString(),
  });
  await logHistory(order.id, 'STATUS_CHANGE', { status: order.status }, { status: 'PAID' }, '결제 완료', req.user.id);
  await logAudit(req.user.brand_id, req.user.id, 'PAYMENT', order.id, 'PAID', null, { amount, paymentKey });

  res.json({ ok: true, order: result });
});

// ── 결제 취소 (환불, 전액/부분) — 결제 완료된 발주서를 본사가 환불 처리 ─
router.post('/:id/refund', requireAuth, requireRole(...LOGISTICS_ROLES), async (req, res) => {
  const order = await knex('purchase_orders').where({ id: req.params.id, brand_id: req.user.brand_id }).first();
  if (!order) return res.status(404).json({ error: '없음' });
  if (!['PAID', 'PREPARING_SHIPMENT', 'SHIPPED', 'DELIVERED'].includes(order.status)) {
    return res.status(400).json({ error: '결제 완료 이후 상태에서만 환불할 수 있습니다' });
  }
  if (!order.toss_payment_key) return res.status(400).json({ error: '결제 정보가 없습니다' });
  if (!TOSS_SECRET_KEY) return res.status(500).json({ error: '결제 설정 오류 (TOSS_SECRET_KEY 미설정)' });

  const { reason, amount } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: '환불 사유를 입력해주세요' });

  const totalAmount = Math.round(order.confirmed_amount ?? order.total_amount);
  const alreadyRefunded = Math.round(order.refunded_amount || 0);
  const remaining = totalAmount - alreadyRefunded;
  if (remaining <= 0) return res.status(400).json({ error: '이미 전액 환불되었습니다' });

  const refundAmount = amount !== undefined ? Math.round(amount) : remaining;
  if (!refundAmount || refundAmount <= 0 || refundAmount > remaining) {
    return res.status(400).json({ error: `환불 금액이 올바르지 않습니다 (남은 환불 가능 금액: ${remaining.toLocaleString()}원)` });
  }

  const authHeader = 'Basic ' + Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
  const tossRes = await fetch(`${TOSS_API_BASE}/${order.toss_payment_key}/cancel`, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cancelReason: reason, cancelAmount: refundAmount }),
  });
  const result = await tossRes.json();
  if (!tossRes.ok) {
    return res.status(tossRes.status).json({ error: result.message || '환불 처리 실패', code: result.code });
  }

  const newRefunded = alreadyRefunded + refundAmount;
  const isFull = newRefunded >= totalAmount;

  // stock_reversed=false 조건이 달린 조건부 업데이트로 재고 차감 권한을 원자적으로 선점
  // (환불 버튼과 웹훅 동기화가 동시에 들어와도 재고가 두 번 깎이지 않도록). 선점과 재고반영을 한 트랜잭션으로 묶어
  // 재고반영 중 오류가 나도 선점 플래그만 남고 재고는 그대로인 불일치 상태가 생기지 않게 함
  const next = { refunded_amount: newRefunded };
  if (isFull) next.status = 'CANCELED';

  await knex.transaction(async (trx) => {
    if (isFull && order.status === 'DELIVERED' && !order.stock_reversed) {
      const claimed = await trx('purchase_orders').where({ id: order.id, stock_reversed: false }).update({ stock_reversed: true });
      if (claimed) await applyDeliveryStock(order, -1, trx);
    }
    await trx('purchase_orders').where({ id: order.id }).update(next);
  });

  const label = isFull ? '전액 환불' : `부분 환불 (${refundAmount.toLocaleString()}원)`;
  await logHistory(order.id, 'STATUS_CHANGE', { status: order.status }, { status: next.status || order.status }, `${label}: ${reason}`, req.user.id);
  await logAudit(req.user.brand_id, req.user.id, 'PAYMENT', order.id, isFull ? 'REFUND_FULL' : 'REFUND_PARTIAL',
    { refunded_amount: alreadyRefunded }, { refunded_amount: newRefunded, reason });

  res.json({ ok: true, order: result, refunded_amount: newRefunded, status: next.status || order.status });
});

// ── 결제 취소 (환불, 품목 단위) — 반품된 품목만큼만 금액/재고를 환불 ─
router.post('/:id/refund-items', requireAuth, requireRole(...LOGISTICS_ROLES), async (req, res) => {
  const order = await knex('purchase_orders').where({ id: req.params.id, brand_id: req.user.brand_id }).first();
  if (!order) return res.status(404).json({ error: '없음' });
  if (!['PAID', 'PREPARING_SHIPMENT', 'SHIPPED', 'DELIVERED'].includes(order.status)) {
    return res.status(400).json({ error: '결제 완료 이후 상태에서만 환불할 수 있습니다' });
  }
  if (!order.toss_payment_key) return res.status(400).json({ error: '결제 정보가 없습니다' });
  if (!TOSS_SECRET_KEY) return res.status(500).json({ error: '결제 설정 오류 (TOSS_SECRET_KEY 미설정)' });

  const { reason, items: requestedItems } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: '환불 사유를 입력해주세요' });
  if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
    return res.status(400).json({ error: '환불할 품목을 선택해주세요' });
  }

  const orderItems = await knex('purchase_order_items').where({ order_id: order.id });
  const itemsById = new Map(orderItems.map(i => [i.id, i]));

  let refundAmount = 0;
  const toApply = [];
  for (const req_item of requestedItems) {
    const item = itemsById.get(Number(req_item.item_id));
    if (!item) return res.status(400).json({ error: '품목 정보가 올바르지 않습니다' });
    const maxQty = (item.confirmed_quantity ?? item.quantity) - (item.refunded_quantity || 0);
    const qty = Number(req_item.quantity);
    if (!qty || qty <= 0 || qty > maxQty + 1e-6) {
      return res.status(400).json({ error: `${item.product_name}의 환불 수량이 올바르지 않습니다 (환불 가능: ${maxQty})` });
    }
    refundAmount += item.unit_price * qty;
    toApply.push({ item, qty });
  }
  refundAmount = Math.round(refundAmount);

  const totalAmount = Math.round(order.confirmed_amount ?? order.total_amount);
  const alreadyRefunded = Math.round(order.refunded_amount || 0);
  const remaining = totalAmount - alreadyRefunded;
  if (refundAmount <= 0 || refundAmount > remaining) {
    return res.status(400).json({ error: `환불 금액이 올바르지 않습니다 (남은 환불 가능 금액: ${remaining.toLocaleString()}원)` });
  }

  const authHeader = 'Basic ' + Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
  const tossRes = await fetch(`${TOSS_API_BASE}/${order.toss_payment_key}/cancel`, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cancelReason: reason, cancelAmount: refundAmount }),
  });
  const result = await tossRes.json();
  if (!tossRes.ok) {
    return res.status(tossRes.status).json({ error: result.message || '환불 처리 실패', code: result.code });
  }

  const newRefunded = alreadyRefunded + refundAmount;
  const isFull = newRefunded >= totalAmount;
  const next = { refunded_amount: newRefunded };
  if (isFull) { next.status = 'CANCELED'; next.stock_reversed = true; }

  // 재고 반영 + 환불수량 누적 + 주문 갱신을 한 트랜잭션으로 묶어 중간에 실패해도 일부만 반영되는 불일치를 막음
  await knex.transaction(async (trx) => {
    // 납품완료된 발주서만 실제로 입고된 재고가 있으므로, 환불된 품목만큼만 재고를 되돌림
    if (order.status === 'DELIVERED') {
      for (const { item, qty } of toApply) await applyItemStock(order, item, qty, -1, trx);
    }
    for (const { item, qty } of toApply) {
      await trx('purchase_order_items').where({ id: item.id }).increment('refunded_quantity', qty);
    }
    await trx('purchase_orders').where({ id: order.id }).update(next);
  });

  const itemSummary = toApply.map(({ item, qty }) => `${item.product_name} x${qty}`).join(', ');
  const label = isFull ? '전액 환불(품목단위)' : `부분 환불(품목단위, ${refundAmount.toLocaleString()}원)`;
  await logHistory(order.id, 'STATUS_CHANGE', { status: order.status }, { status: next.status || order.status },
    `${label}: ${itemSummary} — ${reason}`, req.user.id);
  await logAudit(req.user.brand_id, req.user.id, 'PAYMENT', order.id, isFull ? 'REFUND_FULL' : 'REFUND_PARTIAL',
    { refunded_amount: alreadyRefunded }, { refunded_amount: newRefunded, items: itemSummary, reason });

  res.json({ ok: true, order: result, refunded_amount: newRefunded, status: next.status || order.status });
});

// ── 발주서 취소 ───────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  const order = await knex('purchase_orders').where({ id: req.params.id, brand_id: req.user.brand_id }).first();
  if (!order) return res.status(404).json({ error: '없음' });
  if (isStoreRole(req.user.role) && order.store_id !== req.user.store_id) {
    return res.status(403).json({ error: '권한 없음' });
  }
  if (['PAID', 'SHIPPED', 'DELIVERED', 'CLOSED'].includes(order.status)) {
    return res.status(400).json({ error: '취소 불가 상태' });
  }
  await knex('purchase_orders').where({ id: order.id }).update({ status: 'CANCELED' });
  await logHistory(order.id, 'STATUS_CHANGE', { status: order.status }, { status: 'CANCELED' }, '취소', req.user.id);
  res.json({ ok: true });
});

// ── 토스페이먼츠 결제 상태 변경 웹훅 ───────────────────
// 토스 개발자센터에서 직접 취소하는 등, 우리 사이트를 거치지 않은 결제 변경 사항도 동기화한다.
// 웹훅 payload는 신뢰하지 않고 paymentKey로 토스 서버에 직접 조회해 받은 값만 반영한다.
router.post('/toss-webhook', async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);

    // 토스페이먼츠 웹훅은 서명 헤더를 보내지 않으므로 별도 서명 검증은 하지 않는다.
    // 대신 payload는 신뢰하지 않고, paymentKey로 토스 서버에 직접 재조회해 받은 값만 반영한다.
    const payload = JSON.parse(rawBody);
    const paymentKey = payload?.data?.paymentKey || payload?.paymentKey;
    console.log('[토스 웹훅] 수신:', payload?.eventType, paymentKey);
    if (!paymentKey || !TOSS_SECRET_KEY) { console.log('[토스 웹훅] paymentKey 또는 TOSS_SECRET_KEY 없음'); return res.sendStatus(200); }

    const order = await knex('purchase_orders').where({ toss_payment_key: paymentKey }).first();
    if (!order) { console.log('[토스 웹훅] 일치하는 주문 없음:', paymentKey); return res.sendStatus(200); }

    const authHeader = 'Basic ' + Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
    const tossRes = await fetch(`${TOSS_API_BASE}/${paymentKey}`, { headers: { Authorization: authHeader } });
    if (!tossRes.ok) { console.log('[토스 웹훅] 토스 재조회 실패:', tossRes.status, await tossRes.text()); return res.sendStatus(200); }
    const payment = await tossRes.json();
    console.log('[토스 웹훅] 토스 재조회 결과:', payment.status, payment.totalAmount, payment.balanceAmount);

    const refundedAmount = Math.round((payment.totalAmount || 0) - (payment.balanceAmount ?? payment.totalAmount));
    if (refundedAmount === Math.round(order.refunded_amount || 0)) { console.log('[토스 웹훅] 변경 없음, order_id:', order.id); return res.sendStatus(200); }

    const isFull = (payment.balanceAmount ?? 0) <= 0 || payment.status === 'CANCELED';
    console.log('[토스 웹훅] 동기화 진행: order_id', order.id, 'refundedAmount', refundedAmount, 'isFull', isFull);

    const next = { refunded_amount: refundedAmount };
    if (isFull) next.status = 'CANCELED';
    await knex.transaction(async (trx) => {
      if (isFull && order.status === 'DELIVERED' && !order.stock_reversed) {
        const claimed = await trx('purchase_orders').where({ id: order.id, stock_reversed: false }).update({ stock_reversed: true });
        if (claimed) await applyDeliveryStock(order, -1, trx);
      }
      await trx('purchase_orders').where({ id: order.id }).update(next);
    });
    await logHistory(order.id, 'STATUS_CHANGE', { status: order.status }, { status: next.status || order.status },
      '토스 대시보드에서 직접 취소 (웹훅 동기화)', null);
    await logAudit(order.brand_id, null, 'PAYMENT', order.id, 'REFUND_SYNC',
      { refunded_amount: order.refunded_amount || 0 }, { refunded_amount: refundedAmount });
    console.log('[토스 웹훅] 동기화 완료: order_id', order.id);

    res.sendStatus(200);
  } catch (err) {
    console.error('[토스 웹훅] 처리 오류:', err.message);
    res.sendStatus(200); // 토스 쪽 재시도 폭주 방지
  }
});

module.exports = router;
