import { useEffect, useState, useRef } from 'react';
import { api } from '../api';

const CHECK_INTERVAL_MS = 60000; // 5초는 너무 잦아서 1분으로 완화
const REALERT_COOLDOWN_MS = 30 * 60000; // 재고가 기준선 근처에서 오르내려도 같은 재료는 30분 동안 재알림 안 함

function loadCooldown(storeId) {
  try {
    const raw = sessionStorage.getItem(`stock_alert_${storeId}`);
    return raw ? new Map(JSON.parse(raw)) : new Map();
  } catch { return new Map(); }
}
function saveCooldown(storeId, map) {
  try { sessionStorage.setItem(`stock_alert_${storeId}`, JSON.stringify([...map])); } catch {}
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
      try {
        const { lowStock } = await api.getDashboard(storeId);
        const now = Date.now();

        // 한 번도 안 알렸거나, 쿨다운이 지난 재료만 새로 알림
        const newLow = lowStock.filter(i => {
          const last = lastAlertedAt.current.get(i.id);
          return !last || now - last > REALERT_COOLDOWN_MS;
        });
        if (newLow.length > 0) {
          const id = now;
          for (const i of newLow) lastAlertedAt.current.set(i.id, now);
          saveCooldown(storeId, lastAlertedAt.current);
          setAlerts(prev => [...prev, { id, ingredients: newLow }]);
          setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), 10000);
        }
      } catch (e) { console.error('StockAlert error:', e); }
    };

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [storeId]);

  if (alerts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    }}>
      {alerts.map(alert => (
        <div key={alert.id} style={{
          background: 'var(--bg-card)',
          borderRadius: 20,
          padding: '40px 48px',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          border: '1px solid var(--border)',
          animation: 'popIn 0.3s ease',
          maxWidth: 420,
          width: '90vw',
        }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#dc2626', marginBottom: 4 }}>
            재고 부족!
          </div>
          {storeName && (
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--purple)', marginBottom: 16 }}>
              {storeName}
            </div>
          )}
          <div style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.8 }}>
            {alert.ingredients.map(i => (
              <div key={i.id}>
                <b>{i.name}</b> — 현재 {i.stock}{i.unit} (기준: {i.threshold}{i.unit})
                {!storeName && i.store_name && (
                  <span style={{ color: 'var(--purple)', fontWeight: 700 }}> [{i.store_name}]</span>
                )}
              </div>
            ))}
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
      ))}
      <style>{`
        @keyframes popIn {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
