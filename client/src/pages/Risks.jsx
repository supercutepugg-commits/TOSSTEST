import { useEffect, useState } from 'react';
import { api } from '../api';

const TYPE_LABEL = {
  OVER_PURCHASE: '과다 사입', SALES_DOWN_ORDER_UP: '매출감소·발주증가',
  LOW_TURNOVER: '저회전 식자재', HIGH_WASTE: '폐기 과다',
  STORE_OUTLIER: '유사 매장 대비 이상', PAYMENT_OVERDUE: '결제 미완료',
};
const STATUS_LABEL = {
  OPEN: '미확인', ACKNOWLEDGED: '확인완료', IN_PROGRESS: '조치중', RESOLVED: '조치완료', DISMISSED: '제외처리',
};
const SEVERITY_COLOR = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#6366f1' };

export default function Risks() {
  const [risks, setRisks] = useState([]);
  const [filter, setFilter] = useState('OPEN');

  const load = () => api.getRisks({ status: filter }).then(setRisks).catch(() => {});
  useEffect(() => { load(); }, [filter]);

  const updateStatus = async (id, status) => {
    const memo = ['RESOLVED', 'DISMISSED'].includes(status) ? prompt('메모 (선택)') : null;
    await api.updateRiskStatus(id, status, memo || undefined);
    load();
  };

  return (
    <div>
      <h2>리스크 알림</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <button key={k} className={filter === k ? 'primary' : 'secondary'} onClick={() => setFilter(k)}>{v}</button>
        ))}
        <button className={!filter ? 'primary' : 'secondary'} onClick={() => setFilter('')}>전체</button>
      </div>

      <div className="card">
        {risks.length === 0 ? <div className="empty">알림 없음</div> : (
          <table>
            <thead><tr><th>심각도</th><th>유형</th><th>가맹점</th><th>내용</th><th>상태</th><th>발생일</th><th>조치</th></tr></thead>
            <tbody>
              {risks.map(r => (
                <tr key={r.id}>
                  <td><span style={{ color: SEVERITY_COLOR[r.severity], fontWeight: 700, fontSize: 13 }}>{r.severity}</span></td>
                  <td><span className="badge yellow">{TYPE_LABEL[r.type] || r.type}</span></td>
                  <td>{r.store_name || '-'}</td>
                  <td style={{ fontSize: 13, maxWidth: 240 }}>{r.description}</td>
                  <td><span className="badge green">{STATUS_LABEL[r.status]}</span></td>
                  <td style={{ fontSize: 12, color: '#94a3b8' }}>{new Date(r.created_at).toLocaleDateString('ko-KR')}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    {r.status === 'OPEN' && <button className="secondary small" onClick={() => updateStatus(r.id, 'ACKNOWLEDGED')}>확인</button>}
                    {r.status === 'ACKNOWLEDGED' && <button className="secondary small" onClick={() => updateStatus(r.id, 'IN_PROGRESS')}>조치중</button>}
                    {r.status === 'IN_PROGRESS' && <button className="primary small" onClick={() => updateStatus(r.id, 'RESOLVED')}>완료</button>}
                    {!['RESOLVED', 'DISMISSED'].includes(r.status) && <button className="danger small" onClick={() => updateStatus(r.id, 'DISMISSED')}>제외</button>}
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
