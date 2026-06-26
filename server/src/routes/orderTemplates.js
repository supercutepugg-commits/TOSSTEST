const createAsyncRouter = require('../middleware/asyncRouter');
const router = createAsyncRouter();
const { knex } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');

// 정기 발주 템플릿 — 매주 거의 같은 품목을 발주하는 가맹점이 매번 장바구니를 새로 채우지 않고
// 저장해둔 구성을 한 번에 불러올 수 있게 함 (가맹점별로만 저장/조회)
router.get('/', requireAuth, async (req, res) => {
  if (!req.user.store_id) return res.json([]);
  const rows = await knex('order_templates')
    .where({ brand_id: req.user.brand_id, store_id: req.user.store_id })
    .orderBy('created_at', 'desc');
  res.json(rows.map(r => ({ ...r, items: JSON.parse(r.items) })));
});

router.post('/', requireAuth, async (req, res) => {
  if (!req.user.store_id) return res.status(400).json({ error: '가맹점 정보 없음' });
  const { name, items } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '템플릿 이름을 입력해주세요' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: '담을 상품이 없습니다' });
  const [{ id }] = await knex('order_templates').insert({
    brand_id: req.user.brand_id, store_id: req.user.store_id,
    name: name.trim(), items: JSON.stringify(items),
  }).returning('id');
  res.json({ id });
});

router.delete('/:id', requireAuth, async (req, res) => {
  if (!req.user.store_id) return res.status(400).json({ error: '가맹점 정보 없음' });
  await knex('order_templates').where({ id: req.params.id, brand_id: req.user.brand_id, store_id: req.user.store_id }).delete();
  res.json({ ok: true });
});

module.exports = router;
