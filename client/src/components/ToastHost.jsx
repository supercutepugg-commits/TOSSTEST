import { useEffect, useState } from 'react';
import { subscribeToast } from '../toast';

const COLOR = { info: 'var(--purple)', error: '#dc2626', success: '#16a34a' };

export default function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => subscribeToast(t => {
    setItems(prev => [...prev, t]);
    setTimeout(() => setItems(prev => prev.filter(i => i.id !== t.id)), 4000);
  }), []);

  if (items.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 10000,
      display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360,
    }}>
      {items.map(t => (
        <div key={t.id} style={{
          background: 'var(--bg-card)', border: `1px solid ${COLOR[t.type] || COLOR.info}`,
          borderLeft: `4px solid ${COLOR[t.type] || COLOR.info}`,
          borderRadius: 8, padding: '12px 16px', fontSize: 14,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', color: 'var(--text)',
          animation: 'toastIn 0.2s ease',
        }}>
          {t.message}
        </div>
      ))}
      <style>{`
        @keyframes toastIn {
          from { transform: translateY(8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
