const createAsyncRouter = require('../middleware/asyncRouter');
const router = createAsyncRouter();
const { knex, isProduction } = require('../db/schema');
const { requireAuth, requireRole, HQ_ROLES, LOGISTICS_ROLES, ADMIN_ROLES } = require('../middleware/auth');
const { logAudit } = require('../auditLog');
const { extractOrderFinance } = require('../orderFinance');

// ─── 브랜드 ───────────────────────────────────────────
router.get('/brands', requireAuth, async (req, res) => {
  if (req.user.role !== 'SUPER_ADMIN') return res.json([await knex('brands').where({ id: req.user.brand_id }).first()]);
  res.json(await knex('brands').orderBy('created_at'));
});

router.post('/brands', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  const { name, code } = req.body;
  const [{ id }] = await knex('brands').insert({ name, code }).returning('id');
  res.json({ id });
});

// ─── 가맹점 ───────────────────────────────────────────
router.get('/stores', requireAuth, requireRole(...HQ_ROLES), async (req, res) => {
  const stores = await knex('stores').where({ brand_id: req.user.brand_id }).orderBy('created_at');
  // 인증정보 평문은 SUPER_ADMIN/HQ_ADMIN에게만 노출, 나머지는 설정 여부만 전달
  const canSeeSecrets = ['SUPER_ADMIN', 'HQ_ADMIN'].includes(req.user.role);
  res.json(stores.map(s => {
    if (canSeeSecrets) return s;
    const { webhook_secret, toss_client_secret, ...rest } = s;
    return { ...rest, webhook_secret_set: !!webhook_secret, toss_client_secret_set: !!toss_client_secret };
  }));
});

router.post('/stores', requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  const { name, webhook_secret, toss_store_id, order_deadline, delivery_days, business_number, owner_name, phone, open_date, franchise_type, is_open, address } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '가맹점명을 입력해주세요' });
  const [{ id }] = await knex('stores').insert({
    brand_id: req.user.brand_id, name,
    webhook_secret: webhook_secret || '', toss_store_id: toss_store_id || '',
    order_deadline: order_deadline || null, delivery_days: delivery_days || null,
    business_number: business_number || null, owner_name: owner_name || null,
    phone: phone || null, open_date: open_date || null,
    franchise_type: franchise_type || null, is_open: is_open ?? true,
    address: address || null,
  }).returning('id');
  res.json({ id });
});

router.put('/stores/:id', requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  const existing = await knex('stores').where({ id: req.params.id, brand_id: req.user.brand_id }).first();
  if (!existing) return res.status(404).json({ error: '없음' });
  const { name, webhook_secret, toss_store_id, order_deadline, delivery_days, toss_client_id, toss_client_secret, business_number, owner_name, phone, open_date, franchise_type, is_open, address } = req.body;
  if (name !== undefined && !name.trim()) return res.status(400).json({ error: '가맹점명을 입력해주세요' });
  const next = {
    name: name ?? existing.name,
    webhook_secret: webhook_secret ?? existing.webhook_secret,
    toss_store_id: toss_store_id ?? existing.toss_store_id,
    order_deadline: order_deadline ?? existing.order_deadline,
    delivery_days: delivery_days ?? existing.delivery_days,
    toss_client_id: toss_client_id ?? existing.toss_client_id,
    toss_client_secret: toss_client_secret ?? existing.toss_client_secret,
    business_number: business_number ?? existing.business_number,
    owner_name: owner_name ?? existing.owner_name,
    phone: phone ?? existing.phone,
    open_date: open_date ?? existing.open_date,
    franchise_type: franchise_type ?? existing.franchise_type,
    is_open: is_open !== undefined ? is_open : existing.is_open,
    address: address ?? existing.address,
  };
  await knex('stores').where({ id: req.params.id, brand_id: req.user.brand_id }).update(next);
  await logAudit(req.user.brand_id, req.user.id, 'STORE', existing.id, 'UPDATE',
    { name: existing.name, is_open: existing.is_open, business_number: existing.business_number },
    { name: next.name, is_open: next.is_open, business_number: next.business_number });
  res.json({ ok: true });
});

router.delete('/stores/:id', requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  await knex('stores').where({ id: req.params.id, brand_id: req.user.brand_id }).delete();
  res.json({ ok: true });
});

// ─── 재료 ───────────────────────────────────────────
router.get('/ingredients', requireAuth, async (req, res) => {
  const { store_id } = req.query;
  // 가맹점 역할은 쿼리파라미터로 다른 가맹점을 조회할 수 없도록 강제
  const isStoreRole = ['STORE_OWNER', 'STORE_STAFF'].includes(req.user.role);
  if (isStoreRole && !req.user.store_id) return res.json([]); // 소속 가맹점이 없으면 전체 브랜드 데이터가 노출되지 않도록 빈 목록 반환
  const sid = isStoreRole ? req.user.store_id : (store_id || req.user.store_id);
  const q = knex('ingredients').where({ brand_id: req.user.brand_id }).orderBy('name');
  if (sid) {
    // 가맹점 전용 재료 + 같은 이름의 가맹점 전용이 없는 브랜드 공통 재료만 반환 (중복 제거)
    q.where(function () {
      this.where({ store_id: sid }).orWhere(function () {
        this.whereNull('store_id').whereNotIn('name',
          knex('ingredients').where({ brand_id: req.user.brand_id, store_id: sid }).select('name')
        );
      });
    });
  }
  res.json(await q);
});

