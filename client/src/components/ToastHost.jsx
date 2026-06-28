import { useEffect, useRef, useState } from 'react';
import { subscribeToast } from '../toast';

const CONFIG = {
  info:    { color: 'var(--purple)', bg: 'var(--purple-light)', icon: 'ℹ' },
  success: { color: '#16a34a',       bg: '#dcfce7',             icon: '✓' },
  error:   { color: '#dc2626',       bg: '#fee2e2',             icon: '✕' },
  warning: { color: '#d97706',       bg: '#fef3c7',             icon: '⚠' },
};

// 에러/경고는 읽을 시간이 더 필요하므로 조금 더 길게 띄움
const DURATION = { info: 3200, success: 3200, error: 5000, warning: 4200 };

function ToastItem({ t, onDismiss }) {
  const c = CONFIG[t.type] || CONFIG.info;
  const duration = DURATION[t.type] || 3200;
  const [paused, setPaused] = useState(false);
  const elapsedRef = useRef(0);
  const startRef = useRef(null);

  useEffect(() => {
    if (t.exiting || paused) return;
    startRef.current = Date.now();
    const remaining = duration - elapsedRef.current;
    const timer = setTimeout(() => onDismiss(t.id), remaining);
    return () => {
      clearTimeout(timer);
      elapsedRef.current += Date.now() - startRef.current;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, t.exiting]);

  return (
    <div
      onClick={() => onDismiss(t.id)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(0,100,255,0.02) 100%)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${c.color}`,
        borderRadius: 12,
        padding: '14px 16px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)',
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
        boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.4), 0 1px 3px rgba(0,0,0,0.06)',
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
      {/* 자동 닫힘 진행바 — 마우스를 올리면 멈춤 */}
      {!t.exiting && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2.5, background: 'rgba(0,0,0,0.05)' }}>
          <div style={{
            height: '100%', background: c.color, transformOrigin: 'left',
            animation: `toastProgress ${duration}ms linear forwards`,
            animationPlayState: paused ? 'paused' : 'running',
          }} />
        </div>
      )}
    </div>
  );
}

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
        {items.map(t => <ToastItem key={t.id} t={t} onDismiss={dismiss} />)}
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
        @keyframes toastProgress {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </>
  );
}
