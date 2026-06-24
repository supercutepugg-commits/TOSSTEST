import { toast } from '../toast';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';

const TYPE_LABEL = {
  OVER_PURCHASE: '과다 사입', SALES_DOWN_ORDER_UP: '매출감소·발주증가',
  LOW_TURNOVER: '저회전 식자재', HIGH_WASTE: '폐기 과다',
  STORE_OUTLIER: '유사 매장 대비 이상', PAYMENT_OVERDUE: '결제 미완료',
  LOW_STOCK: '재고 부족',
};
const STATUS_LABEL = {
  OPEN: '미확인', ACKNOWLEDGED: '확인완료', IN_PROGRESS: '조치중', RESOLVED: '조치완료', DISMISSED: '제외처리',
};
const SEVERITY_COLOR = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#6366f1' };

const SETTING_FIELDS = [
  { key: 'salesDropRatio', label: '매출 감소 기준', suffix: '배 (예: 0.8 = 최근 7일 판매가 이전 7일의 80% 미만)', step: 0.05 },
  { key: 'orderSpikeRatio', label: '발주 증가 기준', suffix: '배 (예: 1.2 = 최근 7일 발주금액이 이전 7일의 120% 초과)', step: 0.05 },
  { key: 'overPurchaseRatio', label: '과다 사입 기준', suffix: '배 (예상 소진량 대비 발주량)', step: 0.1 },
  { key: 'highWasteThreshold', label: '폐기 과다 기준', suffix: '(재료 단위, 7일 합계)', step: 100 },
  { key: 'paymentOverdueDays', label: '결제 미완료 기준', suffix: '일 (확정 후 경과일)', step: 1 },
];

function RiskSettingsPanel() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.getRiskSettings().then(setSettings).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.updateRiskSettings(settings);
      setSettings(next);
      toast('저장되었습니다', 'success');
    } catch (e) {
      toast(e.message || '저장에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return null;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>리스크 감지 기준 설정</div>
      <div className="text-muted" style={{ fontSize: 12, marginBottom: 16 }}>
        아래 기준값을 넘으면 자동으로 리스크 알림이 생성됩니다. 가맹점 특성에 맞게 본사에서 직접 조정하세요.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 16 }}>
        {SETTING_FIELDS.map(f => (
          <div className="form-group" key={f.key}>
            <label>{f.label}</label>
            <input type="number" step={f.step} value={settings[f.key]}
              onChange={e => setSettings(s => ({ ...s, [f.key]: Number(e.target.value) }))} />
            <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>{f.suffix}</div>
          </div>
        ))}
      </div>
      <button className="primary" onClick={save} disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
    </div>
  );
}

export default function Risks() {
  const { user } = useAuth();
  const canEditSettings = ['SUPER_ADMIN', 'HQ_ADMIN'].includes(user?.role);
  const [risks, setRisks] = useState([]);
  const [filter, setFilter] = useState('OPEN');
  const [showSettings, setShowSettings] = useState(false);

  const load = () => api.getRisks({ status: filter }).then(setRisks).catch(() => {});
  useEffect(() => { load(); }, [filter]);

  const updateStatus = async (id, status) => {
    const memo = ['RESOLVED', 'DISMISSED'].includes(status) ? prompt('메모 (선택)') : null;
    await api.updateRiskStatus(id, status, memo || undefined);
    load();
  };

  return (
    <div>
      <div className="top-bar">
        <h2>리스크 알림</h2>
        {canEditSettings && (
          <button className="secondary" onClick={() => setShowSettings(s => !s)}>
            {showSettings ? '기준 설정 닫기' : '기준 설정'}
          </button>
        )}
      </div>

      {showSettings && canEditSettings && <RiskSettingsPanel />}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <button key={k} className={filter === k ? 'primary' : 'secondary'} onClick={() => setFilter(k)}>{v}</button>
        ))}
        <button className={!filter ? 'primary' : 'secondary'} onClick={() => setFilter('')}>전체</button>
      </div>

      <div className="card">
        {risks.length === 0 ? <div className="empty">알림 없음</div> : (
          <table>
            <thead><tr><th>심각도</th><th>유형</th><th>가맹점</th><th>내용</th><th>재발</th><th>상태</th><th>발생일</th><th>조치</th></tr></thead>
            <tbody>
              {risks.map(r => (
                <tr key={r.id}>
                  <td><span style={{ color: SEVERITY_COLOR[r.severity], fontWeight: 700, fontSize: 13 }}>{r.severity}</span></td>
                  <td><span className="badge yellow">{TYPE_LABEL[r.type] || r.type}</span></td>
                  <td>{r.store_name || '-'}</td>
                  <td style={{ fontSize: 13, maxWidth: 240 }}>{r.description}</td>
                  <td>
                    {r.occurrence_count > 1
                      ? <span className="badge red">{r.occurrence_count}회</span>
                      : <span className="text-muted" style={{ fontSize: 12 }}>1회</span>}
                  </td>
                  <td><span className="badge green">{STATUS_LABEL[r.status]}</span></td>
                  <td style={{ fontSize: 12, color: '#94a3b8' }}>
                    {new Date(r.created_at).toLocaleDateString('ko-KR')}
                    {r.last_occurred_at && r.occurrence_count > 1 && (
                      <div>최근: {new Date(r.last_occurred_at).toLocaleDateString('ko-KR')}</div>
                    )}
                  </td>
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