router.post('/ingredients', requireAuth, requireRole(...LOGISTICS_ROLES), async (req, res) => {
  const { name, unit, stock, threshold, store_id, order_unit, order_unit_conversion } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '재료명을 입력해주세요' });
  if ((stock !== undefined && Number(stock) < 0) || (threshold !== undefined && Number(threshold) < 0)) {
    return res.status(400).json({ error: '재고와 알림 기준은 0 이상이어야 합니다' });
  }
  const [{ id }] = await knex('ingredients').insert({
    brand_id: req.user.brand_id,
    store_id: store_id || req.user.store_id,
    name, unit,
    stock: stock ?? 0,
    threshold: threshold ?? 0,
    order_unit: order_unit || null,
    order_unit_conversion: order_unit_conversion || null,
  }).returning('id');
  res.json({ id });
});

router.put('/ingredients/:id', requireAuth, requireRole(...LOGISTICS_ROLES), async (req, res) => {
  const existing = await knex('ingredients').where({ id: req.params.id, brand_id: req.user.brand_id }).first();
  if (!existing) return res.status(404).json({ error: '없음' });
  const { name, unit, stock, threshold, order_unit, order_unit_conversion, is_key } = req.body;
  if (name !== undefined && !name.trim()) return res.status(400).json({ error: '재료명을 입력해주세요' });
  if ((stock !== undefined && Number(stock) < 0) || (threshold !== undefined && Number(threshold) < 0)) {
    return res.status(400).json({ error: '재고와 알림 기준은 0 이상이어야 합니다' });
  }
  await knex('ingredients').where({ id: req.params.id, brand_id: req.user.brand_id })
    .update({
      name: name ?? existing.name,
      unit: unit ?? existing.unit,
      stock: stock ?? existing.stock,
      threshold: threshold ?? existing.threshold,
      order_unit: order_unit ?? existing.order_unit,
      order_unit_conversion: order_unit_conversion ?? existing.order_unit_conversion,
      is_key: is_key !== undefined ? (is_key ? 1 : 0) : existing.is_key,
    });
  res.json({ ok: true });
});

router.delete('/ingredients/:id', requireAuth, requireRole(...LOGISTICS_ROLES), async (req, res) => {
  await knex('ingredients').where({ id: req.params.id, brand_id: req.user.brand_id }).delete();
  res.json({ ok: true });
});

router.post('/ingredients/:id/restock', requireAuth, requireRole(...LOGISTICS_ROLES), async (req, res) => {
  const { amount } = req.body;
  await knex('ingredients').where({ id: req.params.id, brand_id: req.user.brand_id }).increment('stock', amount);
  res.json({ ok: true });
});

// ─── 메뉴 ───────────────────────────────────────────
router.get('/menus', requireAuth, async (req, res) => {
  const { store_id } = req.query;
  const isStoreRole = ['STORE_OWNER', 'STORE_STAFF'].includes(req.user.role);
  if (isStoreRole && !req.user.store_id) return res.json([]); // 소속 가맹점이 없으면 전체 브랜드 데이터가 노출되지 않도록 빈 목록 반환
  const sid = isStoreRole ? req.user.store_id : (store_id || req.user.store_id);
  const q = knex('menus').where({ brand_id: req.user.brand_id }).orderBy('name');
  if (sid) q.where({ store_id: sid });
  const menus = await q;
  const recipes = await knex('recipes')
    .join('ingredients', 'recipes.ingredient_id', 'ingredients.id')
    .select('recipes.*', 'ingredients.name as ingredient_name', 'ingredients.unit');
  res.json(menus.map(m => ({ ...m, recipes: recipes.filter(r => r.menu_id === m.id) })));
});

router.post('/menus', requireAuth, requireRole(...LOGISTICS_ROLES), async (req, res) => {
  const { name, toss_menu_id, store_id } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '메뉴명을 입력해주세요' });
  const [{ id }] = await knex('menus').insert({
    brand_id: req.user.brand_id,
    store_id: store_id || req.user.store_id,
    name, toss_menu_id: toss_menu_id || null,
  }).returning('id');
  res.json({ id });
});

router.put('/menus/:id', requireAuth, requireRole(...LOGISTICS_ROLES), async (req, res) => {
  const existing = await knex('menus').where({ id: req.params.id, brand_id: req.user.brand_id }).first();
  if (!existing) return res.status(404).json({ error: '없음' });
  const { name, toss_menu_id, is_active, is_key } = req.body;
  if (name !== undefined && !name.trim()) return res.status(400).json({ error: '메뉴명을 입력해주세요' });
  await knex('menus').where({ id: req.params.id, brand_id: req.user.brand_id }).update({
    name: name ?? existing.name,
    toss_menu_id: toss_menu_id ?? existing.toss_menu_id,
    is_active: is_active !== undefined ? is_active : existing.is_active,
    is_key: is_key !== undefined ? (is_key ? 1 : 0) : existing.is_key,
  });
  res.json({ ok: true });
});

router.delete('/menus/:id', requireAuth, requireRole(...LOGISTICS_ROLES), async (req, res) => {
  await knex('menus').where({ id: req.params.id, brand_id: req.user.brand_id }).delete();
  res.json({ ok: true });
});

