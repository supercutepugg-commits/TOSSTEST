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
// 토스 결제/토스플레이스 웹훅은 서명 검증을 위해 raw body가 필요해서 express.json()보다 먼저 등록
// (이 등록이 없으면 express.json()이 먼저 바디를 다 읽어버려서, 아래 webhook.js의 express.raw()는
// 빈 스트림만 보게 되어 서명(HMAC)이 항상 빈 바디로 계산되고 실제 토스 서명과 일치하지 않아 모든
// 서명된 웹훅이 401로 거부되는 문제가 있었음)
app.use('/api/orders/toss-webhook', express.raw({ type: 'application/json' }));
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

const apiRoutes = require('./routes/api');
app.use('/auth', require('./routes/auth'));
app.use('/api', apiRoutes);
app.use('/api/orders', require('./routes/orders'));
app.use('/api/products', require('./routes/products'));
app.use('/api/waste', require('./routes/waste'));
app.use('/api/risks', require('./routes/risks').router);
app.use('/api/notices', require('./routes/notices'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/order-templates', require('./routes/orderTemplates'));
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

  // 이전 실행이 아직 끝나지 않았으면 겹쳐 돌지 않도록 건너뛰는 래퍼
  function withOverlapGuard(name, fn) {
    let running = false;
    return async () => {
      if (running) { console.log(`[크론] ${name} 이전 실행이 아직 진행 중이라 건너뜀`); return; }
      running = true;
      try { await fn(); } finally { running = false; }
    };
  }

  // 결제 미완료 리스크 체크: 1시간마다
  const { checkPaymentOverdue, checkLowStock } = require('./routes/risks');
  const runOverdueCheck = withOverlapGuard('결제 미완료 체크', async () => {
    try {
      const brands = await knex('brands').select('id');
      for (const b of brands) await checkPaymentOverdue(b.id);
    } catch (e) { console.error('[리스크] 결제 미완료 체크 오류:', e.message); }
  });
  runOverdueCheck();
  setInterval(runOverdueCheck, 60 * 60 * 1000);

  // 재고 부족 리스크 체크: 10분마다 (재고부족 팝업과 별개로 리스크 알림 탭에도 쌓이도록)
  const runLowStockCheck = withOverlapGuard('재고 부족 체크', async () => {
    try {
      const brands = await knex('brands').select('id');
      for (const b of brands) await checkLowStock(b.id);
    } catch (e) { console.error('[리스크] 재고 부족 체크 오류:', e.message); }
  });
  runLowStockCheck();
  setInterval(runLowStockCheck, 10 * 60 * 1000);

  // Toss Place 과거/누락 매출 자동 동기화: 토스플레이스 매장 ID가 등록된 가맹점만 3분마다 재동기화
  // 한 번도 동기화 안 한 가맹점은 전체 매출(최근 5년)을, 이후엔 최근 2일치만 다시 가져옴 (API 호출량 보호)
  const runAutoSync = withOverlapGuard('토스 자동 동기화', async () => {
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
  });
  runAutoSync();
  setInterval(runAutoSync, 3 * 60 * 1000);

  // 오래된 리스크/이력 데이터 정리: 1일마다 (무한 누적 방지)
  // - 처리 완료(RESOLVED/DISMISSED) 리스크는 180일 보관 후 삭제
  // - 발주 처리 이력(order_history)은 1년 보관 후 삭제 (분쟁/정산 추적 기간 고려)
  const runDataCleanup = withOverlapGuard('오래된 데이터 정리', async () => {
    try {
      const riskCutoff = new Date(Date.now() - 180 * 86400000).toISOString();
      const deletedRisks = await knex('risk_alerts')
        .whereIn('status', ['RESOLVED', 'DISMISSED']).where('created_at', '<', riskCutoff).delete();
      const historyCutoff = new Date(Date.now() - 365 * 86400000).toISOString();
      const deletedHistory = await knex('order_history').where('created_at', '<', historyCutoff).delete();
      if (deletedRisks || deletedHistory) {
        console.log(`[정리] 리스크 ${deletedRisks}건, 발주이력 ${deletedHistory}건 삭제`);
      }
    } catch (e) { console.error('[정리] 오류:', e.message); }
  });
  runDataCleanup();
  setInterval(runDataCleanup, 24 * 60 * 60 * 1000);
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});
