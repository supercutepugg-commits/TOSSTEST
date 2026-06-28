import { useEffect, useState, useRef } from 'react';
import { api } from '../api';

const CHECK_INTERVAL_MS = 3 * 60000; // 같은 항목은 3분에 한 번씩만 재확인
const REALERT_COOLDOWN_MS = 3 * 60000; // 같은 항목은 3분 동안 재알림 안 함 (새로고침·새 탭에도 동일 적용)

// localStorage 사용 — sessionStorage는 탭마다 따로 저장되어 새 탭을 열면 쿨다운이 풀려서
// 같은 알림이 또 뜨는 문제가 있었음. localStorage는 같은 브라우저의 모든 탭이 공유하므로
// 새로고침·새 탭 여부와 관계없이 3분 주기가 그대로 유지됨
function loadCooldown(storeId) {
  try {
    const raw = localStorage.getItem(`stock_alert_${storeId}`);
    return raw ? new Map(JSON.parse(raw)) : new Map();
  } catch { return new Map(); }
}
function saveCooldown(storeId, map) {
  try { localStorage.setItem(`stock_alert_${storeId}`, JSON.stringify([...map])); } catch {}
}

export default function StockAlert({ storeId, storeName }) {
  const [alerts, setAlerts] = useState([]);
  const lastAlertedAt = useRef(new Map());

  useEffect(() => {
    lastAlertedAt.current = loadCooldown(storeId);
    setAlerts([]);
  }, [storeId]);

  useEffect(() => {
    const check = async () => {
      const now = Date.now();
      let newLow = [];
      let newRisks = [];

      // 두 요청을 순차로 기다리면 팝업이 그만큼 늦게 뜨므로 병렬로 조회
      const [dashboardResult, risksResult] = await Promise.allSettled([
        api.getDashboard(storeId),
        // 본사 권한이 없는 가맹점 계정에서는 403이 날 수 있음 — allSettled로 묶어서 그 경우만 조용히 무시
        api.getRisks({ status: 'OPEN', store_id: storeId }),
      ]);

      if (dashboardResult.status === 'fulfilled') {
        // 한 번도 안 알렸거나, 쿨다운이 지난 재료만 새로 알림
        newLow = dashboardResult.value.lowStock.filter(i => {
          const last = lastAlertedAt.current.get(`ing_${i.id}`);
          return !last || now - last > REALERT_COOLDOWN_MS;
        });
      } else {
        console.error('StockAlert error:', dashboardResult.reason);
      }

      if (risksResult.status === 'fulfilled') {
        newRisks = risksResult.value.filter(r => {
          const key = `risk_${r.id}`;
          const last = lastAlertedAt.current.get(key);
          // last_occurred_at이 쿨다운 기록 이후로 갱신됐으면(재발생) 다시 알림
          const occurredAt = new Date(r.last_occurred_at || r.created_at).getTime();
          return !last || (now - last > REALERT_COOLDOWN_MS) || occurredAt > last;
        });
      }

      if (newLow.length === 0 && newRisks.length === 0) return;

      for (const i of newLow) lastAlertedAt.current.set(`ing_${i.id}`, now);
      for (const r of newRisks) lastAlertedAt.current.set(`risk_${r.id}`, now);
      saveCooldown(storeId, lastAlertedAt.current);

      const id = now;
      setAlerts(prev => [...prev, { id, ingredients: newLow, risks: newRisks }]);
    };

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [storeId]);

  if (alerts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    }}>
      {alerts.map(alert => {
        const hasStock = alert.ingredients.length > 0;
        const hasRisks = alert.risks.length > 0;
        return (
          <div key={alert.id} style={{
            background: 'var(--bg-card)',
            borderRadius: 20,
            padding: '40px 48px',
            textAlign: 'center',
            boxShadow: '0 30px 90px rgba(0,0,0,0.28), 0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.4)',
            border: '1px solid var(--border)',
            borderTop: '2px solid rgba(220,38,38,0.25)',
            animation: 'popIn 0.3s ease',
            maxWidth: 420,
            width: '90vw',
          }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#dc2626', marginBottom: 4 }}>
              {hasStock && hasRisks ? '리스크 알림!' : hasStock ? '재고 부족!' : '리스크 알림!'}
            </div>
            {storeName && (
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--purple)', marginBottom: 16 }}>
                {storeName}
              </div>
            )}
            <div style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.8, textAlign: 'left' }}>
              {hasStock && (
                <div style={{ marginBottom: hasRisks ? 14 : 0 }}>
                  {hasRisks && <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>재고 부족</div>}
                  {alert.ingredients.map(i => (
                    <div key={`ing-${i.id}`}>
                      <b>{i.name}</b> — 현재 {i.stock}{i.unit} (기준: {i.threshold}{i.unit})
                      {!storeName && i.store_name && (
                        <span style={{ color: 'var(--purple)', fontWeight: 700 }}> [{i.store_name}]</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {hasRisks && (
                <div>
                  {hasStock && <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>기타 리스크</div>}
                  {alert.risks.map(r => (
                    <div key={`risk-${r.id}`}>
                      <b>{r.description || r.type}</b>
                      {!storeName && r.store_name && (
                        <span style={{ color: 'var(--purple)', fontWeight: 700 }}> [{r.store_name}]</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setAlerts(prev => prev.filter(a => a.id !== alert.id))}
              style={{
                marginTop: 24, padding: '10px 32px',
                background: '#dc2626', color: '#fff',
                border: 'none', borderRadius: 10,
                fontSize: 15, fontWeight: 600, cursor: 'pointer',
              }}
            >
              확인
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes popIn {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