// ─── 레시피 ──────────────────────────────────────────
router.post('/menus/:menuId/recipes', requireAuth, requireRole(...LOGISTICS_ROLES), async (req, res) => {
  const menu = await knex('menus').where({ id: req.params.menuId, brand_id: req.user.brand_id }).first();
  if (!menu) return res.status(404).json({ error: '없음' });
  const { ingredient_id, amount } = req.body;
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    // 0 이하 값은 예상 소진량 계산에서 비율이 null이 되어 과다사입 리스크 감지가 조용히 무력화되므로 차단
    return res.status(400).json({ error: '사용량은 0보다 큰 값이어야 합니다' });
  }
  const existing = await knex('recipes').where({ menu_id: req.params.menuId, ingredient_id }).first();
  const ing = await knex('ingredients').where({ id: ingredient_id, brand_id: req.user.brand_id }).first();
  if (!ing) return res.status(400).json({ error: '재료를 찾을 수 없습니다' });
  if (existing) {
    await knex('recipe_history').insert({ menu_id: req.params.menuId, ingredient_id, ingredient_name: ing?.name, old_amount: existing.amount, new_amount: amount, action: 'UPDATED', changed_by: req.user.id });
  } else {
    await knex('recipe_history').insert({ menu_id: req.params.menuId, ingredient_id, ingredient_name: ing?.name, old_amount: null, new_amount: amount, action: 'ADDED', changed_by: req.user.id });
  }
  await knex('recipes').insert({ menu_id: req.params.menuId, ingredient_id, amount }).onConflict(['menu_id', 'ingredient_id']).merge();
  res.json({ ok: true });
});

router.delete('/menus/:menuId/recipes/:ingredientId', requireAuth, requireRole(...LOGISTICS_ROLES), async (req, res) => {
  const menu = await knex('menus').where({ id: req.params.menuId, brand_id: req.user.brand_id }).first();
  if (!menu) return res.status(404).json({ error: '없음' });
  const existing = await knex('recipes').where({ menu_id: req.params.menuId, ingredient_id: req.params.ingredientId }).first();
  const ing = await knex('ingredients').where({ id: req.params.ingredientId }).first();
  if (existing) {
    await knex('recipe_history').insert({ menu_id: req.params.menuId, ingredient_id: req.params.ingredientId, ingredient_name: ing?.name, old_amount: existing.amount, new_amount: null, action: 'DELETED', changed_by: req.user.id });
  }
  await knex('recipes').where({ menu_id: req.params.menuId, ingredient_id: req.params.ingredientId }).delete();
  res.json({ ok: true });
});

router.get('/menus/:menuId/recipe-history', requireAuth, async (req, res) => {
  const rows = await knex('recipe_history as rh')
    .leftJoin('users as u', 'rh.changed_by', 'u.id')
    .select('rh.*', 'u.name as changed_by_name')
    .where('rh.menu_id', req.params.menuId)
    .orderBy('rh.created_at', 'desc')
    .limit(50);
  res.json(rows);
});

