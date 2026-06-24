import { useEffect, useState } from 'react';
import { api } from '../api';
import { exportCsv } from '../exportCsv';
import Loading from '../components/Loading';

const QUICK_RANGES = [
  { label: '1주일', days: 7 },
  { label: '1개월', days: 30 },
  { label: '3개월', days: 90 },
];

const won = (v) => `${Math.round(v || 0).toLocaleString()}원`;

export default function Settlement() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.getSettlement({ from: fromDate, to: new Date(toDate + 'T23:59:59').toISOString() });
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

  const exportSettlement = () => {
    if (!data) return;
    const rows = [
      [`조회기간: ${fromDate} ~ ${toDate}`],
      [],
      ['가맹점', '결제건수', '결제금액', '환불금액', '정산금액(순매출)'],
      ...data.settlement.map(s => [s.store_name, s.order_count, s.gross, s.refunded, s.net]),
      [],
      ['합계', data.totals.order_count, data.totals.gross, data.totals.refunded, data.totals.net],
      [],
      ['상품명', '판매수량', '결제금액', '환불금액', '순매출'],
      ...(data.byProduct || []).map(p => [p.product_name, p.qty, p.gross, p.refunded, p.net]),
    ];
    exportCsv(`정산리포트_${fromDate}_${toDate}.csv`, rows);
  };

  return (
    <div>
      <div className="top-bar">
        <h2 style={{ marginBottom: 0 }}>정산 리포트</h2>
        <button className="secondary" onClick={exportSettlement} disabled={!data}>엑셀 다운로드</button>
      </div>

      <div className="card kicc-search-panel">
        <div className="kicc-search-row">
          <div className="filter-field">
            <label>조회 기간 (결제일 기준)</label>
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

      {loading ? (
        <Loading />
      ) : !data || data.settlement.length === 0 ? (
        <div className="card"><div className="empty">정산 데이터 없음</div></div>
      ) : (
        <>
          {data.previousPeriod && (() => {
            const prevNet = data.previousPeriod.totals.net;
            const diff = data.totals.net - prevNet;
            const pct = prevNet > 0 ? Math.round((diff / prevNet) * 1000) / 10 : null;
            const up = diff >= 0;
            return (
              <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div className="text-muted" style={{ fontSize: 13 }}>
                  직전 동일 기간 ({data.previousPeriod.from.slice(0, 10)} ~ {data.previousPeriod.to.slice(0, 10)}) 순매출 {won(prevNet)} 대비
                </div>
                <div style={{ fontWeight: 700, color: up ? '#16a34a' : '#dc2626', fontSize: 15 }}>
                  {up ? '▲' : '▼'} {won(Math.abs(diff))}{pct !== null && ` (${up ? '+' : ''}${pct}%)`}
                </div>
              </div>
            );
          })()}

          <div className="card" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr><th>가맹점</th><th>결제건수</th><th>결제금액</th><th>환불금액</th><th>정산금액</th></tr>
              </thead>
              <tbody>
                {data.settlement.map(s => (
                  <tr key={s.store_id}>
                    <td><b>{s.store_name}</b></td>
                    <td className="text-sub">{s.order_count.toLocaleString()}건</td>
                    <td>{won(s.gross)}</td>
                    <td style={{ color: s.refunded > 0 ? '#dc2626' : undefined }}>{s.refunded > 0 ? `-${won(s.refunded)}` : '-'}</td>
                    <td><b style={{ color: 'var(--purple)' }}>{won(s.net)}</b></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                  <td>합계</td>
                  <td>{data.totals.order_count.toLocaleString()}건</td>
                  <td>{won(data.totals.gross)}</td>
                  <td style={{ color: data.totals.refunded > 0 ? '#dc2626' : undefined }}>
                    {data.totals.refunded > 0 ? `-${won(data.totals.refunded)}` : '-'}
                  </td>
                  <td style={{ color: 'var(--purple)' }}>{won(data.totals.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {data.byProduct?.length > 0 && (
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 12 }}>상품별 매출 분해</div>
              <table>
                <thead>
                  <tr><th>상품명</th><th>판매수량</th><th>매출(결제금액)</th><th>환불금액</th><th>순매출</th><th>비중</th></tr>
                </thead>
                <tbody>
                  {data.byProduct.map(p => (
                    <tr key={p.product_name}>
                      <td><b>{p.product_name}</b></td>
                      <td className="text-sub">{p.qty.toLocaleString()}</td>
                      <td>{won(p.gross)}</td>
                      <td style={{ color: p.refunded > 0 ? '#dc2626' : undefined }}>{p.refunded > 0 ? `-${won(p.refunded)}` : '-'}</td>
                      <td><b style={{ color: 'var(--purple)' }}>{won(p.net)}</b></td>
                      <td className="text-sub">
                        {data.totals.net > 0 ? `${Math.round((p.net / data.totals.net) * 1000) / 10}%` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
