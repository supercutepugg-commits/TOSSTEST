import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';

const STATUS_LABEL = {
  DRAFT: '임시저장', ORDERED: '발주완료', REVIEWING: '검토중',
  REVISION_REQUESTED: '수정요청', CONFIRMED: '주문확정',
  PAYMENT_PENDING: '결제대기', PAID: '결제완료',
  PREPARING_SHIPMENT: '출고준비', SHIPPED: '출고완료',
  DELIVERED: '납품완료', CLOSED: '주문종료', CANCELED: '주문취소',
};

// 브라우저 인쇄(window.print())만으로 거래명세서를 출력할 수 있게 한 별도 페이지.
// PDF 라이브러리 없이 @media print 규칙으로 네비/사이드메뉴를 숨기고 이 영역만 인쇄되게 한다.
export default function OrderInvoice() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);

  useEffect(() => { api.getOrder(id).then(setOrder).catch(() => {}); }, [id]);

  if (!order) return <div className="empty">불러오는 중...</div>;

  const total = order.confirmed_amount ?? order.total_amount;

  return (
    <div>
      <div className="no-print" style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <button className="primary" onClick={() => window.print()}>인쇄</button>
      </div>
      <div className="card print-invoice" style={{ maxWidth: 720, margin: '0 auto', padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>거래명세서</div>
            <div className="text-sub" style={{ fontSize: 13, marginTop: 4 }}>발주서 #{order.id}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 13 }} className="text-sub">
            <div>발주일: {new Date(order.created_at).toLocaleDateString('ko-KR')}</div>
            <div>상태: {STATUS_LABEL[order.status] || order.status}</div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, fontSize: 13 }}>
          <div>
            <div className="text-sub">가맹점</div>
            <div style={{ fontWeight: 700 }}>{order.store_name || '-'}</div>
          </div>
          <div>
            <div className="text-sub">작성자</div>
            <div style={{ fontWeight: 700 }}>{order.created_by_name || '-'}</div>
          </div>
        </div>

        <table style={{ width: '100%', marginBottom: 16 }}>
          <thead>
            <tr><th>상품</th><th>수량</th><th>단가</th><th>금액</th></tr>
          </thead>
          <tbody>
            {order.items?.map(item => (
              <tr key={item.id}>
                <td>{item.product_name}</td>
                <td>{(item.confirmed_quantity ?? item.quantity)} {item.unit}</td>
                <td>{item.unit_price.toLocaleString()}원</td>
                <td>{item.amount.toLocaleString()}원</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ textAlign: 'right', fontSize: 16, fontWeight: 800, borderTop: '2px solid var(--border)', paddingTop: 12 }}>
          합계: {total.toLocaleString()}원
        </div>

        {order.memo && (
          <div style={{ marginTop: 20, fontSize: 13 }}>
            <div className="text-sub">메모</div>
            <div>{order.memo}</div>
          </div>
        )}
      </div>
    </div>
  );
}