// ─── 대시보드 ─────────────────────────────────────────
router.get('/dashboard', requireAuth, async (req, res) => {
  const { store_id } = req.query;
  const isStoreRole = ['STORE_OWNER', 'STORE_STAFF'].includes(req.user.role);
  // 가맹점 역할 계정에 소속 가맹점이 없으면 브랜드 전체 데이터가 보이지 않도록 차단
  if (isStoreRole && !req.user.store_id) return res.status(400).json({ error: '소속 가맹점 정보가 없습니다. 관리자에게 문의해주세요' });
  const sid = isStoreRole ? req.user.store_id : (store_id || req.user.store_id);
  const brand_id = req.user.brand_id;

  const ingQ = knex('ingredients as i')
    .leftJoin('stores as s', 'i.store_id', 's.id')
    .select('i.*', 's.name as store_name')
    .where({ 'i.brand_id': brand_id }).whereRaw('i.stock <= i.threshold').orderByRaw('i.stock - i.threshold');
  if (sid) ingQ.where({ 'i.store_id': sid });
  const lowStock = await ingQ;

  const alertQ = knex('alert_log as a')
    .join('ingredients as i', 'a.ingredient_id', 'i.id')
    .select('a.*', 'i.name', 'i.unit')
    .where('a.brand_id', brand_id)
    .orderBy('a.sent_at', 'desc').limit(20);
  if (sid) alertQ.where('a.store_id', sid);
  const recentAlerts = await alertQ;

  const orderQ = knex('orders').where({ brand_id }).orderBy('processed_at', 'desc').limit(10);
  if (sid) orderQ.where({ store_id: sid });
  const recentOrders = await orderQ;

  // 리스크 알림 (OPEN) — 현재 선택된 가맹점 기준으로만 표시
  const riskQ = knex('risk_alerts as r')
    .leftJoin('stores as s', 'r.store_id', 's.id')
    .select('r.*', 's.name as store_name')
    .where({ 'r.brand_id': brand_id, 'r.status': 'OPEN' })
    .orderBy('r.created_at', 'desc').limit(10);
  if (sid) riskQ.where('r.store_id', sid);
  const risks = await riskQ;

  // 발주 현황
  const pendingOrders = await knex('purchase_orders')
    .where({ brand_id, status: 'ORDERED' }).count('id as cnt').first();
  const paymentPending = await knex('purchase_orders')
    .where({ brand_id, status: 'PAYMENT_PENDING' }).count('id as cnt').first();

  // 오늘 매출 (sales_items)
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayQ = knex('sales_items').where({ brand_id }).where('sold_at', '>=', todayStart.toISOString());
  if (sid) todayQ.where({ store_id: sid });
  const todayRow = await todayQ.sum('amount as total').first();
  const todayRevenue = Number(todayRow?.total || 0);

  // 일자별 매출/주문건수 집계 헬퍼 (특정 하루치)
  // 매출액/주문건수는 기존처럼 sales_items(메뉴별 판매)에서, 할인·순매출·NET매출·결제수단별 금액은
  // 주문 단위 chargePrice/payments를 정규화해 저장해둔 orders의 새 컬럼에서 집계 (결제완료 주문만)
  const dayStats = async (date) => {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);
    const q = knex('sales_items').where({ brand_id })
      .where('sold_at', '>=', start.toISOString()).where('sold_at', '<=', end.toISOString());
    if (sid) q.where({ store_id: sid });
    const row = await q.clone().sum('amount as revenue').first();
    const cnt = await q.clone().countDistinct('toss_order_id as cnt').first();

    const financeQ = knex('orders').where({ brand_id, order_state: 'COMPLETED' })
      .where('processed_at', '>=', start.toISOString()).where('processed_at', '<=', end.toISOString());
    if (sid) financeQ.where({ store_id: sid });
    const finance = await financeQ
      .sum({ discountAmount: 'discount_amount', totalAmount: 'total_amount', supplyAmount: 'supply_amount',
             cashAmount: 'cash_amount', cardAmount: 'card_amount', otherAmount: 'other_amount' }).first();

    return {
      revenue: Number(row?.revenue || 0), orderCount: Number(cnt?.cnt || 0),
      discountAmount: Number(finance?.discountAmount || 0),
      netAmount: Number(finance?.totalAmount || 0),
      supplyAmount: Number(finance?.supplyAmount || 0),
      cashAmount: Number(finance?.cashAmount || 0),
      cardAmount: Number(finance?.cardAmount || 0),
      otherAmount: Number(finance?.otherAmount || 0),
    };
  };

  const yesterday = new Date(Date.now() - 86400000);
  const sameWeekdayLastWeek = new Date(Date.now() - 7 * 86400000);
  const [todayStats, yesterdayStats, lastWeekStats] = await Promise.all([
    dayStats(new Date()), dayStats(yesterday), dayStats(sameWeekdayLastWeek),
  ]);

  // 최근 7일 일별 매출 통계
  const WEEKDAY_LABEL = ['일', '월', '화', '수', '목', '금', '토'];
  const weeklyStats = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const stats = await dayStats(d);
    weeklyStats.push({ date: d.toISOString().split('T')[0], weekday: WEEKDAY_LABEL[d.getDay()], ...stats });
  }

  res.json({
    lowStock, recentAlerts, recentOrders, risks,
    pendingOrders: pendingOrders.cnt, paymentPending: paymentPending.cnt, todayRevenue,
    salesComparison: { today: todayStats, yesterday: yesterdayStats, lastWeekSameDay: lastWeekStats },
    weeklyStats,
  });
});

