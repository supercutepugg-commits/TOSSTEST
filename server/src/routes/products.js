const createAsyncRouter = require('../middleware/asyncRouter');
const router = createAsyncRouter();
const { knex } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  const products = await knex('products')
    .where({ brand_id: req.user.brand_id, is_active: true })
    .orderBy('name');
  res.json(products);
});

router.post('/', requireAuth, async (req, res) => {
  const { name, unit, unit_conversion, base_unit, price, ingredient_id } = req.body;
  const [{ id }] = await knex('products').insert({
    brand_id: req.user.brand_id,
    name, unit, unit_conversion: unit_conversion || 1,
    base_unit: base_unit || unit, price: price || 0,
    ingredient_id: ingredient_id || null,
  }).returning('id');
  res.json({ id });
});

router.put('/:id', requireAuth, async (req, res) => {
  const { name, unit, unit_conversion, base_unit, price, ingredient_id, is_active } = req.body;
  await knex('products').where({ id: req.params.id, brand_id: req.user.brand_id })
    .update({ name, unit, unit_conversion, base_unit, price, ingredient_id, is_active });
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, async (req, res) => {
  await knex('products').where({ id: req.params.id, brand_id: req.user.brand_id })
    .update({ is_active: false });
  res.json({ ok: true });
});

module.exports = router;
