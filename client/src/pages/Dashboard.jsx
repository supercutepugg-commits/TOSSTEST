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
  LOW_STOCK: '재고 부족',
};

// 판매분석·가맹점순위 등 브랜드 전체를 보는 화면은 본사 탭(가맹점 미선택 메뉴)에 이미 있어 여기서는 제외 —
// 이 대시보드는 '한 가맹점' 단위 화면이므로, 그 가맹점에 한정된 작업으로만 구성
const QUICK_LINKS = [
  { to: '/ingredients', label: '재료 관리' },
  { to: '/menus', label: '메뉴 & 레시피' },
  { to: '/waste', label: '폐기 관리' },
];

const won = (v) => `${Math.round(v || 0).toLocaleString()}원`;

// 최근 7일 매출 흐름을 부드러운 곡선의 영역 차트로 보여준다 (3개짜리 막대 비교보다 추세를 보기 쉽고
// 포인트가 늘어나도 그대로 확장되는 형태라 더 고급스러운 느낌을 줄 수 있음)
// Catmull-Rom 곡선은 0→3000→0처럼 값 차이가 크면 점 사이에서 오버슈트(넘침)가 생겨
// 봉우리 앞뒤가 출렁이는 것처럼 보임. 차트 라이브러리들이 쓰는 monotone cubic(Fritsch-Carlson)
// 방식으로 바꿔서 점들 사이 구간을 넘어서는 굴곡 없이 매끄럽게만 잇도록 함
function smoothPath(points) {
  const n = points.length;
  if (n < 2) return '';
  if (n === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1].x - points[i].x;
    m[i] = (points[i + 1].y - points[i].y) / dx[i];
  }
  const tan = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    tan[i] = (m[i - 1] * m[i] <= 0) ? 0 : (m[i - 1] + m[i]) / 2;
  }
  tan[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { tan[i] = 0; tan[i + 1] = 0; continue; }
    const a = tan[i] / m[i], b = tan[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      tan[i] = t * a * m[i];
      tan[i + 1] = t * b * m[i];
    }
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i], p1 = points[i + 1];
    const cp1x = p0.x + dx[i] / 3;
    const cp1y = p0.y + tan[i] * dx[i] / 3;
    const cp2x = p1.x - dx[i] / 3;
    const cp2y = p1.y - tan[i + 1] * dx[i] / 3;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

