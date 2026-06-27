import { useEffect, useState } from 'react';
import { subscribeToast } from '../toast';

const CONFIG = {
  info:    { color: 'var(--purple)', bg: 'var(--purple-light)', icon: 'ℹ' },
  success: { color: '#16a34a',       bg: '#dcfce7',             icon: '✓' },
  error:   { color: '#dc2626',       bg: '#fee2e2',             icon: '✕' },
  warning: { color: '#d97706',       bg: '#fef3c7',             icon: '⚠' },
};

export default function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => subscribeToast(t => {
    setItems(prev => [...prev, { ...t, exiting: false }]);
  }), []);

  const dismiss = (id) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, exiting: true } : i));
    setTimeout(() => setItems(prev => prev.filter(i => i.id !== id)), 250);
  };

  if (items.length === 0) return null;

  return (
    <>
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 10000,
        display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380, minWidth: 280,
      }}>
        {items.map(t => {
          const c = CONFIG[t.type] || CONFIG.info;
          return (
            <div key={t.id}
              onClick={() => dismiss(t.id)}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '14px 16px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)',
                color: 'var(--text)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'flex-start', gap: 12,
                animation: t.exiting ? 'toastOut 0.22s ease forwards' : 'toastIn 0.22s ease',
                userSelect: 'none',
              }}>
              {/* 아이콘 */}
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: c.bg, color: c.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700,
              }}>{c.icon}</div>
              {/* 메시지 */}
              <div style={{ flex: 1, paddingTop: 3, fontSize: 14, lineHeight: 1.5, fontWeight: 500 }}>
                {t.message}
              </div>
              {/* 닫기 */}
              <div style={{
                flexShrink: 0, color: 'var(--text-3)', fontSize: 16, lineHeight: 1,
                paddingTop: 3, opacity: 0.6,
              }}>✕</div>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes toastIn {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes toastOut {
          from { transform: translateX(0);    opacity: 1; max-height: 80px; margin-bottom: 0; }
          to   { transform: translateX(20px); opacity: 0; max-height: 0;    margin-bottom: -10px; }
        }
      `}</style>
    </>
  );
}
