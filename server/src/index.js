require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb, knex } = require('./db/schema');

const app = express();

// 허용 출처: 로컬 개발(localhost), Cloudflare Quick Tunnel(*.trycloudflare.com — 시작.bat에서 매번 임의 주소 생성),
// 운영 환경에 설정한 CLIENT_URL. 그 외 출처는 차단.
const extraOrigins = (process.env.CLIENT_URL || '').split(',').map(s => s.trim()).filter(Boolean);
const corsOriginCheck = (origin, callback) => {
  if (!origin) return callback(null, true); // 서버-서버 호출, 웹훅 등 Origin 헤더 없는 요청
  const allowed = /^https?:\/\/localhost(:\d+)?$/.test(origin)
    || /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin)
    || /^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(origin)
    || extraOrigins.includes(origin);
  callback(allowed ? null : new Error('CORS blocked'), allowed);
};
app.use(cors({ origin: corsOriginCheck }));
app.use(express.json());

const apiRoutes = require('./routes/api');
app.use('/auth', require('./routes/auth'));
app.use('/api', apiRoutes);
app.use('/api/orders', require('./routes/orders'));
app.use('/api/products', require('./routes/products'));
app.use('/api/waste', require('./routes/waste'));
app.use('/api/risks', require('./routes/risks').router);
app.use('/webhook', require('./routes/webhook'));
app.use('/sse', require('./routes/sse').router);

// 전역 에러 핸들러: 라우트에서 처리되지 않은 예외/거부를 안전하게 500으로 응답
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: '서버 오류가 발생했습니다' });
});

const PORT = process.env.PORT || 3001;
initDb().then(async () => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

  // 기존 orders → sales_items 백필 (sales_items가 비어있을 때 한 번만)
  try {
    const existingCount = await knex('sales_items').count('id as cnt').first();
    if (Number(existingCount.cnt) === 0) {
      const orders = await knex('orders').select('id', 'toss_order_id', 'store_id', 'brand_id', 'processed_at', 'raw_payload');
      let filled = 0;
      for (const o of orders) {
        try {
          const payload = JSON.parse(o.raw_payload);
          const lineItems = (payload.data?.order?.lineItems) || (payload.data?.lineItems) || [];
          const soldAt = (payload.data?.order?.createdAt) || (payload.data?.createdAt) || o.processed_at;
          for (const item of lineItems) {
            const menuName = (item.item?.title) || item.name || item.menuName || '';
            const menuId = (item.item?.id) || item.menuId || null;
            const qty = item.quantity || 1;
            const unitPrice = (item.itemPrice?.priceValue) || (item.item?.price) || item.unitPrice || item.price || 0;
            if (!menuName) continue;
            await knex('sales_items').insert({
              brand_id: o.brand_id, store_id: o.store_id,
              toss_order_id: o.toss_order_id, menu_name: menuName, toss_menu_id: menuId,
              quantity: qty, unit_price: unitPrice, amount: unitPrice * qty,
              sold_at: soldAt,
            }).onConflict(['toss_order_id', 'menu_name']).ignore();
            filled++;
          }
        } catch {}
      }
      if (filled > 0) console.log(`[백필] sales_items ${filled}건 마이그레이션 완료`);
    }
  } catch (e) { console.error('[백필] 오류:', e.message); }

  // 결제 미완료 리스크 체크: 1시간마다
  const { checkPaymentOverdue } = require('./routes/risks');
  const runOverdueCheck = async () => {
    try {
      const brands = await knex('brands').select('id');
      for (const b of brands) await checkPaymentOverdue(b.id);
    } catch (e) { console.error('[리스크] 결제 미완료 체크 오류:', e.message); }
  };
  runOverdueCheck();
  setInterval(runOverdueCheck, 60 * 60 * 1000);

  // Toss Place 과거/누락 매출 자동 동기화: 토스플레이스 매장 ID가 등록된 가맹점만 3분마다 재동기화
  // 한 번도 동기화 안 한 가맹점은 전체 매출(최근 5년)을, 이후엔 최근 2일치만 다시 가져옴
  const runAutoSync = async () => {
    try {
      const stores = await knex('stores').whereNotNull('toss_store_id').where('toss_store_id', '!=', '');
      const toDate = new Date().toISOString().split('T')[0];
      for (const store of stores) {
        const fromDate = store.last_synced_at
          ? new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0]
          : new Date(Date.now() - 5 * 365 * 86400000).toISOString().split('T')[0];
        try {
          const inserted = await apiRoutes.syncStoreSales(store, fromDate, toDate);
          await knex('stores').where({ id: store.id }).update({ last_synced_at: new Date().toISOString() });
          if (inserted > 0) console.log(`[자동 동기화] ${store.name}: ${inserted}건 (${fromDate} ~ ${toDate})`);
        } catch (e) { console.error(`[자동 동기화] ${store.name} 오류:`, e.message); }
      }
    } catch (e) { console.error('[자동 동기화] 오류:', e.message); }
  };
  runAutoSync();
  setInterval(runAutoSync, 3 * 60 * 1000);
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});
