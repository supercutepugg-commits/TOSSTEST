const createAsyncRouter = require('../middleware/asyncRouter');
const router = createAsyncRouter();
const { knex } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { logStockMovement } = require('../stockLedger');

function isStoreRole(role) {
  return ['STORE_OWNER', 'STORE_STAFF'].includes(role);
}

// 가맹점이 쓸 수 있는 store_id 결정 — 가맹점 역할은 본인 매장으로 강제, 본사는 쿼리파라미터로 지정
function resolveStoreId(req) {
  if (isStoreRole(req.user.role)) return req.user.store_id || null;
  return req.query.store_id ? Number(req.query.store_id) : null;
}

// ── 실사 재고 조정 ────────────────────────────────────
router.get('/adjustments', requireAuth, async (req, res) => {
  const storeId = resolveStoreId(req);
  if (!storeId) return res.json([]);
  const rows = await knex('stock_adjustments as a')
    .join('ingredients as i', 'a.ingredient_id', 'i.id')
    .leftJoin('users as u', 'a.created_by', 'u.id')
    .select('a.*', 'i.name as ingredient_name', 'i.unit', 'u.name as created_by_name')
    .where({ 'a.brand_id': req.user.brand_id, 'a.store_id': storeId })
    .orderBy('a.created_at', 'desc')
    .limit(100);
  res.json(rows);
});

router.post('/adjustments', requireAuth, async (req, res) => {
  const storeId = isStoreRole(req.user.role) ? req.user.store_id : req.body.store_id;
  if (!storeId) return res.status(400).json({ error: '가맹점을 지정해주세요' });
  const { ingredient_id, counted_stock, memo } = req.body;
  const counted = Number(counted_stock);
  if (!Number.isFinite(counted) || counted < 0) {
    return res.status(400).json({ error: '실사 수량은 0 이상이어야 합니다' });
  }
  const ingredient = await knex('ingredients').where({ id: ingredient_id, brand_id: req.user.brand_id, store_id: storeId }).first();
  if (!ingredient) return res.status(400).json({ error: '해당 가맹점의 재료가 아닙니다' });

  const before = ingredient.stock || 0;
  const diff = counted - before;
  const id = await knex.transaction(async (trx) => {
    await trx('ingredients').where({ id: ingredient.id }).update({ stock: counted });
    const [{ id: adjId }] = await trx('stock_adjustments').insert({
      brand_id: req.user.brand_id, store_id: storeId, ingredient_id: ingredient.id,
      before_stock: before, counted_stock: counted, diff,
      memo: memo || null, created_by: req.user.id,
    }).returning('id');
    if (diff !== 0) {
      await logStockMovement(trx, {
        brand_id: req.user.brand_id, store_id: storeId, ingredient_id: ingredient.id,
        type: 'ADJUSTMENT', delta: diff, before_stock: before, after_stock: counted,
        memo: memo || null, ref_type: 'stock_adjustment', ref_id: adjId, created_by: req.user.id,
      });
    }
    return adjId;
  });
  res.json({ id, diff });
});

// ── 상품별 거래 수불 ──────────────────────────────────
router.get('/ledger', requireAuth, async (req, res) => {
  const storeId = resolveStoreId(req);
  if (!storeId) return res.json([]);
  const { ingredient_id, from, to } = req.query;
  const q = knex('stock_ledger as l')
    .join('ingredients as i', 'l.ingredient_id', 'i.id')
    .leftJoin('users as u', 'l.created_by', 'u.id')
    .select('l.*', 'i.name as ingredient_name', 'i.unit', 'u.name as created_by_name')
    .where({ 'l.brand_id': req.user.brand_id, 'l.store_id': storeId })
    .orderBy('l.created_at', 'desc')
    .limit(500);
  if (ingredient_id) q.where('l.ingredient_id', ingredient_id);
  if (from) q.where('l.created_at', '>=', from);
  if (to) q.where('l.created_at', '<=', to + ' 23:59:59');
  res.json(await q);
});

module.exports = router;
