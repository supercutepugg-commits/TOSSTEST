import { useEffect, useState } from 'react';
import { api } from '../api';
import { useStore } from '../StoreContext';

const SEVERITY_COLOR = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#6366f1' };
const TYPE_LABEL = {
  OVER_PURCHASE: '과다 사입', SALES_DOWN_ORDER_UP: '매출↓발주↑',
  LOW_TURNOVER: '저회전', HIGH_WASTE: '폐기 과다',
  STORE_OUTLIER: '이상 매장', PAYMENT_OVERDUE: '결제 미완료',
};

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

  return (
    <div>
      <h2>대시보드 — {currentStore.name}</h2>

      <div className="stat-grid">
        <div className="stat-card" style={{ borderTop: '3px solid var(--purple)' }}>
          <div className="label" style={{ marginBottom: 6 }}>오늘 매출</div>
          <div className="value" style={{ color: 'var(--purple)', fontSize: 24 }}>
            {(data.todayRevenue || 0).toLocaleString()}원
          </div>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${data.lowStock.length > 0 ? '#dc2626' : '#16a34a'}` }}>
          <div className="label" style={{ marginBottom: 6 }}>재고 부족 재료</div>
          <div className="value" style={{ color: data.lowStock.length > 0 ? '#dc2626' : '#16a34a' }}>
            {data.lowStock.length}
          </div>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${data.pendingOrders > 0 ? '#f59e0b' : '#16a34a'}` }}>
          <div className="label" style={{ marginBottom: 6 }}>검토 대기 발주</div>
          <div className="value" style={{ color: data.pendingOrders > 0 ? '#f59e0b' : '#16a34a' }}>
            {data.pendingOrders}
          </div>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${data.paymentPending > 0 ? '#f59e0b' : '#16a34a'}` }}>
          <div className="label" style={{ marginBottom: 6 }}>결제 대기 발주</div>
          <div className="value" style={{ color: data.paymentPending > 0 ? '#f59e0b' : '#16a34a' }}>
            {data.paymentPending}
          </div>
        </div>
        <div className="stat-card" style={{ borderTop: `3px solid ${data.risks.length > 0 ? '#ef4444' : '#16a34a'}` }}>
          <div className="label" style={{ marginBottom: 6 }}>미처리 리스크</div>
          <div className="value" style={{ color: data.risks.length > 0 ? '#ef4444' : '#16a34a' }}>
            {data.risks.length}
          </div>
        </div>
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
