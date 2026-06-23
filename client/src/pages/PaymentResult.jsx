import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { api } from '../api';

export default function PaymentResult() {
  const [params] = useSearchParams();
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing'); // processing, success, fail
  const [message, setMessage] = useState('결제 승인 처리 중입니다...');

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

  return (
    <div className="card" style={{ maxWidth: 420, margin: '60px auto', textAlign: 'center', padding: 32 }}>
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 16 }}>{message}</div>
      {status !== 'processing' && (
        <button className="primary" style={{ marginTop: 16 }} onClick={() => navigate('/store')}>발주 내역으로 돌아가기</button>
      )}
    </div>
  );
}
