const createAsyncRouter = require('../middleware/asyncRouter');
const router = createAsyncRouter();
const { knex } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');

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
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const rows = await knex('waste_logs')
    .where({ brand_id, store_id })
    .where('waste_date', '>=', sevenDaysAgo)
    .select('ingredient_name', 'unit')
    .sum('quantity as total')
    .groupBy('ingredient_name', 'unit');
  const HIGH_WASTE_THRESHOLD = 10000; // 7일 합계 10kg(또는 동일 단위 10000) 이상이면 경보
  for (const row of rows) {
    if (row.total > HIGH_WASTE_THRESHOLD) {
      await createRisk(brand_id, store_id, 'HIGH_WASTE', 'HIGH',
        `폐기 과다: ${row.ingredient_name} 7일 합계 ${row.total}${row.unit}`,
        { ingredient_name: row.ingredient_name, total: row.total });
    }
  }
}

// 결제 미완료 알림 체크
const PAYMENT_OVERDUE_DAYS = 2;
async function checkPaymentOverdue(brand_id) {
  const twoDaysAgo = new Date(Date.now() - PAYMENT_OVERDUE_DAYS * 86400000).toISOString();
  const orders = await knex('purchase_orders')
    .where({ brand_id, status: 'PAYMENT_PENDING' })
    .where('confirmed_at', '<', twoDaysAgo);
  for (const o of orders) {
    await createRisk(brand_id, o.store_id, 'PAYMENT_OVERDUE', 'HIGH',
      `결제 미완료: 발주서 #${o.id} (확정 후 2일 경과)`,
      { order_id: o.id });
  }
}

module.exports = { router, createRisk, checkHighWaste, checkPaymentOverdue };
