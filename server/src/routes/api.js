const createAsyncRouter = require('../middleware/asyncRouter');
const router = createAsyncRouter();
const { knex, isProduction } = require('../db/schema');
const { requireAuth, requireRole, HQ_ROLES } = require('../middleware/auth');

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
router.get('/stores', requireAuth, async (req, res) => {
  const stores = await knex('stores').where({ brand_id: req.user.brand_id }).orderBy('created_at');
  // 인증정보 평문은 SUPER_ADMIN/HQ_ADMIN에게만 노출, 나머지는 설정 여부만 전달
  const canSeeSecrets = ['SUPER_ADMIN', 'HQ_ADMIN'].includes(req.user.role);
  res.json(stores.map(s => {
    if (canSeeSecrets) return s;
    const { webhook_secret, toss_client_secret, ...rest } = s;
    return { ...rest, webhook_secret_set: !!webhook_secret, toss_client_secret_set: !!toss_client_secret };
  }));
});

router.post('/stores', requireAuth, requireRole(...HQ_ROLES), async (req, res) => {
  const { name, webhook_secret, toss_store_id, order_deadline, delivery_days, business_number, owner_name, phone, open_date, franchise_type, is_open, address } = req.body;
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

router.put('/stores/:id', requireAuth, requireRole(...HQ_ROLES), async (req, res) => {
  const { name, webhook_secret, toss_store_id, order_deadline, delivery_days, toss_client_id, toss_client_secret, business_number, owner_name, phone, open_date, franchise_type, is_open, address } = req.body;
  await knex('stores').where({ id: req.params.id, brand_id: req.user.brand_id })
    .update({
      name, webhook_secret, toss_store_id,
      order_deadline: order_deadline || null,
      delivery_days: delivery_days || null,
      toss_client_id: toss_client_id || null,
      toss_client_secret: toss_client_secret || null,
      business_number: business_number || null,
      owner_name: owner_name || null,
      phone: phone || null,
      open_date: open_date || null,
      franchise_type: franchise_type || null,
      is_open: is_open ?? true,
      address: address || null,
    });
  res.json({ ok: true });
});

router.delete('/stores/:id', requireAuth, requireRole(...HQ_ROLES), async (req, res) => {
  await knex('stores').where({ id: req.params.id, brand_id: req.user.brand_id }).delete();
  res.json({ ok: true });
});

// ─── 재료 ───────────────────────────────────────────
router.get('/ingredients', requireAuth, async (req, res) => {
  const { store_id } = req.query;
  const sid = store_id || req.user.store_id;
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

router.post('/ingredients', requireAuth, async (req, res) => {
  const { name, unit, stock, threshold, store_id, order_unit, order_unit_conversion } = req.body;
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

router.put('/ingredients/:id', requireAuth, async (req, res) => {
  const { name, unit, stock, threshold, order_unit, order_unit_conversion, is_key } = req.body;
  await knex('ingredients').where({ id: req.params.id, brand_id: req.user.brand_id })
    .update({ name, unit, stock, threshold, order_unit, order_unit_conversion, is_key: is_key ? 1 : 0 });
  res.json({ ok: true });
});

router.delete('/ingredients/:id', requireAuth, async (req, res) => {
  await knex('ingredients').where({ id: req.params.id, brand_id: req.user.brand_id }).delete();
  res.json({ ok: true });
});

router.post('/ingredients/:id/restock', requireAuth, async (req, res) => {
  const { amount } = req.body;
  await knex('ingredients').where({ id: req.params.id, brand_id: req.user.brand_id }).increment('stock', amount);
  res.json({ ok: true });
});

// ─── 메뉴 ───────────────────────────────────────────
router.get('/menus', requireAuth, async (req, res) => {
  const { store_id } = req.query;
  const sid = store_id || req.user.store_id;
  const q = knex('menus').where({ brand_id: req.user.brand_id }).orderBy('name');
  if (sid) q.where({ store_id: sid });
  const menus = await q;
  const recipes = await knex('recipes')
    .join('ingredients', 'recipes.ingredient_id', 'ingredients.id')
    .select('recipes.*', 'ingredients.name as ingredient_name', 'ingredients.unit');
  res.json(menus.map(m => ({ ...m, recipes: recipes.filter(r => r.menu_id === m.id) })));
});

router.post('/menus', requireAuth, async (req, res) => {
  const { name, toss_menu_id, store_id } = req.body;
  const [{ id }] = await knex('menus').insert({
    brand_id: req.user.brand_id,
    store_id: store_id || req.user.store_id,
    name, toss_menu_id: toss_menu_id || null,
  }).returning('id');
  res.json({ id });
});

router.put('/menus/:id', requireAuth, async (req, res) => {
  const { name, toss_menu_id, is_active, is_key } = req.body;
  await knex('menus').where({ id: req.params.id, brand_id: req.user.brand_id }).update({ name, toss_menu_id, is_active, is_key: is_key ? 1 : 0 });
  res.json({ ok: true });
});

router.delete('/menus/:id', requireAuth, async (req, res) => {
  await knex('menus').where({ id: req.params.id, brand_id: req.user.brand_id }).delete();
  res.json({ ok: true });
});

// ─── 레시피 ──────────────────────────────────────────
router.post('/menus/:menuId/recipes', requireAuth, async (req, res) => {
  const { ingredient_id, amount } = req.body;
  const existing = await knex('recipes').where({ menu_id: req.params.menuId, ingredient_id }).first();
  const ing = await knex('ingredients').where({ id: ingredient_id }).first();
  if (existing) {
    await knex('recipe_history').insert({ menu_id: req.params.menuId, ingredient_id, ingredient_name: ing?.name, old_amount: existing.amount, new_amount: amount, action: 'UPDATED', changed_by: req.user.id });
  } else {
    await knex('recipe_history').insert({ menu_id: req.params.menuId, ingredient_id, ingredient_name: ing?.name, old_amount: null, new_amount: amount, action: 'ADDED', changed_by: req.user.id });
  }
  await knex('recipes').insert({ menu_id: req.params.menuId, ingredient_id, amount }).onConflict(['menu_id', 'ingredient_id']).merge();
  res.json({ ok: true });
});

router.delete('/menus/:menuId/recipes/:ingredientId', requireAuth, async (req, res) => {
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
  const sid = store_id || req.user.store_id;
  const brand_id = req.user.brand_id;

  const ingQ = knex('ingredients').where({ brand_id }).whereRaw('stock <= threshold').orderByRaw('stock - threshold');
  if (sid) ingQ.where({ store_id: sid });
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

  // 리스크 알림 (OPEN)
  const riskQ = knex('risk_alerts as r')
    .leftJoin('stores as s', 'r.store_id', 's.id')
    .select('r.*', 's.name as store_name')
    .where({ 'r.brand_id': brand_id, 'r.status': 'OPEN' })
    .orderBy('r.created_at', 'desc').limit(10);
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
  const dayStats = async (date) => {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);
    const q = knex('sales_items').where({ brand_id })
      .where('sold_at', '>=', start.toISOString()).where('sold_at', '<=', end.toISOString());
    if (sid) q.where({ store_id: sid });
    const row = await q.clone().sum('amount as revenue').first();
    const cnt = await q.clone().countDistinct('toss_order_id as cnt').first();
    return { revenue: Number(row?.revenue || 0), orderCount: Number(cnt?.cnt || 0) };
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
  const sid = store_id ? Number(store_id) : req.user.store_id;
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

  // 과다 사입 리스크 자동 생성
  const OVER_PURCHASE_RATIO = 2.0; // 발주량이 예상 소진량의 2배를 초과하면 경보
  if (sid) {
    for (const c of comparison) {
      if (c.ratio !== null && c.ratio > OVER_PURCHASE_RATIO && c.estimated > 0) {
        const { createRisk } = require('./risks');
        createRisk(brand_id, sid, 'OVER_PURCHASE', 'MEDIUM',
          `과다 사입 가능성: ${c.name} — 예상 소진 ${Math.round(c.estimated)}${c.unit} 대비 발주 ${Math.round(c.total_ordered)}${c.unit} (${c.ratio}배)`,
          { ingredient: c.name, estimated: c.estimated, ordered: c.total_ordered }
        ).catch(() => {});
      }
    }
  }

  res.json({ salesByMenu, dailyRevenue: dailyRows, comparison, period: { from: fromISO, to: toISO } });
});

// ─── Toss Place 과거 데이터 동기화 ────────────────────
async function syncStoreSales(store, fromDate, toDate) {
  const accessKey = process.env.TOSS_ACCESS_KEY;
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error('TOSS_ACCESS_KEY / TOSS_SECRET_KEY 환경변수가 설정되지 않았습니다');
  if (!store.toss_store_id) throw new Error('토스플레이스 매장 ID(toss_store_id)가 설정되지 않았습니다');

  const TOSS_BASE = process.env.TOSS_PLACE_API_URL || 'https://open-api.tossplace.com';
  const fromTs = new Date(fromDate + 'T00:00:00+09:00').getTime();
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

      await knex('orders').insert({
        brand_id: store.brand_id, store_id: store.id,
        toss_order_id: String(orderId), raw_payload: JSON.stringify(order),
        processed_at: soldAt,
      }).onConflict('toss_order_id').ignore();

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

  res.json({
    salesRanking: salesRows.map(r => ({ store_id: r.store_id, store_name: r.store_name, revenue: Number(r.revenue || 0), order_count: Number(r.order_count || 0) })),
    orderRanking: orderRows.map(r => ({ store_id: r.store_id, store_name: r.store_name, order_amount: Number(r.order_amount || 0), order_count: Number(r.order_count || 0) })),
    period: { from: fromISO, to: toISO },
  });
});

module.exports = router;
module.exports.syncStoreSales = syncStoreSales;
