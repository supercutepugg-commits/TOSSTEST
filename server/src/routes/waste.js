const createAsyncRouter = require('../middleware/asyncRouter');
const router = createAsyncRouter();
const { knex } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { checkHighWaste } = require('./risks');

function isStoreRole(role) {
  return ['STORE_OWNER', 'STORE_STAFF'].includes(role);
}

router.get('/', requireAuth, async (req, res) => {
  const { store_id, from, to } = req.query;
  const q = knex('waste_logs as w')
    .join('stores as s', 'w.store_id', 's.id')
    .select('w.*', 's.name as store_name')
    .where('w.brand_id', req.user.brand_id)
    .orderBy('w.waste_date', 'desc');
  // 가맹점 역할은 쿼리파라미터로 다른 가맹점을 조회할 수 없도록 강제
  if (isStoreRole(req.user.role)) q.where('w.store_id', req.user.store_id);
  else if (store_id) q.where('w.store_id', store_id);
  if (from) q.where('w.waste_date', '>=', from);
  if (to) q.where('w.waste_date', '<=', to);
  res.json(await q);
});

router.post('/', requireAuth, async (req, res) => {
  const { waste_date, ingredient_id, ingredient_name, quantity, unit, reason, memo } = req.body;
  const store_id = req.user.store_id;
  if (!store_id) return res.status(400).json({ error: '가맹점 정보 없음' });

  let ingredient = null;
  if (ingredient_id) {
    ingredient = await knex('ingredients').where({ id: ingredient_id, brand_id: req.user.brand_id, store_id }).first();
    if (!ingredient) return res.status(400).json({ error: '해당 가맹점의 재료가 아닙니다' });
  }

  const [{ id }] = await knex('waste_logs').insert({
    brand_id: req.user.brand_id,
    store_id, ingredient_id: ingredient_id || null,
    ingredient_name, quantity, unit, reason, memo,
    waste_date, created_by: req.user.id,
  }).returning('id');

  // 재고 차감
  if (ingredient) {
    await knex('ingredients').where({ id: ingredient.id }).decrement('stock', Number(quantity));
  }

  // 폐기 과다 리스크 체크 (비동기 - 응답 블록 안함)
  checkHighWaste(req.user.brand_id, store_id).catch(() => {});

  res.json({ id });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const log = await knex('waste_logs').where({ id: req.params.id, brand_id: req.user.brand_id }).first();
  if (!log) return res.status(404).json({ error: '없음' });
  if (isStoreRole(req.user.role) && log.store_id !== req.user.store_id) {
    return res.status(403).json({ error: '권한 없음' });
  }
  await knex('waste_logs').where({ id: log.id }).delete();
  res.json({ ok: true });
});

// 본사 집계
router.get('/summary', requireAuth, async (req, res) => {
  const { from, to } = req.query;
  const q = knex('waste_logs as w')
    .join('stores as s', 'w.store_id', 's.id')
    .select('s.name as store_name', 'w.ingredient_name', 'w.unit', 'w.reason')
    .sum('w.quantity as total_quantity')
    .where('w.brand_id', req.user.brand_id)
    .groupBy('w.store_id', 'w.ingredient_name', 'w.unit', 'w.reason')
    .orderBy('total_quantity', 'desc');
  if (from) q.where('w.waste_date', '>=', from);
  if (to) q.where('w.waste_date', '<=', to);
  res.json(await q);
});

module.exports = router;
