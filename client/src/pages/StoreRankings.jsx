import { useEffect, useState } from 'react';
import { api } from '../api';

const QUICK_RANGES = [
  { label: '1주일', days: 7 },
  { label: '1개월', days: 30 },
  { label: '3개월', days: 90 },
];

const won = (v) => `${Math.round(v || 0).toLocaleString()}원`;

export default function StoreRankings() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.getStoreRankings({ from: fromDate, to: new Date(toDate + 'T23:59:59').toISOString() });
      setData(result);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const applyQuickRange = (days) => {
    const end = new Date();
    const start = new Date(end.getTime() - days * 86400000);
    setFromDate(start.toISOString().split('T')[0]);
    setToDate(end.toISOString().split('T')[0]);
  };

  const maxRevenue = Math.max(1, ...(data?.salesRanking || []).map(r => r.revenue));
  const maxOrderAmt = Math.max(1, ...(data?.orderRanking || []).map(r => r.order_amount));

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>가맹점 순위</h2>

      <div className="card kicc-search-panel">
        <div className="kicc-search-row">
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
                <button key={r.label} type="button" className="secondary small" onClick={() => applyQuickRange(r.days)}>{r.label}</button>
              ))}
            </div>
          </div>
          <button className="primary kicc-search-btn" onClick={load} disabled={loading}>
            {loading ? '조회 중...' : '조회'}
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 12 }}>매출 순위</div>
        {!data || data.salesRanking.length === 0 ? (
          <div className="empty">데이터 없음</div>
        ) : (
          <table>
            <thead>
              <tr><th>순위</th><th>가맹점</th><th>매출</th><th>주문건수</th><th></th></tr>
            </thead>
            <tbody>
              {data.salesRanking.map((r, i) => (
                <tr key={r.store_id}>
                  <td><b>{i + 1}</b></td>
                  <td>{r.store_name}</td>
                  <td><b style={{ color: 'var(--purple)' }}>{won(r.revenue)}</b></td>
                  <td className="text-sub">{r.order_count.toLocaleString()}건</td>
                  <td style={{ width: 160 }}>
                    <div className="progress-bar">
                      <div className="fill" style={{ width: `${(r.revenue / maxRevenue) * 100}%`, background: 'var(--purple)' }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 12 }}>발주 순위</div>
        {!data || data.orderRanking.length === 0 ? (
          <div className="empty">데이터 없음</div>
        ) : (
          <table>
            <thead>
              <tr><th>순위</th><th>가맹점</th><th>발주금액</th><th>발주건수</th><th></th></tr>
            </thead>
            <tbody>
              {data.orderRanking.map((r, i) => (
                <tr key={r.store_id}>
                  <td><b>{i + 1}</b></td>
                  <td>{r.store_name}</td>
                  <td><b style={{ color: '#f59e0b' }}>{won(r.order_amount)}</b></td>
                  <td className="text-sub">{r.order_count.toLocaleString()}건</td>
                  <td style={{ width: 160 }}>
                    <div className="progress-bar">
                      <div className="fill" style={{ width: `${(r.order_amount / maxOrderAmt) * 100}%`, background: '#f59e0b' }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 4 }}>매출 대비 발주율</div>
        <div className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
          발주율 = 발주금액 ÷ 매출. 매출에 비해 발주(원가 지출)가 얼마나 큰지 보여줍니다 — 높을수록 마진이 줄어들거나 과다 발주일 가능성, 매출이 있는데 발주율이 너무 낮으면 재고 소진/품절 위험이 있을 수 있습니다.
        </div>
        {!data || data.efficiencyRanking.length === 0 ? (
          <div className="empty">데이터 없음</div>
        ) : (
          <table>
            <thead>
              <tr><th>순위</th><th>가맹점</th><th>매출</th><th>발주금액</th><th>발주율</th><th>평가</th></tr>
            </thead>
            <tbody>
              {data.efficiencyRanking.map((r, i) => (
                <tr key={r.store_id}>
                  <td><b>{i + 1}</b></td>
                  <td>{r.store_name}</td>
                  <td>{won(r.revenue)}</td>
                  <td>{won(r.order_amount)}</td>
                  <td>
                    <b style={{ color: r.ratio === null ? 'var(--text-3)' : r.ratio > 80 ? '#dc2626' : r.ratio < 30 ? '#dc2626' : 'var(--text)' }}>
                      {r.ratio === null ? '-' : `${r.ratio}%`}
                    </b>
                  </td>
                  <td>
                    {r.ratio === null
                      ? <span className="badge">매출 없음</span>
                      : r.ratio > 80 ? <span className="badge red">발주 과다 의심</span>
                      : r.ratio < 30 ? <span className="badge red">발주 부족 의심</span>
                      : r.ratio <= 50 ? <span className="badge green">양호</span>
                      : <span className="badge yellow">주의</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
