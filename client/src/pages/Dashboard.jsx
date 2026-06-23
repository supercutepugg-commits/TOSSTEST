import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useStore } from '../StoreContext';

const SEVERITY_COLOR = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#6366f1' };
const TYPE_LABEL = {
  OVER_PURCHASE: '과다 사입', SALES_DOWN_ORDER_UP: '매출↓발주↑',
  LOW_TURNOVER: '저회전', HIGH_WASTE: '폐기 과다',
  STORE_OUTLIER: '이상 매장', PAYMENT_OVERDUE: '결제 미완료',
};

const QUICK_LINKS = [
  { to: '/ingredients', icon: '🥬', label: '재료 관리' },
  { to: '/menus', icon: '🍽', label: '메뉴 & 레시피' },
  { to: '/products', icon: '📦', label: '발주 상품' },
  { to: '/orders', icon: '📋', label: '주문 관리' },
  { to: '/waste', icon: '🗑', label: '폐기 관리' },
  { to: '/analytics', icon: '📊', label: '판매 분석' },
];

const won = (v) => `${Math.round(v || 0).toLocaleString()}원`;

export default function Dashboard() {
  const { currentStore } = useStore();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!currentStore) return;
    setData(null);
    api.getDashboard(currentStore.id).then(setData).catch(() => {});
  }, [currentStore?.id]);

  if (!currentStore) return <div className="empty">가맹점을 선택해주세요</div>;
  if (!data) return <div className="empty">불러오는 중...</div>;

  const cmp = data.salesComparison || {};
  const weekly = data.weeklyStats || [];
  const maxRevenue = Math.max(cmp.lastWeekSameDay?.revenue || 0, cmp.yesterday?.revenue || 0, cmp.today?.revenue || 0, 1);

  return (
    <div>
      <h2>대시보드 — {currentStore.name}</h2>

      <div className="stat-grid">
        <div className="stat-card" style={{ borderTop: '3px solid var(--purple)' }}>
          <div className="label" style={{ marginBottom: 6 }}>오늘 매출</div>
          <div className="value" style={{ color: 'var(--purple)', fontSize: 24 }}>{won(data.todayRevenue)}</div>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${data.lowStock.length > 0 ? '#dc2626' : '#16a34a'}` }}>
          <div className="label" style={{ marginBottom: 6 }}>재고 부족 재료</div>
          <div className="value" style={{ color: data.lowStock.length > 0 ? '#dc2626' : '#16a34a' }}>{data.lowStock.length}</div>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${data.pendingOrders > 0 ? '#f59e0b' : '#16a34a'}` }}>
          <div className="label" style={{ marginBottom: 6 }}>검토 대기 발주</div>
          <div className="value" style={{ color: data.pendingOrders > 0 ? '#f59e0b' : '#16a34a' }}>{data.pendingOrders}</div>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${data.paymentPending > 0 ? '#f59e0b' : '#16a34a'}` }}>
          <div className="label" style={{ marginBottom: 6 }}>결제 대기 발주</div>
          <div className="value" style={{ color: data.paymentPending > 0 ? '#f59e0b' : '#16a34a' }}>{data.paymentPending}</div>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${data.risks.length > 0 ? '#ef4444' : '#16a34a'}` }}>
          <div className="label" style={{ marginBottom: 6 }}>미처리 리스크</div>
          <div className="value" style={{ color: data.risks.length > 0 ? '#ef4444' : '#16a34a' }}>{data.risks.length}</div>
        </div>
      </div>

      {/* 빠른 메뉴 */}
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
          {QUICK_LINKS.map(l => (
            <Link key={l.to} to={l.to} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              padding: '14px 8px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--bg-elevated)', textDecoration: 'none', color: 'var(--text)', fontSize: 13,
            }}>
              <span style={{ fontSize: 22 }}>{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      {/* 전주/전일 매출현황 */}
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 12 }}>전주/전일 매출현황</div>
        <table>
          <thead>
            <tr><th>항목</th><th>전주 동요일</th><th>전일</th><th>당일</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>매출액</td>
              <td>{won(cmp.lastWeekSameDay?.revenue)}</td>
              <td>{won(cmp.yesterday?.revenue)}</td>
              <td><b>{won(cmp.today?.revenue)}</b></td>
            </tr>
            <tr>
              <td>주문건수</td>
              <td>{(cmp.lastWeekSameDay?.orderCount || 0).toLocaleString()}</td>
              <td>{(cmp.yesterday?.orderCount || 0).toLocaleString()}</td>
              <td><b>{(cmp.today?.orderCount || 0).toLocaleString()}</b></td>
            </tr>
          </tbody>
        </table>

        {/* 간단 막대 비교 */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, height: 140, marginTop: 20, paddingLeft: 8 }}>
          {[
            { label: '전주동요일', v: cmp.lastWeekSameDay?.revenue || 0, color: '#94a3b8' },
            { label: '전일', v: cmp.yesterday?.revenue || 0, color: '#f59e0b' },
            { label: '당일', v: cmp.today?.revenue || 0, color: 'var(--purple)' },
          ].map(b => (
            <div key={b.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{ fontSize: 12, marginBottom: 4, color: 'var(--text-3)' }}>{won(b.v)}</div>
              <div style={{ width: '60%', maxWidth: 60, height: Math.max((b.v / maxRevenue) * 100, 2), background: b.color, borderRadius: '4px 4px 0 0' }} />
              <div style={{ fontSize: 12, marginTop: 6, color: 'var(--text-2)' }}>{b.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 1주일간 매출통계 */}
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 12 }}>1주일간 매출통계</div>
        <table>
          <thead>
            <tr><th>일자</th><th>요일</th><th>매출액</th><th>주문건수</th></tr>
          </thead>
          <tbody>
            {weekly.map(w => {
              const color = w.weekday === '토' ? '#2563eb' : w.weekday === '일' ? '#dc2626' : undefined;
              return (
                <tr key={w.date}>
                  <td style={{ color }}>{w.date}</td>
                  <td style={{ color }}>{w.weekday}</td>
                  <td>{won(w.revenue)}</td>
                  <td>{w.orderCount.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.lowStock.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #dc2626' }}>
          <div style={{ fontWeight: 700, marginBottom: 12, color: '#dc2626' }}>⚠ 재고 부족 재료</div>
          <table>
            <thead>
              <tr><th>재료명</th><th>현재 재고</th><th>알림 기준</th><th>상태</th></tr>
            </thead>
            <tbody>
              {data.lowStock.map(i => {
                const pct = i.threshold > 0 ? Math.min((i.stock / i.threshold) * 100, 100) : 0;
                return (
                  <tr key={i.id}>
                    <td><b>{i.name}</b></td>
                    <td>{i.stock} {i.unit}</td>
                    <td>{i.threshold} {i.unit}</td>
                    <td>
                      <span className="badge red">부족</span>
                      <div className="progress-bar" style={{ width: 80 }}>
                        <div className="fill" style={{ width: `${pct}%`, background: '#dc2626' }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data.risks.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontWeight: 700, marginBottom: 12, color: '#ef4444' }}>리스크 알림 (미처리)</div>
          <table>
            <thead><tr><th>심각도</th><th>유형</th><th>가맹점</th><th>내용</th><th>발생일</th></tr></thead>
            <tbody>
              {data.risks.map(r => (
                <tr key={r.id}>
                  <td><span style={{ color: SEVERITY_COLOR[r.severity], fontWeight: 700, fontSize: 13 }}>{r.severity}</span></td>
                  <td><span className="badge yellow">{TYPE_LABEL[r.type] || r.type}</span></td>
                  <td style={{ fontSize: 13 }}>{r.store_name || '-'}</td>
                  <td style={{ fontSize: 13 }}>{r.description}</td>
                  <td className="text-muted" style={{ fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString('ko-KR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 12 }}>최근 재고 알림 내역</div>
        {data.recentAlerts.length === 0 ? (
          <div className="empty">알림 내역 없음</div>
        ) : (
          <table>
            <thead><tr><th>재료</th><th>발송 시점 재고</th><th>발송 시각</th></tr></thead>
            <tbody>
              {data.recentAlerts.map(a => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.stock_at_alert} {a.unit}</td>
                  <td className="text-muted">{new Date(a.sent_at).toLocaleString('ko-KR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