// ─── 판매 분석 ────────────────────────────────────────
router.get('/analytics', requireAuth, async (req, res) => {
  const { store_id, from, to } = req.query;
  const isStoreRole = ['STORE_OWNER', 'STORE_STAFF'].includes(req.user.role);
  if (isStoreRole && !req.user.store_id) return res.status(400).json({ error: '소속 가맹점 정보가 없습니다. 관리자에게 문의해주세요' });
  const sid = isStoreRole ? req.user.store_id : (store_id ? Number(store_id) : req.user.store_id);
  const brand_id = req.user.brand_id;

  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
  const toISO = toDate.toISOString();
  const fromISO = fromDate.toISOString();

  // sales_items에서 메뉴별 판매량 집계
  const salesQ = knex('sales_items')
    .where({ brand_id })
    .where('sold_at', '>=', fromISO)
    .where('sold_at', '<=', toISO)
    .select('menu_name', 'toss_menu_id',
      knex.raw('SUM(quantity) as total_qty'),
      knex.raw('SUM(amount) as total_amount'),
      knex.raw('COUNT(DISTINCT toss_order_id) as order_count')
    )
    .groupBy('menu_name', 'toss_menu_id')
    .orderBy('total_qty', 'desc');
  if (sid) salesQ.where({ store_id: sid });
  const salesRows = await salesQ;

  // 매장별 일별 매출 (차트용) — sqlite는 strftime, postgres는 to_char로 날짜만 추출
  const dateExpr = isProduction ? "to_char(sold_at, 'YYYY-MM-DD')" : "strftime('%Y-%m-%d', sold_at)";
  const dailyQ = knex('sales_items')
    .where({ brand_id })
    .where('sold_at', '>=', fromISO)
    .where('sold_at', '<=', toISO)
    .select(
      knex.raw(`${dateExpr} as date`),
      'store_id',
      knex.raw('SUM(amount) as revenue'),
      knex.raw('SUM(quantity) as qty')
    )
    .groupByRaw(`${dateExpr}, store_id`)
    .orderBy('date');
  if (sid) dailyQ.where({ store_id: sid });
  const dailyRows = await dailyQ;

  // 메뉴 매칭 (레시피 연결용)
  const menus = await knex('menus').where({ brand_id }).select('id', 'name', 'toss_menu_id', 'is_key');
  const recipes = await knex('recipes')
    .join('ingredients', 'recipes.ingredient_id', 'ingredients.id')
    .select('recipes.menu_id', 'recipes.amount', 'ingredients.name as ing_name', 'ingredients.unit');

  const salesByMenu = salesRows.map(s => {
    const menu = menus.find(m => m.name === s.menu_name || (m.toss_menu_id && m.toss_menu_id === s.toss_menu_id));
    const menuRecipes = menu ? recipes.filter(r => r.menu_id === menu.id) : [];
    const soldQty = Number(s.total_qty);
    return {
      menu_id: menu?.id || null,
      menu_name: s.menu_name,
      is_key: menu?.is_key || false,
      sold_qty: soldQty,
      total_amount: Number(s.total_amount),
      order_count: Number(s.order_count),
      ingredients: menuRecipes.map(r => ({ name: r.ing_name, unit: r.unit, estimated_usage: r.amount * soldQty })),
    };
  });

  // 식자재별 예상 소진량
  const consumptionMap = {};
  for (const m of salesByMenu) {
    for (const ing of m.ingredients) {
      if (!consumptionMap[ing.name]) consumptionMap[ing.name] = { name: ing.name, unit: ing.unit, estimated: 0 };
      consumptionMap[ing.name].estimated += ing.estimated_usage;
    }
  }

  // 발주량 집계
  const orderedItemsQ = knex('purchase_order_items as poi')
    .join('purchase_orders as po', 'poi.order_id', 'po.id')
    .join('products as p', 'poi.product_id', 'p.id')
    .leftJoin('ingredients as i', 'p.ingredient_id', 'i.id')
    .where('po.brand_id', brand_id)
    .whereNotIn('po.status', ['DRAFT', 'CANCELED'])
    .where('po.created_at', '>=', fromISO)
    .where('po.created_at', '<=', toISO)
    .select('i.name as ing_name', 'i.unit as ing_unit', knex.raw('SUM(poi.quantity * p.unit_conversion) as total_ordered'))
    .groupBy('i.id');
  if (sid) orderedItemsQ.where('po.store_id', sid);
  const orderedItems = await orderedItemsQ;

  const comparison = Object.values(consumptionMap).map(c => {
    const ordered = orderedItems.find(o => o.ing_name === c.name);
    const totalOrdered = ordered ? Number(ordered.total_ordered) : 0;
    const ratio = c.estimated > 0 ? Math.round((totalOrdered / c.estimated) * 100) / 100 : null;
    return { ...c, total_ordered: totalOrdered, ratio };
  });

  // 과다 사입 리스크 자동 생성 — 본사가 설정한 배수 기준
  if (sid) {
    const { createRisk, getRiskSettings } = require('./risks');
    const settings = await getRiskSettings(brand_id);
    for (const c of comparison) {
      if (c.ratio !== null && c.ratio > settings.overPurchaseRatio && c.estimated > 0) {
        createRisk(brand_id, sid, 'OVER_PURCHASE', 'MEDIUM',
          `과다 사입 가능성: ${c.name} — 예상 소진 ${Math.round(c.estimated)}${c.unit} 대비 발주 ${Math.round(c.total_ordered)}${c.unit} (${c.ratio}배)`,
          { ingredient: c.name, estimated: c.estimated, ordered: c.total_ordered }
        ).catch(() => {});
      }
    }
  }

  res.json({ salesByMenu, dailyRevenue: dailyRows, comparison, period: { from: fromISO, to: toISO } });
});

// 가맹점 하나의 식자재별 "예상 소진 vs 실제 발주" 비교 (사입 이상 감지용, /analytics와 동일 로직)
async function getIngredientComparison(brand_id, store_id, fromISO, toISO) {
  const salesQ = knex('sales_items')
    .where({ brand_id, store_id })
    .where('sold_at', '>=', fromISO).where('sold_at', '<=', toISO)
    .select('menu_name', 'toss_menu_id', knex.raw('SUM(quantity) as total_qty'))
    .groupBy('menu_name', 'toss_menu_id');
  const salesRows = await salesQ;

  const menus = await knex('menus').where({ brand_id, store_id }).select('id', 'name', 'toss_menu_id');
  const recipes = await knex('recipes')
    .join('ingredients', 'recipes.ingredient_id', 'ingredients.id')
    .select('recipes.menu_id', 'recipes.amount', 'ingredients.name as ing_name', 'ingredients.unit');

  const consumptionMap = {};
  for (const row of salesRows) {
    const menu = menus.find(m => m.name === row.menu_name || (m.toss_menu_id && m.toss_menu_id === row.toss_menu_id));
    if (!menu) continue;
    const qty = Number(row.total_qty);
    for (const r of recipes.filter(r => r.menu_id === menu.id)) {
      if (!consumptionMap[r.ing_name]) consumptionMap[r.ing_name] = { name: r.ing_name, unit: r.unit, estimated: 0 };
      consumptionMap[r.ing_name].estimated += r.amount * qty;
    }
  }

  const orderedItems = await knex('purchase_order_items as poi')
    .join('purchase_orders as po', 'poi.order_id', 'po.id')
    .join('products as p', 'poi.product_id', 'p.id')
    .leftJoin('ingredients as i', 'p.ingredient_id', 'i.id')
    .where('po.brand_id', brand_id).where('po.store_id', store_id)
    .whereNotIn('po.status', ['DRAFT', 'CANCELED'])
    .where('po.created_at', '>=', fromISO).where('po.created_at', '<=', toISO)
    .select('i.name as ing_name', knex.raw('SUM(poi.quantity * p.unit_conversion) as total_ordered'))
    .groupBy('i.id');

  return Object.values(consumptionMap).map(c => {
    const ordered = orderedItems.find(o => o.ing_name === c.name);
    const totalOrdered = ordered ? Number(ordered.total_ordered) : 0;
    const ratio = c.estimated > 0 ? Math.round((totalOrdered / c.estimated) * 100) / 100 : null;
    return { ...c, total_ordered: totalOrdered, ratio };
  });
}

