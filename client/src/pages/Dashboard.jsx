import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useStore } from '../StoreContext';
import { useAuth } from '../AuthContext';
import { toast } from '../toast';

const SEVERITY_COLOR = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#6366f1' };
const TYPE_LABEL = {
  OVER_PURCHASE: '과다 사입', SALES_DOWN_ORDER_UP: '매출↓발주↑',
  LOW_TURNOVER: '저회전', HIGH_WASTE: '폐기 과다',
  STORE_OUTLIER: '이상 매장', PAYMENT_OVERDUE: '결제 미완료',
};

const QUICK_LINKS = [
  { to: '/analytics', label: '판매 분석' },
  { to: '/rankings', label: '가맹점 순위' },
  { to: '/orders', label: '주문 관리' },
  { to: '/products', label: '발주 상품' },
  { to: '/ingredients', label: '재료 관리' },
  { to: '/menus', label: '메뉴관리' },
  { to: '/waste', label: '폐기관리' },
  { to: '/purchase-anomalies', label: '사입 이상 모니터링' },
];

const won = (v) => `${Math.round(v || 0).toLocaleString()}원`;

export default function Dashboard() {
  const { currentStore } = useStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentStore) return;
    setData(null);
    setError(null);
    api.getDashboard(currentStore.id).then(setData).catch(e => {
      setError(e.message || '대시보드를 불러오지 못했습니다');
      toast(e.message || '대시보드를 불러오지 못했습니다', 'error');
    });
  }, [currentStore?.id]);

  if (!currentStore) return <div className="empty">가맹점을 선택해주세요</div>;
  if (error) return <div className="empty">{error}</div>;
  if (!data) return <div className="empty">불러오는 중...</div>;

  const cmp = data.salesComparison || {};
  const weekly = data.weeklyStats || [];
  const maxRevenue = Math.max(cmp.lastWeekSameDay?.revenue || 0, cmp.yesterday?.revenue || 0, cmp.today?.revenue || 0, 1);

  const statTiles = [
    { label: '재고부족', value: data.lowStock.length, warn: data.lowStock.length > 0 },
    { label: '검토대기발주', value: data.pendingOrders, warn: data.pendingOrders > 0 },
    { label: '결제대기발주', value: data.paymentPending, warn: data.paymentPending > 0 },
    { label: '미처리리스크', value: data.risks.length, warn: data.risks.length > 0 },
  ];

  return (
    <div className="dash-layout">
      {/* 좌측 패널 */}
      <div className="dash-side">
        <div className="dash-info-card">
          <div className="dash-date">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          <div className="dash-store-name">{currentStore.name}</div>
          <div className="dash-user-name">{user?.name} 님</div>
        </div>

        <div className="dash-stat-tiles">
          {statTiles.map(t => (
            <div key={t.label} className="dash-stat-tile">
              <span className="dash-stat-label">{t.label}</span>
              <span className="dash-stat-value" style={{ color: t.warn ? '#dc2626' : 'var(--text)' }}>{t.value}</span>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>오늘 매출</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--purple)' }}>{won(data.todayRevenue)}</div>
        </div>

        <div className="dash-quicklinks">
          {QUICK_LINKS.map(l => (
            <Link key={l.to} to={l.to} className="dash-quicklink">
              <span>{l.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* 우측 메인 */}
      <div className="dash-main">
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
            <div style={{ fontWeight: 700, marginBottom: 12, color: '#dc2626' }}>재고 부족 재료</div>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, color: '#ef4444' }}>리스크 알림 (미처리)</div>
              <Link to="/risks" style={{ fontSize: 12.5 }}>전체 보기 &rarr;</Link>
            </div>
            <table>
              <thead><tr><th>심각도</th><th>유형</th><th>가맹점</th><th>내용</th><th>발생일</th></tr></thead>
              <tbody>
                {data.risks.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/risks')}>
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
    </div>
  );
}
