import { useEffect, useState, useRef } from 'react';
import { api } from '../api';
import { useStore } from '../StoreContext';

export default function StockAlert() {
  const { currentStore } = useStore();
  const [alerts, setAlerts] = useState([]);
  const prevLowIds = useRef(new Set());

  useEffect(() => {
    prevLowIds.current = new Set();
    setAlerts([]);
  }, [currentStore?.id]);

  useEffect(() => {
    const check = async () => {
      try {
        const { lowStock } = await api.getDashboard(currentStore?.id);
        const currentIds = new Set(lowStock.map(i => i.id));

        // 이전엔 없었는데 새로 부족해진 재료만 알림
        const newLow = lowStock.filter(i => !prevLowIds.current.has(i.id));
        if (newLow.length > 0) {
          const id = Date.now();
          setAlerts(prev => [...prev, { id, ingredients: newLow }]);
          setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), 10000);
        }
        prevLowIds.current = currentIds;
      } catch (e) { console.error('StockAlert error:', e); }
    };

    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [currentStore?.id]);

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
          <div style={{ fontSize: 28, fontWeight: 800, color: '#dc2626', marginBottom: 16 }}>
            재고 부족!
          </div>
          <div style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.8 }}>
            {alert.ingredients.map(i => (
              <div key={i.name}>
                <b>{i.name}</b> — 현재 {i.stock}{i.unit} (기준: {i.threshold}{i.unit})
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