// ─── 가맹점별 사입 이상 모니터링 ────────────────────────
router.get('/purchase-anomalies', requireAuth, requireRole(...HQ_ROLES), async (req, res) => {
  const { from, to } = req.query;
  const brand_id = req.user.brand_id;
  const toISO = (to ? new Date(to) : new Date()).toISOString();
  const fromISO = (from ? new Date(from) : new Date(Date.now() - 30 * 86400000)).toISOString();
  const OVER_RATIO = 2.0, UNDER_RATIO = 0.7;

  const stores = await knex('stores').where({ brand_id }).select('id', 'name');

  const riskCounts = await knex('risk_alerts')
    .where({ brand_id, type: 'OVER_PURCHASE' })
    .where('created_at', '>=', fromISO).where('created_at', '<=', toISO)
    .select('store_id', knex.raw('COUNT(*) as cnt'))
    .groupBy('store_id');

  const result = [];
  for (const s of stores) {
    const comparison = await getIngredientComparison(brand_id, s.id, fromISO, toISO);
    const overItems = comparison.filter(c => c.ratio !== null && c.ratio > OVER_RATIO);
    const underItems = comparison.filter(c => c.ratio !== null && c.ratio < UNDER_RATIO);
    const riskRow = riskCounts.find(r => r.store_id === s.id);
    result.push({
      store_id: s.id, store_name: s.name,
      over_count: overItems.length, under_count: underItems.length,
      worst_over: overItems.sort((a, b) => b.ratio - a.ratio)[0] || null,
      risk_alert_count: riskRow ? Number(riskRow.cnt) : 0,
    });
  }
  result.sort((a, b) => (b.over_count + b.risk_alert_count) - (a.over_count + a.risk_alert_count));

  res.json({ anomalies: result, period: { from: fromISO, to: toISO } });
});

// ─── Toss Place 과거 데이터 동기화 ────────────────────
// 토스플레이스 API는 2022-01-01T00:00:00Z(UTC) 이전 시각을 from으로 보내면 400 에러를 반환함 (API 자체 제약)
const TOSS_PLACE_MIN_TS = Date.parse('2022-01-01T00:00:00Z');

