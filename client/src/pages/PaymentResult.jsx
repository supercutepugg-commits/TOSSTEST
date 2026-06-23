import { toast } from '../toast';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { api } from '../api';
import { payForOrder } from '../payment';

export default function PaymentResult() {
  const [params] = useSearchParams();
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing'); // processing, success, fail
  const [message, setMessage] = useState('결제 승인 처리 중입니다...');
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const failMessage = params.get('message');
    if (failMessage) {
      setStatus('fail');
      setMessage(failMessage);
      return;
    }
    const paymentKey = params.get('paymentKey');
    const orderId = params.get('orderId');
    const amount = Number(params.get('amount'));
    if (!paymentKey || !orderId || !amount) {
      setStatus('fail');
      setMessage('결제 정보가 올바르지 않습니다');
      return;
    }
    api.confirmPayment(id, { paymentKey, orderId, amount })
      .then(() => { setStatus('success'); setMessage('결제가 완료되었습니다'); })
      .catch(e => { setStatus('fail'); setMessage(e.message || '결제 승인에 실패했습니다'); });
  }, [id]);

  const retry = async () => {
    setRetrying(true);
    try {
      const order = await api.getOrder(id);
      await payForOrder(order);
    } catch (e) {
      toast(e.message || '결제 재시도에 실패했습니다', 'error');
    } finally {
      setRetrying(false);
    }
  };

  const cancelOrder = async () => {
    if (!confirm('발주를 취소하시겠습니까?')) return;
    try {
      await api.cancelOrder(id);
      navigate('/store');
    } catch (e) {
      toast(e.message || '취소에 실패했습니다', 'error');
    }
  };

  return (
    <div className="card" style={{ maxWidth: 420, margin: '60px auto', textAlign: 'center', padding: 32 }}>
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 16 }}>{message}</div>
      {status === 'fail' && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
          <button className="secondary" onClick={cancelOrder}>발주 취소</button>
          <button className="primary" disabled={retrying} onClick={retry}>{retrying ? '결제 시도 중...' : '다시 결제하기'}</button>
        </div>
      )}
      {status === 'success' && (
        <button className="primary" style={{ marginTop: 16 }} onClick={() => navigate('/store')}>발주 내역으로 돌아가기</button>
      )}
    </div>
  );
}
