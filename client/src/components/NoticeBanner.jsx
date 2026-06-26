import { useEffect, useState } from 'react';
import { api } from '../api';

// 본사가 올린 공지 중 아직 안 읽은 것이 있으면 모달로 띄운다 (카톡/전화로 전달하다 누락되는 문제를 없애려는 목적)
export default function NoticeBanner({ storeId }) {
  const [unread, setUnread] = useState([]);

  useEffect(() => {
    if (!storeId) return;
    api.getMyNotices(storeId).then(notices => {
      setUnread(notices.filter(n => !n.is_read));
    }).catch(() => {});
  }, [storeId]);

  if (unread.length === 0) return null;
  const current = unread[0];

  const confirm = async () => {
    try { await api.markNoticeRead(current.id); } catch { /* 네트워크 오류여도 다음 진입 시 다시 노출되므로 무시 */ }
    setUnread(prev => prev.slice(1));
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 18,
        padding: '32px 36px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        border: '1px solid var(--border)',
        maxWidth: 440,
        width: '90vw',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--purple)', marginBottom: 8 }}>
          공지사항{unread.length > 1 ? ` (${unread.length}건)` : ''}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12, color: 'var(--text)' }}>{current.title}</div>
        <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 24 }}>
          {current.content}
        </div>
        <button
          onClick={confirm}
          style={{
            width: '100%', padding: '12px 0',
            background: 'var(--purple)', color: '#fff',
            border: 'none', borderRadius: 10,
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}
        >
          확인{unread.length > 1 ? ' (다음 공지 보기)' : ''}
        </button>
      </div>
    </div>
  );
}
