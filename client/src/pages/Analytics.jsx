import { useEffect, useState } from 'react';
import { api } from '../api';
import { useStore } from '../StoreContext';

function DailyChart({ dailyRevenue, stores }) {
  const [tooltip, setTooltip] = useState(null);

  if (!dailyRevenue || dailyRevenue.length === 0) {
    return <div className="empty" style={{ padding: 32 }}>판매 데이터 없음 (POS 웹훅 연결 필요)</div>;
  }

  const dates = [...new Set(dailyRevenue.map(r => r.date))].sort();
  const storeIds = [...new Set(dailyRevenue.map(r => r.store_id))];
  const COLORS = ['#7c3aed', '#06b6d4', '#16a34a', '#f59e0b', '#ef4444', '#ec4899'];

  const byDate = {};
  for (const r of dailyRevenue) {
    if (!byDate[r.date]) byDate[r.date] = {};
    byDate[r.date][r.store_id] = Number(r.revenue);
  }

  const maxRevenue = Math.max(...Object.values(byDate).map(d => Object.values(d).reduce((a, b) => a + b, 0)), 1);
  const CHART_H = 180;

  // Y축 눈금 계산
  const yTicks = 4;
  const tickStep = Math.ceil(maxRevenue / yTicks / 1000) * 1000;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => i * tickStep);

  const fmtWon = v => v >= 10000 ? `${(v / 10000).toFixed(v % 10000 === 0 ? 0 : 1)}만` : `${v.toLocaleString()}`;

  return (
    <div>
      {/* 범례 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        {storeIds.map((sid, i) => {
          const store = stores.find(s => s.id === sid);
          return (
            <div key={sid} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length] }} />
              {store?.name || `매장 ${sid}`}
            </div>
          );
        })}
      </div>

      {/* 차트 영역 */}
      <div style={{ display: 'flex', gap: 0 }}>
        {/* Y축 */}
        <div style={{ display: 'flex', flexDirection: 'column-reverse', justifyContent: 'space-between', paddingBottom: 28, paddingRight: 6, minWidth: 44 }}>
          {ticks.map(t => (
            <div key={t} style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right', lineHeight: 1 }}>{fmtWon(t)}</div>
          ))}
        </div>

        {/* 막대 + 눈금선 */}
        <div style={{ flex: 1, overflowX: 'auto', position: 'relative' }}>
          {/* 수평 눈금선 */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: CHART_H, pointerEvents: 'none' }}>
            {ticks.map(t => (
              <div key={t} style={{
                position: 'absolute', left: 0, right: 0,
                bottom: `${(t / (tickStep * yTicks)) * 100}%`,
                borderBottom: t === 0 ? '1px solid var(--border)' : '1px dashed var(--border)',
              }} />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, minWidth: Math.max(dates.length * 44, 300), height: CHART_H + 28 }}>
            {dates.map(date => {
              const total = storeIds.reduce((s, sid) => s + (byDate[date]?.[sid] || 0), 0);
              return (
                <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                  onMouseMove={e => setTooltip({ date, total, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {/* 스택 막대 */}
                  <div style={{ width: '80%', display: 'flex', flexDirection: 'column-reverse', height: CHART_H, justifyContent: 'flex-start', cursor: 'default' }}>
                    {storeIds.map((sid, i) => {
                      const rev = byDate[date]?.[sid] || 0;
                      if (!rev) return null;
                      const h = Math.round((rev / (tickStep * yTicks)) * CHART_H);
                      return (
                        <div key={sid} style={{
                          width: '100%', height: Math.max(h, 2),
                          background: COLORS[i % COLORS.length],
                          borderRadius: i === storeIds.length - 1 ? '3px 3px 0 0' : 0,
                        }} />
                      );
                    })}
                  </div>
                  {/* 날짜 */}
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, whiteSpace: 'nowrap' }}>
                    {date.slice(5).replace('-', '/')}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 툴팁 */}
          {tooltip && (
            <div style={{
              position: 'fixed', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 12px', fontSize: 13, pointerEvents: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 200,
              left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -110%)',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{tooltip.date}</div>
              <div style={{ color: 'var(--purple)', fontWeight: 700 }}>{tooltip.total.toLocaleString()}원</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const QUICK_RANGES = [
  { label: '당일', days: 0 },
  { label: '전일', days: 1, offset: 1 },
  { label: '1주일', days: 7 },
  { label: '1개월', days: 30 },
];

export default function Analytics() {
  const { currentStore, stores } = useStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedStore, setSelectedStore] = useState('');
  const [fromDate, setFromDate] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

  const applyQuickRange = (r) => {
    const end = new Date(Date.now() - (r.offset || 0) * 86400000);
    const start = new Date(end.getTime() - r.days * 86400000);
    setFromDate(start.toISOString().split('T')[0]);
    setToDate(end.toISOString().split('T')[0]);
  };

  const load = async () => {
    setLoading(true);
    try {
      const params = {
        from: new Date(fromDate).toISOString(),
        to: new Date(toDate + 'T23:59:59').toISOString(),
      };
      if (selectedStore) params.store_id = selectedStore;
      else if (currentStore) params.store_id = currentStore.id;
      const result = await api.getAnalytics(params);
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [currentStore?.id]);

  const totalRevenue = data?.salesByMenu.reduce((s, m) => s + m.total_amount, 0) || 0;
  const totalQty = data?.salesByMenu.reduce((s, m) => s + m.sold_qty, 0) || 0;

  const getRatioColor = (r) => {
    if (r === null) return 'var(--text-3)';
    if (r > 2) return '#dc2626';
    if (r > 1.3) return '#f59e0b';
    if (r < 0.7) return '#3b82f6';
    return '#16a34a';
  };

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>판매 분석</h2>

      {/* 필터 바 */}
      <div className="card analytics-filter-bar">
        <div className="filter-field">
          <label>매장</label>
          <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)}>
            <option value="">전체 매장</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="filter-field">
          <label>조회 기간</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <span className="text-sub">~</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
        </div>
        <div className="filter-field">
          <label>&nbsp;</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {QUICK_RANGES.map(r => (
              <button key={r.label} type="button" className="secondary small" onClick={() => applyQuickRange(r)}>{r.label}</button>
            ))}
          </div>
        </div>
        <button className="primary analytics-search-btn" onClick={load} disabled={loading}>
          {loading ? '조회 중...' : '🔍 조회'}
        </button>
      </div>

      {/* 요약 카드 */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div className="card" style={{ padding: 20 }}>
            <div className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>총 매출</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--purple)' }}>{totalRevenue.toLocaleString()}원</div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>총 판매수량</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{totalQty.toLocaleString()}개</div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>판매 메뉴 종류</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{data.salesByMenu.length}종</div>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>평균 객단가</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {totalQty > 0 ? Math.round(totalRevenue / totalQty).toLocaleString() : 0}원
            </div>
          </div>
        </div>
      )}

      {/* 일별 매출 차트 */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 16 }}>일별 매출</div>
        {loading ? <div className="empty">로딩 중...</div> : (
          <DailyChart dailyRevenue={data?.dailyRevenue} stores={stores} />
        )}
      </div>

      {data && !loading && (
        <>
          {/* 메뉴별 판매량 */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>메뉴별 판매량</div>
            {data.salesByMenu.length === 0 ? (
              <div className="empty">판매 데이터 없음</div>
            ) : (
              <table>
                <thead>
                  <tr><th>메뉴명</th><th>핵심</th><th>판매량</th><th>매출</th><th>주문건수</th><th>주요 식자재 예상 소진</th></tr>
                </thead>
                <tbody>
                  {data.salesByMenu.map((m, i) => (
                    <tr key={i}>
                      <td><b>{m.menu_name}</b></td>
                      <td>{m.is_key ? <span className="badge yellow">★</span> : '-'}</td>
                      <td><span style={{ fontWeight: 700, color: 'var(--purple)' }}>{m.sold_qty.toLocaleString()}</span>개</td>
                      <td>{m.total_amount.toLocaleString()}원</td>
                      <td className="text-sub">{m.order_count}건</td>
                      <td className="text-sub" style={{ fontSize: 12 }}>
                        {m.ingredients.length === 0 ? <span className="badge yellow">레시피 없음</span> :
                          m.ingredients.slice(0, 3).map(i => `${i.name} ${Math.round(i.estimated_usage)}${i.unit}`).join(', ')}
                        {m.ingredients.length > 3 && ` 외 ${m.ingredients.length - 3}종`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 식자재 예상 소진 vs 발주 비교 */}
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 4 }}>식자재 예상 소진 vs 발주량 비교</div>
            <div className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
              비율 2.0 초과 → 과다 사입 의심 &nbsp;|&nbsp; 0.7 미만 → 발주 부족 가능성
            </div>
            {data.comparison.length === 0 ? (
              <div className="empty">비교 데이터 없음 (레시피 등록 필요)</div>
            ) : (
              <table>
                <thead>
                  <tr><th>식자재명</th><th>예상 소진</th><th>실제 발주</th><th>비율</th><th>평가</th></tr>
                </thead>
                <tbody>
                  {data.comparison.map((c, i) => (
                    <tr key={i}>
                      <td><b>{c.name}</b></td>
                      <td className="text-sub">{Math.round(c.estimated).toLocaleString()} {c.unit}</td>
                      <td className="text-sub">{Math.round(c.total_ordered).toLocaleString()} {c.unit}</td>
                      <td><span style={{ fontWeight: 700, color: getRatioColor(c.ratio) }}>{c.ratio !== null ? `${c.ratio}x` : '-'}</span></td>
                      <td>
                        {c.ratio === null ? <span className="badge">미비교</span>
                          : c.ratio > 2 ? <span className="badge red">과다 사입</span>
                          : c.ratio > 1.3 ? <span className="badge yellow">약간 과다</span>
                          : c.ratio < 0.7 ? <span className="badge red">발주 부족</span>
                          : <span className="badge green">적정</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
