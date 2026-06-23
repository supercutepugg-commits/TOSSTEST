import { useEffect, useState } from 'react';
import { api } from '../api';

const QUICK_RANGES = [
  { label: '1주일', days: 7 },
  { label: '1개월', days: 30 },
  { label: '3개월', days: 90 },
];

export default function PurchaseAnomalies() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.getPurchaseAnomalies({ from: fromDate, to: new Date(toDate + 'T23:59:59').toISOString() });
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

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>사입 이상 모니터링</h2>
      <p className="text-muted" style={{ marginBottom: 16, fontSize: 13 }}>
        매출 기준 예상 식자재 소진량 대비 실제 발주량을 가맹점별로 비교해서, 본사 외 경로로 사입했을 가능성이 있는 가맹점을 찾아냅니다.
      </p>

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
        <div style={{ fontWeight: 700, marginBottom: 4 }}>가맹점별 사입 이상 현황</div>
        <div className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
          과다사입 의심 식자재 = 발주량이 예상 소진량의 2배 초과 &nbsp;|&nbsp; 발주부족 의심 = 0.7배 미만
        </div>
        {!data || data.anomalies.length === 0 ? (
          <div className="empty">데이터 없음</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>가맹점</th>
                <th>과다사입 의심 식자재</th>
                <th>발주부족 의심 식자재</th>
                <th>가장 심한 항목</th>
                <th>리스크 알림 발생</th>
              </tr>
            </thead>
            <tbody>
              {data.anomalies.map(a => (
                <tr key={a.store_id}>
                  <td><b>{a.store_name}</b></td>
                  <td>
                    {a.over_count > 0
                      ? <span className="badge red">{a.over_count}건</span>
                      : <span className="text-sub">0건</span>}
                  </td>
                  <td>
                    {a.under_count > 0
                      ? <span className="badge yellow">{a.under_count}건</span>
                      : <span className="text-sub">0건</span>}
                  </td>
                  <td className="text-sub" style={{ fontSize: 13 }}>
                    {a.worst_over ? `${a.worst_over.name} (${a.worst_over.ratio}배)` : '-'}
                  </td>
                  <td>
                    {a.risk_alert_count > 0
                      ? <span className="badge red">{a.risk_alert_count}회</span>
                      : <span className="text-sub">0회</span>}
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