async function syncStoreSales(store, fromDate, toDate) {
  const accessKey = process.env.TOSS_PLACE_ACCESS_KEY;
  const secretKey = process.env.TOSS_PLACE_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error('TOSS_PLACE_ACCESS_KEY / TOSS_PLACE_SECRET_KEY 환경변수가 설정되지 않았습니다');
  if (!store.toss_store_id) throw new Error('토스플레이스 매장 ID(toss_store_id)가 설정되지 않았습니다');

  const TOSS_BASE = process.env.TOSS_PLACE_API_URL || 'https://open-api.tossplace.com';
  // 날짜 문자열을 KST 자정 기준 epoch로 바꾼 뒤 UTC 기준 하한선과 비교해 보정해야
  // KST 기준 "2022-01-01"이 UTC로는 2021-12-31T15:00:00Z가 되어 다시 막히는 문제를 피할 수 있음
  let fromTs = new Date(fromDate + 'T00:00:00+09:00').getTime();
  if (fromTs < TOSS_PLACE_MIN_TS) fromTs = TOSS_PLACE_MIN_TS;
  const toTs   = new Date(toDate   + 'T23:59:59+09:00').getTime();

  let page = 1;
  let inserted = 0;

  while (true) {
    // docs.tossplace.com 기준 실제 엔드포인트
    const url = `${TOSS_BASE}/api-public/openapi/v1/merchants/${store.toss_store_id}/order/orders`
      + `?from=${fromTs}&to=${toTs}&page=${page}&size=100&orderStates=COMPLETED`;

    console.log(`[동기화] ${url}`);
    const resp = await fetch(url, { headers: { 'x-access-key': accessKey, 'x-secret-key': secretKey } });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Toss Place API 오류 (${resp.status}): ${txt}`);
    }

    const data = await resp.json();
    // 응답이 배열이거나 { orders: [...] } 구조 모두 처리
    // 실제 토스플레이스 응답: { resultType: "SUCCESS", success: [...] }
    const orders = Array.isArray(data) ? data : (data.success || data.orders || data.content || data.data || []);

    for (const order of orders) {
      const orderId = order.id || order.orderId;
      const soldAt  = order.createdAt ? new Date(order.createdAt).toISOString()
                    : new Date(fromTs).toISOString();
      const lineItems = order.lineItems || order.orderItems || order.items || [];

      // REST 동기화는 orderStates=COMPLETED만 가져오므로 항상 최종 확정 데이터 — 웹훅이 먼저 OPENED 상태로
      // 저장해둔 행이 있어도 결제완료 데이터로 덮어써야 하므로 ignore 대신 merge로 갱신
      await knex('orders').insert({
        brand_id: store.brand_id, store_id: store.id,
        toss_order_id: String(orderId), raw_payload: JSON.stringify(order),
        processed_at: soldAt,
        ...extractOrderFinance(order),
      }).onConflict('toss_order_id').merge();

      for (const item of lineItems) {
        const menuName  = (item.item?.title) || item.name || item.menuName || '';
        const menuId    = (item.item?.id)    || item.menuId || null;
        const qty       = item.quantity || 1;
        const unitPrice = (item.itemPrice?.priceValue) || (item.item?.price) || item.unitPrice || item.price || 0;
        if (!menuName) continue;

        await knex('sales_items').insert({
          brand_id: store.brand_id, store_id: store.id,
          toss_order_id: String(orderId), menu_name: menuName, toss_menu_id: menuId,
          quantity: qty, unit_price: unitPrice, amount: unitPrice * qty,
          sold_at: soldAt,
        }).onConflict(['toss_order_id', 'menu_name']).ignore();
        inserted++;
      }
    }

    if (orders.length < 100) break;
    page++;
  }

  return inserted;
}

// 임시 진단용: 토스플레이스에서 받아온 주문 원본 구조 확인 (대시보드에 결제수단별/할인/고객수 항목을 추가할 수 있는지 보기 위함)
// 결제수단(payments) 데이터를 보려면 결제완료(COMPLETED) 주문이어야 하므로, 전체 주문 중 완료된 것을 우선 찾는다
router.get('/stores/:id/sample-order', requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  const orders = await knex('orders')
    .where({ store_id: req.params.id, brand_id: req.user.brand_id })
    .orderBy('processed_at', 'desc');
  if (orders.length === 0) return res.json({ error: '동기화된 주문이 없습니다' });

  const stateCounts = {};
  let picked = null;
  for (const o of orders) {
    try {
      const parsed = JSON.parse(o.raw_payload);
      const state = parsed?.data?.order?.orderState || parsed?.orderState || 'UNKNOWN';
      stateCounts[state] = (stateCounts[state] || 0) + 1;
      if (!picked && state === 'COMPLETED') picked = o;
    } catch { stateCounts['PARSE_ERROR'] = (stateCounts['PARSE_ERROR'] || 0) + 1; }
  }
  if (!picked) {
    return res.json({ error: '결제완료(COMPLETED) 주문을 찾지 못했습니다', total: orders.length, stateCounts });
  }
  let raw;
  try { raw = JSON.parse(picked.raw_payload); } catch { raw = picked.raw_payload; }
  res.json({ processed_at: picked.processed_at, total: orders.length, stateCounts, raw });
});

router.post('/stores/:id/sync', requireAuth, async (req, res) => {
  const store = await knex('stores').where({ id: req.params.id, brand_id: req.user.brand_id }).first();
  if (!store) return res.status(404).json({ error: '가맹점 없음' });

  // 기간 미지정 시 전체 매출 기준으로 넉넉히 5년 전부터 가져옴
  const { from, to } = req.body;
  const fromDate = from || new Date(Date.now() - 5 * 365 * 86400000).toISOString().split('T')[0];
  const toDate = to || new Date().toISOString().split('T')[0];

  try {
    const inserted = await syncStoreSales(store, fromDate, toDate);
    res.json({ ok: true, inserted, from: fromDate, to: toDate });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── 가맹점별 매출/발주 순위 ────────────────────────────
router.get('/store-rankings', requireAuth, async (req, res) => {
  const { from, to } = req.query;
  const brand_id = req.user.brand_id;
  const toISO = (to ? new Date(to) : new Date()).toISOString();
  const fromISO = (from ? new Date(from) : new Date(Date.now() - 30 * 86400000)).toISOString();

  const salesRows = await knex('sales_items as si')
    .join('stores as s', 'si.store_id', 's.id')
    .where('si.brand_id', brand_id)
    .where('si.sold_at', '>=', fromISO).where('si.sold_at', '<=', toISO)
    .groupBy('si.store_id', 's.name')
    .select('si.store_id', 's.name as store_name')
    .sum('si.amount as revenue')
    .countDistinct('si.toss_order_id as order_count')
    .orderBy('revenue', 'desc');

  const orderRows = await knex('purchase_orders as po')
    .join('stores as s', 'po.store_id', 's.id')
    .where('po.brand_id', brand_id)
    .whereNotIn('po.status', ['DRAFT', 'CANCELED'])
    .where('po.created_at', '>=', fromISO).where('po.created_at', '<=', toISO)
    .groupBy('po.store_id', 's.name')
    .select('po.store_id', 's.name as store_name')
    .sum('po.total_amount as order_amount')
    .count('po.id as order_count')
    .orderBy('order_amount', 'desc');

  const salesByStore = new Map(salesRows.map(r => [r.store_id, { store_name: r.store_name, revenue: Number(r.revenue || 0) }]));
  const orderByStore = new Map(orderRows.map(r => [r.store_id, { store_name: r.store_name, order_amount: Number(r.order_amount || 0) }]));
  const allStoreIds = new Set([...salesByStore.keys(), ...orderByStore.keys()]);

  // 발주율 = 발주금액 / 매출 — 높을수록 매출에 비해 발주(원가 지출)가 많다는 뜻
  const efficiencyRanking = [...allStoreIds].map(store_id => {
    const sale = salesByStore.get(store_id);
    const order = orderByStore.get(store_id);
    const revenue = sale?.revenue || 0;
    const order_amount = order?.order_amount || 0;
    return {
      store_id,
      store_name: sale?.store_name || order?.store_name,
      revenue, order_amount,
      ratio: revenue > 0 ? Math.round((order_amount / revenue) * 1000) / 10 : null, // %
    };
  }).sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1));

  res.json({
    salesRanking: salesRows.map(r => ({ store_id: r.store_id, store_name: r.store_name, revenue: Number(r.revenue || 0), order_count: Number(r.order_count || 0) })),
    orderRanking: orderRows.map(r => ({ store_id: r.store_id, store_name: r.store_name, order_amount: Number(r.order_amount || 0), order_count: Number(r.order_count || 0) })),
    efficiencyRanking,
    period: { from: fromISO, to: toISO },
  });
});

// ─── 정산 리포트 (가맹점별 결제/환불 집계) ──────────────
router.get('/settlement', requireAuth, requireRole(...HQ_ROLES), async (req, res) => {
  const { from, to } = req.query;
  const brand_id = req.user.brand_id;
  const toISO = (to ? new Date(to) : new Date()).toISOString();
  const fromISO = (from ? new Date(from) : new Date(Date.now() - 30 * 86400000)).toISOString();

  const rows = await knex('purchase_orders as po')
    .join('stores as s', 'po.store_id', 's.id')
    .where('po.brand_id', brand_id)
    .whereNotNull('po.paid_at')
    .where('po.paid_at', '>=', fromISO).where('po.paid_at', '<=', toISO)
    .select('po.store_id', 's.name as store_name', 'po.confirmed_amount', 'po.total_amount', 'po.refunded_amount');

  const byStore = new Map();
  for (const r of rows) {
    const gross = Math.round(r.confirmed_amount ?? r.total_amount);
    const refunded = Math.round(r.refunded_amount || 0);
    const cur = byStore.get(r.store_id) || { store_id: r.store_id, store_name: r.store_name, order_count: 0, gross: 0, refunded: 0 };
    cur.order_count += 1;
    cur.gross += gross;
    cur.refunded += refunded;
    byStore.set(r.store_id, cur);
  }

  const settlement = [...byStore.values()]
    .map(s => ({ ...s, net: s.gross - s.refunded }))
    .sort((a, b) => b.net - a.net);

  const totals = settlement.reduce((acc, s) => ({
    order_count: acc.order_count + s.order_count,
    gross: acc.gross + s.gross,
    refunded: acc.refunded + s.refunded,
    net: acc.net + s.net,
  }), { order_count: 0, gross: 0, refunded: 0, net: 0 });

  // 상품별 매출 분해 — 결제완료(paid_at) 발주서의 품목 단위로 집계, 품목별 환불 수량을 반영한 순매출(net)까지 계산
  const itemRows = await knex('purchase_order_items as poi')
    .join('purchase_orders as po', 'poi.order_id', 'po.id')
    .where('po.brand_id', brand_id)
    .whereNotNull('po.paid_at')
    .where('po.paid_at', '>=', fromISO).where('po.paid_at', '<=', toISO)
    .select('poi.product_name', 'poi.unit_price', 'poi.quantity', 'poi.confirmed_quantity', 'poi.refunded_quantity', 'poi.amount');

  const byProduct = new Map();
  for (const r of itemRows) {
    const qty = r.confirmed_quantity ?? r.quantity;
    const refundedAmount = Math.round((r.refunded_quantity || 0) * r.unit_price);
    const gross = Math.round(r.amount);
    const cur = byProduct.get(r.product_name) || { product_name: r.product_name, qty: 0, gross: 0, refunded: 0 };
    cur.qty += qty;
    cur.gross += gross;
    cur.refunded += refundedAmount;
    byProduct.set(r.product_name, cur);
  }
  const byProductList = [...byProduct.values()]
    .map(p => ({ ...p, net: p.gross - p.refunded }))
    .sort((a, b) => b.net - a.net);

  // 직전 동일 기간 대비 — 기간 길이를 그대로 앞으로 이동해 전 기간 합계만 비교 (트렌드 파악용)
  const periodMs = new Date(toISO).getTime() - new Date(fromISO).getTime();
  const prevToISO = fromISO;
  const prevFromISO = new Date(new Date(fromISO).getTime() - periodMs).toISOString();
  const prevRows = await knex('purchase_orders as po')
    .where('po.brand_id', brand_id)
    .whereNotNull('po.paid_at')
    .where('po.paid_at', '>=', prevFromISO).where('po.paid_at', '<', prevToISO)
    .select('po.confirmed_amount', 'po.total_amount', 'po.refunded_amount');
  const previousTotals = prevRows.reduce((acc, r) => {
    const gross = Math.round(r.confirmed_amount ?? r.total_amount);
    const refunded = Math.round(r.refunded_amount || 0);
    return { order_count: acc.order_count + 1, gross: acc.gross + gross, refunded: acc.refunded + refunded, net: acc.net + (gross - refunded) };
  }, { order_count: 0, gross: 0, refunded: 0, net: 0 });

  res.json({
    settlement, totals, byProduct: byProductList,
    previousPeriod: { totals: previousTotals, from: prevFromISO, to: prevToISO },
    period: { from: fromISO, to: toISO },
  });
});

// ─── 감사 로그 ────────────────────────────────────────
router.get('/audit-log', requireAuth, requireRole('SUPER_ADMIN', 'HQ_ADMIN'), async (req, res) => {
  const { entity_type, limit } = req.query;
  const q = knex('audit_log as a')
    .leftJoin('users as u', 'a.user_id', 'u.id')
    .select('a.*', 'u.name as user_name')
    .where('a.brand_id', req.user.brand_id)
    .orderBy('a.created_at', 'desc')
    .limit(Math.min(Number(limit) || 200, 1000));
  if (entity_type) q.where('a.entity_type', entity_type);
  res.json(await q);
});

module.exports = router;
module.exports.syncStoreSales = syncStoreSales;
