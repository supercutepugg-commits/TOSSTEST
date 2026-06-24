const isProduction = !!process.env.DATABASE_URL;

const knex = require('knex')(
  isProduction
    ? { client: 'pg', connection: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : { client: 'sqlite3', connection: { filename: require('path').join(__dirname, '../../data.db') }, useNullAsDefault: true }
);

async function createIfMissing(tableName, builder) {
  const exists = await knex.schema.hasTable(tableName);
  if (!exists) await knex.schema.createTable(tableName, builder);
}

async function addColumnIfMissing(table, column, builder) {
  const has = await knex.schema.hasColumn(table, column);
  if (!has) await knex.schema.table(table, t => builder(t));
}

async function initDb() {
  // ── 브랜드 ────────────────────────────────────────────
  await createIfMissing('brands', t => {
    t.increments('id');
    t.string('name').notNullable();
    t.string('code').unique();
    t.datetime('created_at').defaultTo(knex.fn.now());
  });
  await addColumnIfMissing('brands', 'risk_settings', t => t.text('risk_settings').nullable());
  const defaultBrand = await knex('brands').first();
  let defaultBrandId = defaultBrand?.id;
  if (!defaultBrand) {
    const [row] = await knex('brands').insert({ name: '포스모스', code: 'posmos' }).returning('id');
    defaultBrandId = row.id;
  }

  // ── 가맹점 ────────────────────────────────────────────
  await createIfMissing('stores', t => {
    t.increments('id');
    t.integer('brand_id').references('brands.id').onDelete('CASCADE');
    t.string('name').notNullable();
    t.string('webhook_secret');
    t.string('toss_store_id');
    t.datetime('created_at').defaultTo(knex.fn.now());
  });
  await addColumnIfMissing('stores', 'brand_id', t => t.integer('brand_id').defaultTo(defaultBrandId));
  await addColumnIfMissing('stores', 'order_deadline', t => t.string('order_deadline').nullable());
  await addColumnIfMissing('stores', 'delivery_days', t => t.string('delivery_days').nullable());
  await addColumnIfMissing('stores', 'toss_api_key', t => t.string('toss_api_key').nullable()); // deprecated
  await addColumnIfMissing('stores', 'toss_client_id', t => t.string('toss_client_id').nullable());
  await addColumnIfMissing('stores', 'toss_client_secret', t => t.string('toss_client_secret').nullable());
  await addColumnIfMissing('stores', 'last_synced_at', t => t.datetime('last_synced_at').nullable());
  await addColumnIfMissing('stores', 'business_number', t => t.string('business_number').nullable());
  await addColumnIfMissing('stores', 'owner_name', t => t.string('owner_name').nullable());
  await addColumnIfMissing('stores', 'phone', t => t.string('phone').nullable());
  await addColumnIfMissing('stores', 'open_date', t => t.date('open_date').nullable());
  await addColumnIfMissing('stores', 'franchise_type', t => t.string('franchise_type').nullable()); // 가맹점 / 직영점
  await addColumnIfMissing('stores', 'is_open', t => t.boolean('is_open').defaultTo(true));
  await addColumnIfMissing('stores', 'address', t => t.string('address').nullable());
  const defaultStore = await knex('stores').first();
  let defaultStoreId = defaultStore?.id;
  if (!defaultStore) {
    const [row] = await knex('stores').insert({ name: '기본 가맹점', webhook_secret: process.env.TOSS_WEBHOOK_SECRET || '', brand_id: defaultBrandId }).returning('id');
    defaultStoreId = row.id;
  }
  await knex('stores').whereNull('brand_id').update({ brand_id: defaultBrandId });

  // ── 사용자 ────────────────────────────────────────────
  await createIfMissing('users', t => {
    t.increments('id');
    t.integer('brand_id').references('brands.id').onDelete('CASCADE');
    t.integer('store_id').references('stores.id').onDelete('SET NULL').nullable();
    t.string('email').notNullable().unique();
    t.string('password_hash').notNullable();
    t.string('name').notNullable();
    // roles: SUPER_ADMIN, HQ_ADMIN, HQ_LOGISTICS, HQ_ACCOUNTING, STORE_OWNER, STORE_STAFF
    t.string('role').notNullable().defaultTo('STORE_OWNER');
    t.boolean('is_active').defaultTo(true);
    t.datetime('created_at').defaultTo(knex.fn.now());
  });
  // 기본 슈퍼 관리자
  const superAdmin = await knex('users').where({ role: 'SUPER_ADMIN' }).first();
  if (!superAdmin) {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('admin1234', 10);
    await knex('users').insert({ brand_id: defaultBrandId, email: 'admin@posmos.com', password_hash: hash, name: '포스모스 관리자', role: 'SUPER_ADMIN' });
  }

  // ── 발주 단위 ─────────────────────────────────────────
  await createIfMissing('units', t => {
    t.increments('id');
    t.integer('brand_id').references('brands.id').onDelete('CASCADE');
    t.string('name').notNullable();          // 박스, 봉, 통
    t.string('base_unit').notNullable();     // g, ml, 개
    t.float('conversion').notNullable();     // 1단위 = conversion * base_unit
    t.datetime('created_at').defaultTo(knex.fn.now());
  });

  // ── 재료 ─────────────────────────────────────────────
  await createIfMissing('ingredients', t => {
    t.increments('id');
    t.integer('brand_id').references('brands.id').onDelete('CASCADE');
    t.integer('store_id').references('stores.id').onDelete('CASCADE');
    t.string('name').notNullable();
    t.string('unit').notNullable();          // 기본 단위 (g, ml, 개)
    t.string('order_unit').nullable();       // 발주 단위 (박스, 봉)
    t.float('order_unit_conversion').nullable(); // 1발주단위 = N 기본단위
    t.float('stock').defaultTo(0);
    t.float('threshold').defaultTo(0);
    t.datetime('created_at').defaultTo(knex.fn.now());
  });
  await addColumnIfMissing('ingredients', 'brand_id', t => t.integer('brand_id').defaultTo(defaultBrandId));
  await addColumnIfMissing('ingredients', 'store_id', t => t.integer('store_id').defaultTo(defaultStoreId));
  await addColumnIfMissing('ingredients', 'order_unit', t => t.string('order_unit').nullable());
  await addColumnIfMissing('ingredients', 'order_unit_conversion', t => t.float('order_unit_conversion').nullable());
  await addColumnIfMissing('ingredients', 'is_key', t => t.boolean('is_key').defaultTo(false));
  await knex('ingredients').whereNull('brand_id').update({ brand_id: defaultBrandId });
  await knex('ingredients').whereNull('store_id').update({ store_id: defaultStoreId });

  // ── 메뉴 ─────────────────────────────────────────────
  await createIfMissing('menus', t => {
    t.increments('id');
    t.integer('brand_id').references('brands.id').onDelete('CASCADE');
    t.integer('store_id').references('stores.id').onDelete('CASCADE');
    t.string('name').notNullable();
    t.string('toss_menu_id');
    t.boolean('is_active').defaultTo(true);
    t.date('active_from').nullable();
    t.date('active_to').nullable();
    t.datetime('created_at').defaultTo(knex.fn.now());
  });
  await addColumnIfMissing('menus', 'brand_id', t => t.integer('brand_id').defaultTo(defaultBrandId));
  await addColumnIfMissing('menus', 'store_id', t => t.integer('store_id').defaultTo(defaultStoreId));
  await addColumnIfMissing('menus', 'is_active', t => t.boolean('is_active').defaultTo(true));
  await addColumnIfMissing('menus', 'is_key', t => t.boolean('is_key').defaultTo(false));
  await knex('menus').whereNull('brand_id').update({ brand_id: defaultBrandId });
  await knex('menus').whereNull('store_id').update({ store_id: defaultStoreId });

  // ── 레시피 ────────────────────────────────────────────
  await createIfMissing('recipes', t => {
    t.increments('id');
    t.integer('menu_id').references('menus.id').onDelete('CASCADE');
    t.integer('ingredient_id').references('ingredients.id').onDelete('CASCADE');
    t.float('amount').notNullable();
    t.unique(['menu_id', 'ingredient_id']);
  });

  // ── 발주 상품 ─────────────────────────────────────────
  await createIfMissing('products', t => {
    t.increments('id');
    t.integer('brand_id').references('brands.id').onDelete('CASCADE');
    t.integer('ingredient_id').references('ingredients.id').onDelete('SET NULL').nullable();
    t.string('name').notNullable();
    t.string('unit').notNullable();          // 발주 단위
    t.float('unit_conversion').defaultTo(1); // 1발주단위 = N 기본단위(g/ml/개)
    t.string('base_unit').notNullable();     // 기본 단위
    t.float('price').defaultTo(0);           // 단가
    t.boolean('is_active').defaultTo(true);
    t.datetime('created_at').defaultTo(knex.fn.now());
  });

  // ── 발주서 ────────────────────────────────────────────
  await createIfMissing('purchase_orders', t => {
    t.increments('id');
    t.integer('brand_id').references('brands.id').onDelete('CASCADE');
    t.integer('store_id').references('stores.id').onDelete('CASCADE');
    t.integer('created_by').references('users.id').onDelete('SET NULL').nullable();
    t.string('status').defaultTo('DRAFT');
    // DRAFT, ORDERED, REVIEWING, REVISION_REQUESTED, CONFIRMED,
    // PAYMENT_PENDING, PAID, PREPARING_SHIPMENT, SHIPPED, DELIVERED, CLOSED, CANCELED
    t.float('total_amount').defaultTo(0);
    t.float('confirmed_amount').nullable();
    t.text('memo').nullable();
    t.datetime('ordered_at').nullable();
    t.datetime('confirmed_at').nullable();
    t.datetime('shipped_at').nullable();
    t.datetime('delivered_at').nullable();
    t.datetime('created_at').defaultTo(knex.fn.now());
  });
  await addColumnIfMissing('purchase_orders', 'toss_order_code', t => t.string('toss_order_code').nullable());
  await addColumnIfMissing('purchase_orders', 'toss_payment_key', t => t.string('toss_payment_key').nullable());
  await addColumnIfMissing('purchase_orders', 'paid_at', t => t.datetime('paid_at').nullable());
  await addColumnIfMissing('purchase_orders', 'refunded_amount', t => t.float('refunded_amount').defaultTo(0));
  await addColumnIfMissing('purchase_orders', 'stock_reversed', t => t.boolean('stock_reversed').defaultTo(false));

  // ── 발주 상품 목록 ────────────────────────────────────
  await createIfMissing('purchase_order_items', t => {
    t.increments('id');
    t.integer('order_id').references('purchase_orders.id').onDelete('CASCADE');
    t.integer('product_id').references('products.id').onDelete('SET NULL').nullable();
    t.string('product_name').notNullable();
    t.string('unit').notNullable();
    t.float('unit_price').defaultTo(0);
    t.float('quantity').notNullable();
    t.float('confirmed_quantity').nullable();
    t.float('amount').defaultTo(0);
    t.string('status').defaultTo('NORMAL'); // NORMAL, OUT_OF_STOCK, SUBSTITUTED
    t.integer('substitute_product_id').nullable();
    t.string('substitute_note').nullable();
    t.datetime('created_at').defaultTo(knex.fn.now());
  });
  await addColumnIfMissing('purchase_order_items', 'refunded_quantity', t => t.float('refunded_quantity').defaultTo(0));

  // ── 레시피 변경 이력 ──────────────────────────────────
  await createIfMissing('recipe_history', t => {
    t.increments('id');
    t.integer('menu_id').references('menus.id').onDelete('CASCADE');
    t.integer('ingredient_id').references('ingredients.id').onDelete('CASCADE').nullable();
    t.string('ingredient_name').nullable();
    t.float('old_amount').nullable();
    t.float('new_amount').nullable();
    t.string('action').notNullable(); // ADDED, UPDATED, DELETED
    t.integer('changed_by').references('users.id').onDelete('SET NULL').nullable();
    t.datetime('created_at').defaultTo(knex.fn.now());
  });

  // ── 주문 수정 이력 ────────────────────────────────────
  await createIfMissing('order_history', t => {
    t.increments('id');
    t.integer('order_id').references('purchase_orders.id').onDelete('CASCADE');
    t.integer('item_id').references('purchase_order_items.id').onDelete('CASCADE').nullable();
    t.integer('changed_by').references('users.id').onDelete('SET NULL').nullable();
    t.string('action').notNullable(); // STATUS_CHANGE, QUANTITY_CHANGE, etc.
    t.text('before_value').nullable();
    t.text('after_value').nullable();
    t.text('reason').nullable();
    t.datetime('created_at').defaultTo(knex.fn.now());
  });

  // ── 감사 로그 (가격/재료/사용자 등 민감 변경 기록) ──────
  await createIfMissing('audit_log', t => {
    t.increments('id');
    t.integer('brand_id').references('brands.id').onDelete('CASCADE');
    t.integer('user_id').references('users.id').onDelete('SET NULL').nullable();
    t.string('entity_type').notNullable(); // PRODUCT, INGREDIENT, MENU, STORE, USER
    t.integer('entity_id').nullable();
    t.string('action').notNullable(); // CREATE, UPDATE, DELETE
    t.text('before_value').nullable();
    t.text('after_value').nullable();
    t.datetime('created_at').defaultTo(knex.fn.now());
  });

  // ── 결제 ─────────────────────────────────────────────
  await createIfMissing('payments', t => {
    t.increments('id');
    t.integer('order_id').references('purchase_orders.id').onDelete('CASCADE');
    t.string('payment_key').unique().nullable();
    t.string('status').defaultTo('NOT_REQUESTED');
    // NOT_REQUESTED, REQUESTED, PENDING, PAID, FAILED, CANCELED, PARTIALLY_REFUNDED, REFUNDED
    t.float('amount').defaultTo(0);
    t.string('method').nullable(); // 가상계좌, 카드, 계좌이체
    t.text('raw_response').nullable();
    t.datetime('paid_at').nullable();
    t.datetime('created_at').defaultTo(knex.fn.now());
  });

  // ── 폐기 입력 ─────────────────────────────────────────
  await createIfMissing('waste_logs', t => {
    t.increments('id');
    t.integer('brand_id').references('brands.id').onDelete('CASCADE');
    t.integer('store_id').references('stores.id').onDelete('CASCADE');
    t.integer('ingredient_id').references('ingredients.id').onDelete('SET NULL').nullable();
    t.integer('created_by').references('users.id').onDelete('SET NULL').nullable();
    t.date('waste_date').notNullable();
    t.string('ingredient_name').notNullable();
    t.float('quantity').notNullable();
    t.string('unit').notNullable();
    t.string('reason').notNullable();
    t.text('memo').nullable();
    t.datetime('created_at').defaultTo(knex.fn.now());
  });

  // ── 리스크 알림 ───────────────────────────────────────
  await createIfMissing('risk_alerts', t => {
    t.increments('id');
    t.integer('brand_id').references('brands.id').onDelete('CASCADE');
    t.integer('store_id').references('stores.id').onDelete('CASCADE').nullable();
    t.string('type').notNullable();
    // OVER_PURCHASE, SALES_DOWN_ORDER_UP, LOW_TURNOVER, HIGH_WASTE, STORE_OUTLIER, PAYMENT_OVERDUE, LOW_STOCK
    t.string('severity').defaultTo('MEDIUM'); // HIGH, MEDIUM, LOW
    t.string('status').defaultTo('OPEN');
    // OPEN, ACKNOWLEDGED, IN_PROGRESS, RESOLVED, DISMISSED
    t.text('description').nullable();
    t.text('detail').nullable();
    t.integer('acknowledged_by').nullable();
    t.text('memo').nullable();
    t.datetime('created_at').defaultTo(knex.fn.now());
  });
  await addColumnIfMissing('risk_alerts', 'occurrence_count', t => t.integer('occurrence_count').defaultTo(1));
  await addColumnIfMissing('risk_alerts', 'last_occurred_at', t => t.datetime('last_occurred_at').nullable());

  // ── POS 주문 (기존 orders → 토스 POS 판매 데이터) ─────
  await createIfMissing('orders', t => {
    t.increments('id');
    t.integer('brand_id').references('brands.id').onDelete('CASCADE');
    t.integer('store_id').references('stores.id').onDelete('CASCADE');
    t.string('toss_order_id').unique();
    t.text('raw_payload');
    t.datetime('processed_at').defaultTo(knex.fn.now());
  });
  await addColumnIfMissing('orders', 'brand_id', t => t.integer('brand_id').defaultTo(defaultBrandId));
  await addColumnIfMissing('orders', 'store_id', t => t.integer('store_id').defaultTo(defaultStoreId));
  await knex('orders').whereNull('brand_id').update({ brand_id: defaultBrandId });
  await knex('orders').whereNull('store_id').update({ store_id: defaultStoreId });

  // ── 판매 내역 (정규화된 메뉴별 판매) ─────────────────
  await createIfMissing('sales_items', t => {
    t.increments('id');
    t.integer('brand_id').references('brands.id').onDelete('CASCADE');
    t.integer('store_id').references('stores.id').onDelete('CASCADE');
    t.string('toss_order_id').notNullable();
    t.string('menu_name').notNullable();
    t.string('toss_menu_id').nullable();
    t.integer('quantity').defaultTo(1);
    t.float('unit_price').defaultTo(0);
    t.float('amount').defaultTo(0);
    t.datetime('sold_at').notNullable();
    t.datetime('created_at').defaultTo(knex.fn.now());
    t.unique(['toss_order_id', 'menu_name']);
  });

  // ── 알림 로그 ─────────────────────────────────────────
  await createIfMissing('alert_log', t => {
    t.increments('id');
    t.integer('brand_id').defaultTo(defaultBrandId);
    t.integer('store_id').references('stores.id').onDelete('CASCADE');
    t.integer('ingredient_id');
    t.float('stock_at_alert');
    t.datetime('sent_at').defaultTo(knex.fn.now());
  });
  await addColumnIfMissing('alert_log', 'brand_id', t => t.integer('brand_id').defaultTo(defaultBrandId));
  await addColumnIfMissing('alert_log', 'store_id', t => t.integer('store_id').defaultTo(defaultStoreId));
  await knex('alert_log').whereNull('brand_id').update({ brand_id: defaultBrandId });
  await knex('alert_log').whereNull('store_id').update({ store_id: defaultStoreId });
}

module.exports = { knex, initDb, isProduction };
