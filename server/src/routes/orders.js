const createAsyncRouter = require('../middleware/asyncRouter');
const router = createAsyncRouter();
const { knex } = require('../db/schema');
const { requireAuth, requireRole, HQ_ROLES, LOGISTICS_ROLES, ADMIN_ROLES } = require('../middleware/auth');

function isStoreRole(role) {
  return ['STORE_OWNER', 'STORE_STAFF'].includes(role);
}
const { createRisk, getRiskSettings } = require('./risks');
const { logAudit } = require('../auditLog');
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
  const { items, memo, submit } = req.body;
  const store_id = req.user.store_id;
  if (!store_id) return res.status(400).json({ error: '가맹점 정보 없음' });

  const total = items.reduce((s, i) => s + (i.unit_price * i.quantity), 0);
  const status = submit ? 'ORDERED' : 'DRAFT';

  const [{ id }] = await knex('purchase_orders').insert({
    brand_id: req.user.brand_id,
    store_id,
    created_by: req.user.id,
    status, total_amount: total, memo,
    ordered_at: submit ? new Date().toISOString() : null,
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
router.post('/:id/status', requireAuth, requireRole(...LOGISTICS_ROLES), async (req, res) => {
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
  if (status === 'DELIVERED') await applyDeliveryStock(order, 1);

  res.json({ ok: true });
});

// sign: 1 = 납품 완료(입고), -1 = 환불로 인한 입고 취소
async function applyDeliveryStock(order, sign) {
  const items = await knex('purchase_order_items').where({ order_id: order.id });
  for (const item of items) {
    if (!item.product_id) continue;
    const product = await knex('products').where({ id: item.product_id }).first();
    if (!product) continue;
    const qty = item.confirmed_quantity ?? item.quantity;
    const delta = sign * qty * (product.unit_conversion || 1);

    if (product.ingredient_id) {
      // 브랜드 공통(또는 다른 가맹점) ingredient 원본
      const base = await knex('ingredients').where({ id: product.ingredient_id }).first();
      if (base) {
        const baseName = base.name || product.name;
        if (!baseName) continue; // 이름을 알 수 없으면 빈 이름 재료를 만들지 않고 건너뜀
        // 해당 가맹점에 같은 이름의 ingredient가 이미 있는지 확인 (id는 매번 새로 생성되므로 이름으로 매칭)
        let ing = await knex('ingredients')
          .where({ brand_id: base.brand_id, store_id: order.store_id, name: baseName }).first();

        if (!ing) {
          if (sign < 0) continue; // 환불 시 재료가 없으면 만들지 않음
          const [{ id: newId }] = await knex('ingredients').insert({
            brand_id: base.brand_id,
            store_id: order.store_id,
            name: baseName,
            unit: base.unit,
            stock: 0,
            threshold: base.threshold || 0,
          }).returning('id');
          ing = { id: newId };
        }
        const next = sign < 0 ? Math.max(0, (ing.stock || 0) + delta) : null;
        if (sign < 0) await knex('ingredients').where({ id: ing.id }).update({ stock: next });
        else await knex('ingredients').where({ id: ing.id }).increment('stock', delta);
      }
    } else {
      // ingredient 미연결 — 상품명으로 가맹점 재료 자동 생성
      const ingName = item.product_name || product.name;
      if (!ingName) continue; // 이름을 알 수 없으면 빈 이름 재료를 만들지 않고 건너뜀
      let ing = await knex('ingredients')
        .where({ brand_id: order.brand_id, store_id: order.store_id, name: ingName }).first();
      if (!ing) {
        if (sign < 0) continue;
        const [{ id: newId }] = await knex('ingredients').insert({
          brand_id: order.brand_id,
          store_id: order.store_id,
          name: ingName,
          unit: product.base_unit || product.unit || '개',
          stock: 0,
          threshold: 0,
        }).returning('id');
        ing = { id: newId };
      }
      const next = sign < 0 ? Math.max(0, (ing.stock || 0) + delta) : null;
      if (sign < 0) await knex('ingredients').where({ id: ing.id }).update({ stock: next });
      else await knex('ingredients').where({ id: ing.id }).increment('stock', delta);
    }
  }
}

// ── 본사 수량 수정 / 품절 / 대체상품 ─────────────────
router.put('/:id/items/:itemId', requireAuth, requireRole(...LOGISTICS_ROLES), async (req, res) => {
  const order = await knex('purchase_orders').where({ id: req.params.id, brand_id: req.user.brand_id }).first();
  if (!order) return res.status(404).json({ error: '없음' });
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

  if (isFull && order.status === 'DELIVERED' && !order.stock_reversed) {
    await applyDeliveryStock(order, -1);
  }

  const next = { refunded_amount: newRefunded };
  if (isFull) next.stock_reversed = order.status === 'DELIVERED' ? true : order.stock_reversed;
  if (isFull) next.status = 'CANCELED';
  await knex('purchase_orders').where({ id: order.id }).update(next);

  const label = isFull ? '전액 환불' : `부분 환불 (${refundAmount.toLocaleString()}원)`;
  await logHistory(order.id, 'STATUS_CHANGE', { status: order.status }, { status: next.status || order.status }, `${label}: ${reason}`, req.user.id);
  await logAudit(req.user.brand_id, req.user.id, 'PAYMENT', order.id, isFull ? 'REFUND_FULL' : 'REFUND_PARTIAL',
    { refunded_amount: alreadyRefunded }, { refunded_amount: newRefunded, reason });

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

    // 서명 검증 (토스플레이스 웹훅과 동일한 방식: HMAC-SHA256("<timestamp>.<rawBody>") → hex → "v1=" 접두사)
    const secret = process.env.TOSS_PAYMENT_WEBHOOK_SECRET;
    if (secret) {
      const signature = req.headers['x-toss-signature'] || '';
      const timestamp = req.headers['x-toss-timestamp'] || '';
      if (!signature || !timestamp) return res.sendStatus(401);
      const tsNum = Number(timestamp);
      const tsMs = tsNum < 10_000_000_000 ? tsNum * 1000 : tsNum;
      if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) return res.sendStatus(401);
      const hmac = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
      const expected = `v1=${hmac}`;
      const sigBuf = Buffer.from(signature);
      const expectedBuf = Buffer.from(expected);
      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return res.sendStatus(401);
    }

    const payload = JSON.parse(rawBody);
    const paymentKey = payload?.data?.paymentKey || payload?.paymentKey;
    if (!paymentKey || !TOSS_SECRET_KEY) return res.sendStatus(200);

    const order = await knex('purchase_orders').where({ toss_payment_key: paymentKey }).first();
    if (!order) return res.sendStatus(200);

    const authHeader = 'Basic ' + Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
    const tossRes = await fetch(`${TOSS_API_BASE}/${paymentKey}`, { headers: { Authorization: authHeader } });
    if (!tossRes.ok) return res.sendStatus(200);
    const payment = await tossRes.json();

    const refundedAmount = Math.round((payment.totalAmount || 0) - (payment.balanceAmount ?? payment.totalAmount));
    if (refundedAmount === Math.round(order.refunded_amount || 0)) return res.sendStatus(200); // 변경 없음

    const isFull = (payment.balanceAmount ?? 0) <= 0 || payment.status === 'CANCELED';
    if (isFull && order.status === 'DELIVERED' && !order.stock_reversed) {
      await applyDeliveryStock(order, -1);
    }

    const next = { refunded_amount: refundedAmount };
    if (isFull) {
      next.status = 'CANCELED';
      next.stock_reversed = order.status === 'DELIVERED' ? true : order.stock_reversed;
    }
    await knex('purchase_orders').where({ id: order.id }).update(next);
    await logHistory(order.id, 'STATUS_CHANGE', { status: order.status }, { status: next.status || order.status },
      '토스 대시보드에서 직접 취소 (웹훅 동기화)', null);
    await logAudit(order.brand_id, null, 'PAYMENT', order.id, 'REFUND_SYNC',
      { refunded_amount: order.refunded_amount || 0 }, { refunded_amount: refundedAmount });

    res.sendStatus(200);
  } catch (err) {
    console.error('[토스 웹훅] 처리 오류:', err.message);
    res.sendStatus(200); // 토스 쪽 재시도 폭주 방지
  }
});

module.exports = router;
