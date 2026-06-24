import { useEffect, useState } from 'react';
import { api } from '../api';
import { exportCsv } from '../exportCsv';

const ENTITY_LABEL = { PRODUCT: '상품', INGREDIENT: '재료', MENU: '메뉴', STORE: '가맹점', USER: '사용자', PAYMENT: '결제' };
const ACTION_LABEL = { CREATE: '생성', UPDATE: '수정', DELETE: '삭제', PAID: '결제완료', REFUND_FULL: '전액환불', REFUND_PARTIAL: '부분환불' };

function diffSummary(before, after) {
  if (!before && after) return JSON.stringify(after);
  if (before && !after) return '-';
  try {
    const b = JSON.parse(before);
    const a = JSON.parse(after);
    const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
    const parts = [];
    for (const k of keys) {
      if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) parts.push(`${k}: ${b[k]} → ${a[k]}`);
    }
    return parts.join(', ') || '-';
  } catch {
    return '-';
  }
}

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [entityType, setEntityType] = useState('');

  const load = () => api.getAuditLog({ entity_type: entityType || undefined }).then(setLogs).catch(() => {});
  useEffect(() => { load(); }, [entityType]);

  const exportLogs = () => {
    const rows = [
      ['일시', '처리자', '대상', 'ID', '작업', '변경 내용'],
      ...logs.map(l => [
        new Date(l.created_at).toLocaleString('ko-KR'), l.user_name || '시스템',
        ENTITY_LABEL[l.entity_type] || l.entity_type, l.entity_id,
        ACTION_LABEL[l.action] || l.action, diffSummary(l.before_value, l.after_value),
      ]),
    ];
    exportCsv(`감사로그_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  return (
    <div>
      <div className="top-bar">
        <h2 style={{ marginBottom: 0 }}>변경 이력 (감사 로그)</h2>
        <button className="secondary" onClick={exportLogs} disabled={logs.length === 0}>엑셀 다운로드</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className={!entityType ? 'primary' : 'secondary'} onClick={() => setEntityType('')}>전체</button>
        {Object.entries(ENTITY_LABEL).map(([k, v]) => (
          <button key={k} className={entityType === k ? 'primary' : 'secondary'} onClick={() => setEntityType(k)}>{v}</button>
        ))}
      </div>
      <div className="card">
        {logs.length === 0 ? <div className="empty">변경 이력 없음</div> : (
          <table>
            <thead><tr><th>일시</th><th>처리자</th><th>대상</th><th>작업</th><th>변경 내용</th></tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td className="text-muted" style={{ fontSize: 12 }}>{new Date(l.created_at).toLocaleString('ko-KR')}</td>
                  <td>{l.user_name || '시스템'}</td>
                  <td><span className="badge yellow">{ENTITY_LABEL[l.entity_type] || l.entity_type}</span> #{l.entity_id}</td>
                  <td>{ACTION_LABEL[l.action] || l.action}</td>
                  <td style={{ fontSize: 13 }}>{diffSummary(l.before_value, l.after_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
