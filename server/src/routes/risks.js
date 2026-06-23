const createAsyncRouter = require('../middleware/asyncRouter');
const router = createAsyncRouter();
const { knex } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');

// 본사에서 설정 가능한 리스크 감지 기준값 (가맹점/브랜드별 1세트)
const DEFAULT_RISK_SETTINGS = {
  highWasteThreshold: 10000,   // 7일 폐기 합계가 이 값을 넘으면 경보 (재료 단위 기준)
  paymentOverdueDays: 2,       // 결제 확정 후 이 일수가 지나면 결제 미완료 경보
  salesDropRatio: 0.8,         // 최근 7일 판매건수가 이전 7일의 이 비율 미만이면 "매출 감소"로 간주
  orderSpikeRatio: 1.2,        // 최근 7일 발주금액이 이전 7일의 이 비율을 초과하면 "발주 증가"로 간주
  overPurchaseRatio: 2.0,      // 발주량이 예상 소진량의 이 배수를 초과하면 "과다 사입" 경보
};

async function getRiskSettings(brand_id) {
  const brand = await knex('brands').where({ id: brand_id }).first();
  let saved = {};
  try { saved = brand?.risk_settings ? JSON.parse(brand.risk_settings) : {}; } catch { saved = {}; }
  return { ...DEFAULT_RISK_SETTINGS, ...saved };
}

router.get('/settings', requireAuth, async (req, res) => {
  res.json(await getRiskSettings(req.user.brand_id));
});

router.put('/settings', requireAuth, async (req, res) => {
  if (!['SUPER_ADMIN', 'HQ_ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ error: '권한이 없습니다' });
  }
  const next = {};
  for (const key of Object.keys(DEFAULT_RISK_SETTINGS)) {
    const v = Number(req.body[key]);
    if (!Number.isFinite(v) || v < 0) return res.status(400).json({ error: `${key} 값이 올바르지 않습니다` });
    next[key] = v;
  }
  await knex('brands').where({ id: req.user.brand_id }).update({ risk_settings: JSON.stringify(next) });
  res.json(next);
});

router.get('/', requireAuth, async (req, res) => {
  const { status, severity, store_id } = req.query;
  const q = knex('risk_alerts as r')
    .leftJoin('stores as s', 'r.store_id', 's.id')
    .select('r.*', 's.name as store_name')
    .where('r.brand_id', req.user.brand_id)
    .orderBy('r.created_at', 'desc');
  if (status) q.where('r.status', status);
  if (severity) q.where('r.severity', severity);
  if (store_id) q.where('r.store_id', store_id);
  res.json(await q);
});

router.post('/:id/status', requireAuth, async (req, res) => {
  const { status, memo } = req.body;
  await knex('risk_alerts').where({ id: req.params.id, brand_id: req.user.brand_id }).update({
    status, memo,
    acknowledged_by: req.user.id,
  });
  res.json({ ok: true });
});

// 내부용: 리스크 생성 (배치/웹훅에서 호출)
async function createRisk(brand_id, store_id, type, severity, description, detail) {
  // 동일 타입·가맹점 OPEN 알림 중복 방지
  const existing = await knex('risk_alerts')
    .where({ brand_id, store_id, type, status: 'OPEN' }).first();
  if (existing) return;
  await knex('risk_alerts').insert({ brand_id, store_id, type, severity, description, detail: JSON.stringify(detail) });
}

// 폐기 과다 알림 체크 (가맹점 폐기 등록 후 호출)
async function checkHighWaste(brand_id, store_id) {
  const settings = await getRiskSettings(brand_id);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const rows = await knex('waste_logs')
    .where({ brand_id, store_id })
    .where('waste_date', '>=', sevenDaysAgo)
    .select('ingredient_name', 'unit')
    .sum('quantity as total')
    .groupBy('ingredient_name', 'unit');
  for (const row of rows) {
    if (row.total > settings.highWasteThreshold) {
      await createRisk(brand_id, store_id, 'HIGH_WASTE', 'HIGH',
        `폐기 과다: ${row.ingredient_name} 7일 합계 ${row.total}${row.unit}`,
        { ingredient_name: row.ingredient_name, total: row.total });
    }
  }
}

// 결제 미완료 알림 체크
async function checkPaymentOverdue(brand_id) {
  const settings = await getRiskSettings(brand_id);
  const cutoff = new Date(Date.now() - settings.paymentOverdueDays * 86400000).toISOString();
  const orders = await knex('purchase_orders')
    .where({ brand_id, status: 'PAYMENT_PENDING' })
    .where('confirmed_at', '<', cutoff);
  for (const o of orders) {
    await createRisk(brand_id, o.store_id, 'PAYMENT_OVERDUE', 'HIGH',
      `결제 미완료: 발주서 #${o.id} (확정 후 ${settings.paymentOverdueDays}일 경과)`,
      { order_id: o.id });
  }
}

module.exports = { router, createRisk, checkHighWaste, checkPaymentOverdue, getRiskSettings };