function WeeklyTrendChart({ weekly }) {
  if (!weekly || weekly.length === 0) return null;
  const W = 700, H = 170, PAD_X = 14, PAD_TOP = 38, PAD_BOTTOM = 10;
  const values = weekly.map(w => w.revenue || 0);
  const max = Math.max(...values, 1);
  const step = (W - PAD_X * 2) / (weekly.length - 1 || 1);
  const points = values.map((v, i) => ({
    x: PAD_X + step * i,
    y: PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * (1 - v / max),
    v,
  }));
  const peakIdx = values.indexOf(max);
  const lastIdx = points.length - 1;

  const linePath = smoothPath(points);
  const baseY = H - PAD_BOTTOM;
  const areaPath = `${linePath} L ${points[lastIdx].x.toFixed(1)} ${baseY} L ${points[0].x.toFixed(1)} ${baseY} Z`;

  // 모든 점에 숫자를 박으면 빽빽해서 지저분해 보이므로, 가장 중요한 두 지점(최고 매출일·오늘)만 강조해서 보여준다
  const highlightIdxs = new Set([peakIdx, lastIdx]);

  return (
    <div className="dash-trend-chart">
      <div className="dash-trend-title">최근 7일 매출 추이</div>
      <svg className="dash-trend-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="dashTrendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--purple)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--purple)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="dashTrendStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--purple-dark)" />
            <stop offset="100%" stopColor="var(--purple)" />
          </linearGradient>
        </defs>
        <line className="dash-trend-baseline" x1={PAD_X} y1={baseY} x2={W - PAD_X} y2={baseY} />
        <path className="dash-trend-area" d={areaPath} />
        <path className="dash-trend-line" d={linePath} />
        {points.map((p, i) => {
          const isHighlight = highlightIdxs.has(i) && p.v > 0;
          return (
            <g key={i}>
              {isHighlight && (
                <text
                  className={'dash-trend-value' + (i === peakIdx ? ' peak' : '')}
                  x={Math.min(Math.max(p.x, 30), W - 30)}
                  y={Math.max(p.y - 14, 14)}
                >
                  {Math.round(p.v).toLocaleString()}원
                </text>
              )}
              {p.v > 0 && (
                <circle className={'dash-trend-dot' + (i === peakIdx ? ' peak' : i === lastIdx ? ' current' : '')}
                  cx={p.x} cy={p.y} r={isHighlight ? 5 : 3} />
              )}
            </g>
          );
        })}
      </svg>
      <div className="dash-trend-labels">
        {weekly.map(w => (
          <div key={w.date} className={
            'dash-trend-label' + (w.weekday === '토' ? ' weekend-sat' : w.weekday === '일' ? ' weekend-sun' : '')
          }>
            {w.date.slice(5)}<span className="dash-trend-weekday">{w.weekday}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

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

  const statTiles = [
    { label: '재고부족', value: data.lowStock.length, warn: data.lowStock.length > 0 },
    { label: '검토대기발주', value: data.pendingOrders, warn: data.pendingOrders > 0 },
    { label: '결제대기발주', value: data.paymentPending, warn: data.paymentPending > 0 },
    { label: '미처리리스크', value: data.risks.length, warn: data.risks.length > 0 },
  ];

  const todayVsYesterday = cmp.yesterday?.revenue > 0
    ? Math.round(((data.todayRevenue - cmp.yesterday.revenue) / cmp.yesterday.revenue) * 1000) / 10
    : null;

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
            <div key={t.label} className={'dash-stat-tile' + (t.warn ? ' warn' : '')}>
              <span className="dash-stat-value" style={{ color: t.warn ? '#dc2626' : 'var(--text)' }}>{t.value}</span>
              <span className="dash-stat-label">{t.label}</span>
            </div>
          ))}
        </div>

        <div className="dash-revenue-card">
          <div className="dash-section-title" style={{ marginBottom: 10 }}>오늘 매출</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--purple)', letterSpacing: '-0.3px' }}>{won(data.todayRevenue)}</div>
          {todayVsYesterday !== null && (
            <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: todayVsYesterday >= 0 ? '#16a34a' : '#dc2626' }}>
              {todayVsYesterday >= 0 ? '▲' : '▼'} 전일 대비 {Math.abs(todayVsYesterday)}%
            </div>
          )}
        </div>

        <div className="dash-quicklinks">
          {QUICK_LINKS.map(l => (
            <Link key={l.to} to={l.to} className="dash-quicklink">
              <span>{l.label}</span>
              <span className="dash-quicklink-arrow">&rarr;</span>
            </Link>
          ))}
        </div>
      </div>

      {/* 우측 메인 */}
      <div className="dash-main">
        {/* 전주/전일 매출현황 */}
        <div className="card">
          <div className="dash-section-title">전주/전일 매출현황</div>
          <table className="dash-table">
            <thead>
              <tr><th>항목</th><th>전주 동요일</th><th>전일</th><th>당일</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>총매출액</td>
                <td>{won(cmp.lastWeekSameDay?.revenue)}</td>
                <td>{won(cmp.yesterday?.revenue)}</td>
                <td><b>{won(cmp.today?.revenue)}</b></td>
              </tr>
              <tr>
                <td>순매출액</td>
                <td>{won(cmp.lastWeekSameDay?.netAmount)}</td>
                <td>{won(cmp.yesterday?.netAmount)}</td>
                <td><b>{won(cmp.today?.netAmount)}</b></td>
              </tr>
              <tr>
                <td>현금금액</td>
                <td>{won(cmp.lastWeekSameDay?.cashAmount)}</td>
                <td>{won(cmp.yesterday?.cashAmount)}</td>
                <td><b>{won(cmp.today?.cashAmount)}</b></td>
              </tr>
              <tr>
                <td>카드금액</td>
                <td>{won(cmp.lastWeekSameDay?.cardAmount)}</td>
                <td>{won(cmp.yesterday?.cardAmount)}</td>
                <td><b>{won(cmp.today?.cardAmount)}</b></td>
              </tr>
              <tr>
                <td>주문건수</td>
                <td>{(cmp.lastWeekSameDay?.orderCount || 0).toLocaleString()}</td>
                <td>{(cmp.yesterday?.orderCount || 0).toLocaleString()}</td>
                <td><b>{(cmp.today?.orderCount || 0).toLocaleString()}</b></td>
              </tr>
            </tbody>
          </table>

          <WeeklyTrendChart weekly={weekly} />
        </div>

        {/* 1주일간 매출통계 */}
        <div className="card">
          <div className="dash-section-title">1주일간 매출통계</div>
          <table className="dash-table">
            <thead>
              <tr><th>일자</th><th>요일</th><th>총매출액</th><th>순매출액</th><th>NET매출액</th><th>건수</th></tr>
            </thead>
            <tbody>
              {weekly.map(w => {
                const color = w.weekday === '토' ? '#2563eb' : w.weekday === '일' ? '#dc2626' : undefined;
                return (
                  <tr key={w.date}>
                    <td style={{ color }}>{w.date}</td>
                    <td style={{ color }}>{w.weekday}</td>
                    <td>{won(w.revenue)}</td>
                    <td>{won(w.netAmount)}</td>
                    <td>{won(w.supplyAmount)}</td>
                    <td>{w.orderCount.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {data.lowStock.length > 0 && (
          <div className="card" style={{ borderLeft: '4px solid #dc2626' }}>
            <div className="dash-section-title" style={{ color: '#dc2626' }}>재고 부족 재료</div>
            <table className="dash-table">
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
              <div className="dash-section-title" style={{ color: '#ef4444', marginBottom: 0 }}>리스크 알림 (미처리)</div>
              <Link to="/risks" style={{ fontSize: 12.5 }}>전체 보기 &rarr;</Link>
            </div>
            <table className="dash-table">
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
          <div className="dash-section-title">최근 재고 알림 내역</div>
          {data.recentAlerts.length === 0 ? (
            <div className="empty">알림 내역 없음</div>
          ) : (
            <table className="dash-table">
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
