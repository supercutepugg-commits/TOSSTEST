const createAsyncRouter = require('../middleware/asyncRouter');
const router = createAsyncRouter();
const { knex } = require('../db/schema');
const { requireAuth, requireRole, HQ_ROLES } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  const products = await knex('products')
    .where({ brand_id: req.user.brand_id, is_active: true })
    .orderBy('name');
  res.json(products);
});

router.post('/', requireAuth, requireRole(...HQ_ROLES), async (req, res) => {
  const { name, unit, unit_conversion, base_unit, price, ingredient_id } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '상품명을 입력해주세요' });
  const [{ id }] = await knex('products').insert({
    brand_id: req.user.brand_id,
    name, unit, unit_conversion: unit_conversion || 1,
    base_unit: base_unit || unit, price: price || 0,
    ingredient_id: ingredient_id || null,
  }).returning('id');
  res.json({ id });
});

router.put('/:id', requireAuth, requireRole(...HQ_ROLES), async (req, res) => {
  const existing = await knex('products').where({ id: req.params.id, brand_id: req.user.brand_id }).first();
  if (!existing) return res.status(404).json({ error: '없음' });
  const { name, unit, unit_conversion, base_unit, price, ingredient_id, is_active } = req.body;
  if (name !== undefined && !name.trim()) return res.status(400).json({ error: '상품명을 입력해주세요' });
  await knex('products').where({ id: req.params.id, brand_id: req.user.brand_id })
    .update({
      name: name ?? existing.name,
      unit: unit ?? existing.unit,
      unit_conversion: unit_conversion ?? existing.unit_conversion,
      base_unit: base_unit ?? existing.base_unit,
      price: price ?? existing.price,
      ingredient_id: ingredient_id !== undefined ? ingredient_id : existing.ingredient_id,
      is_active: is_active !== undefined ? is_active : existing.is_active,
    });
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, requireRole(...HQ_ROLES), async (req, res) => {
  await knex('products').where({ id: req.params.id, brand_id: req.user.brand_id })
    .update({ is_active: false });
  res.json({ ok: true });
});

module.exports = router;
