const createAsyncRouter = require('../middleware/asyncRouter');
const router = createAsyncRouter();
const { knex } = require('../db/schema');
const { requireAuth, requireRole, HQ_ROLES, LOGISTICS_ROLES, ADMIN_ROLES } = require('../middleware/auth');
const { logAudit } = require('../auditLog');
const { getIngredientComparison } = require('./api');

function isStoreRole(role) {
  return ['STORE_OWNER', 'STORE_STAFF'].includes(role);
}

router.get('/', requireAuth, async (req, res) => {
  const products = await knex('products')
    .where({ brand_id: req.user.brand_id, is_active: true })
    .orderBy('name');
  res.json(products);
});

// 추천 발주량: 최근 7일 판매량 × 레시피 사용량으로 예상 소진량을 구하고, 현재 재고와 비교해서
// "한 발주 주기 동안 더 필요할 것으로 보이는 양"을 상품(발주단위) 기준으로 환산해 보여준다.
// 사입이상모니터링에서 쓰는 것과 같은 추정 로직(getIngredientComparison)을 재사용한다.
router.get('/recommendations', requireAuth, async (req, res) => {
  const store_id = isStoreRole(req.user.role) ? req.user.store_id : Number(req.query.store_id);
  if (!store_id) return res.json({});

  const toISO = new Date().toISOString();
  const fromISO = new Date(Date.now() - 7 * 86400000).toISOString();
  const comparison = await getIngredientComparison(req.user.brand_id, store_id, fromISO, toISO);
  const estimatedByName = Object.fromEntries(comparison.map(c => [c.name, c.estimated]));

  const products = await knex('products').where({ brand_id: req.user.brand_id, is_active: true });
  const baseIngredients = await knex('ingredients')
    .whereIn('id', products.map(p => p.ingredient_id).filter(Boolean));
  const baseNameById = Object.fromEntries(baseIngredients.map(i => [i.id, i.name]));

  const storeIngredients = await knex('ingredients').where({ brand_id: req.user.brand_id, store_id });
  const stockByName = Object.fromEntries(storeIngredients.map(i => [i.name, i.stock || 0]));

  const result = {};
  for (const p of products) {
    const ingName = p.ingredient_id ? baseNameById[p.ingredient_id] : p.name;
    if (!ingName) continue;
    const estimated = estimatedByName[ingName];
    if (estimated === undefined) continue; // 최근 7일간 판매 실적이 없는 메뉴 재료는 추천하지 않음
    const currentStock = stockByName[ingName] || 0;
    const neededBase = Math.max(0, estimated - currentStock);
    const recommendedQty = Math.ceil(neededBase / (p.unit_conversion || 1));
    if (recommendedQty > 0) result[p.id] = recommendedQty;
  }
  res.json(result);
});

router.post('/', requireAuth, requireRole(...LOGISTICS_ROLES), async (req, res) => {
  const { name, unit, unit_conversion, base_unit, price, ingredient_id, category } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '상품명을 입력해주세요' });
  if (price !== undefined && (Number(price) < 0 || !Number.isFinite(Number(price)))) {
    return res.status(400).json({ error: '가격은 0 이상의 값이어야 합니다' });
  }
  // 이름이 같은 상품이 있으면 발주서 납품 시 재고 반영(이름 매칭)이 어느 쪽 상품인지 혼동될 수 있음
  const dup = await knex('products').where({ brand_id: req.user.brand_id, name: name.trim(), is_active: true }).first();
  if (dup) return res.status(400).json({ error: '같은 이름의 상품이 이미 있습니다' });
  const [{ id }] = await knex('products').insert({
    brand_id: req.user.brand_id,
    name: name.trim(), unit, unit_conversion: unit_conversion || 1,
    base_unit: base_unit || unit, price: price || 0,
    ingredient_id: ingredient_id || null,
    category: category ? category.trim() : null,
  }).returning('id');
  await logAudit(req.user.brand_id, req.user.id, 'PRODUCT', id, 'CREATE', null, req.body);
  res.json({ id });
});

router.put('/:id', requireAuth, requireRole(...LOGISTICS_ROLES), async (req, res) => {
  const existing = await knex('products').where({ id: req.params.id, brand_id: req.user.brand_id }).first();
  if (!existing) return res.status(404).json({ error: '없음' });
  const { name, unit, unit_conversion, base_unit, price, ingredient_id, is_active, category } = req.body;
  if (name !== undefined && !name.trim()) return res.status(400).json({ error: '상품명을 입력해주세요' });
  if (price !== undefined && (Number(price) < 0 || !Number.isFinite(Number(price)))) {
    return res.status(400).json({ error: '가격은 0 이상의 값이어야 합니다' });
  }
  if (name && name.trim() !== existing.name) {
    const dup = await knex('products').where({ brand_id: req.user.brand_id, name: name.trim(), is_active: true })
      .whereNot('id', existing.id).first();
    if (dup) return res.status(400).json({ error: '같은 이름의 상품이 이미 있습니다' });
  }
  const next = {
    name: name !== undefined ? name.trim() : existing.name,
    unit: unit ?? existing.unit,
    unit_conversion: unit_conversion ?? existing.unit_conversion,
    base_unit: base_unit ?? existing.base_unit,
    price: price ?? existing.price,
    ingredient_id: ingredient_id !== undefined ? ingredient_id : existing.ingredient_id,
    is_active: is_active !== undefined ? is_active : existing.is_active,
    category: category !== undefined ? (category ? category.trim() : null) : existing.category,
  };
  await knex('products').where({ id: req.params.id, brand_id: req.user.brand_id }).update(next);
  if (next.price !== existing.price) {
    await logAudit(req.user.brand_id, req.user.id, 'PRODUCT', existing.id, 'UPDATE', { price: existing.price }, { price: next.price });
  }
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, requireRole(...LOGISTICS_ROLES), async (req, res) => {
  await knex('products').where({ id: req.params.id, brand_id: req.user.brand_id })
    .update({ is_active: false });
  await logAudit(req.user.brand_id, req.user.id, 'PRODUCT', Number(req.params.id), 'DELETE', null, null);
  res.json({ ok: true });
});

module.exports = router;
