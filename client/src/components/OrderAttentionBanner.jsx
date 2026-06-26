import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

// 본사가 발주 수량조정/품절처리/수정요청 등으로 발주서를 변경하면, 가맹점이 화면에 들어와도
// 알 방법이 없던 문제를 없애기 위해 다음 진입 시 바로 모달로 알려준다 (공지사항 NoticeBanner와 동일한 패턴)
export default function OrderAttentionBanner({ storeId }) {
  const [pending, setPending] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!storeId) return;
    api.getAttentionOrders().then(setPending).catch(() => {});
  }, [storeId]);

  if (pending.length === 0) return null;
  const current = pending[0];

  const ack = async () => {
    try { await api.ackOrder(current.id); } catch { /* 실패해도 다음 진입 시 다시 노출되므로 무시 */ }
    setPending(prev => prev.slice(1));
  };

  const goToOrder = async () => {
    await ack();
    navigate('/store');
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
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: '#f59e0b', marginBottom: 8 }}>
          발주 변경 알림{pending.length > 1 ? ` (${pending.length}건)` : ''}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12, color: 'var(--text)' }}>
          발주서 #{current.id}에 변경사항이 있습니다
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 24 }}>
          {current.attention_note}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={ack}
            style={{
              flex: 1, padding: '12px 0',
              background: 'var(--bg-2)', color: 'var(--text)',
              border: '1px solid var(--border)', borderRadius: 10,
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}
          >
            닫기
          </button>
          <button
            onClick={goToOrder}
            style={{
              flex: 1, padding: '12px 0',
              background: '#f59e0b', color: '#fff',
              border: 'none', borderRadius: 10,
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}
          >
            발주내역 보기
          </button>
        </div>
      </div>
    </div>
  );
}
