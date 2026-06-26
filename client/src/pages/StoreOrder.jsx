import { toast } from '../toast';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { payForOrder } from '../payment';

const STATUS_LABEL = {
  DRAFT: '임시저장', ORDERED: '발주완료', REVIEWING: '검토중',
  REVISION_REQUESTED: '수정요청', CONFIRMED: '주문확정',
  PAYMENT_PENDING: '결제대기', PAID: '결제완료',
  PREPARING_SHIPMENT: '출고준비', SHIPPED: '출고완료',
  DELIVERED: '납품완료', CLOSED: '주문종료', CANCELED: '주문취소',
};
const STATUS_COLOR = {
  DRAFT: '#64748b', ORDERED: '#3b82f6', REVIEWING: '#f59e0b',
  REVISION_REQUESTED: '#ef4444', CONFIRMED: '#8b5cf6',
  PAYMENT_PENDING: '#f97316', PAID: '#10b981',
  PREPARING_SHIPMENT: '#06b6d4', SHIPPED: '#6366f1',
  DELIVERED: '#16a34a', CLOSED: '#94a3b8', CANCELED: '#ef4444',
};

function StatusBadge({ status }) {
  const c = STATUS_COLOR[status] || '#64748b';
  return (
    <span style={{ background: c + '22', color: c, padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function StoreOrder() {
  const [tab, setTab] = useState('new');
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [memo, setMemo] = useState('');
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editingOrderUpdatedAt, setEditingOrderUpdatedAt] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [recommendations, setRecommendations] = useState({}); // product_id -> 추천 발주량
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('전체');

  const loadOrders = () => api.getOrders().then(setOrders).catch(() => {});

  useEffect(() => {
    api.getProducts().then(setProducts).catch(() => {});
    // 최근 7일 판매량 기준 예상 소진량 대비 추천 발주량 — 참고용이라 실패해도 화면엔 영향 없음
    api.getProductRecommendations().then(setRecommendations).catch(() => {});
    loadOrders();
  }, []);

  const addToCart = (product) => {
    setCart(c => {
      const existing = c.find(i => i.product.id === product.id);
      if (existing) return c.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...c, { product, quantity: 1 }];
    });
  };

  const updateQty = (id, qty) => {
    if (qty <= 0) setCart(c => c.filter(i => i.product.id !== id));
    else setCart(c => c.map(i => i.product.id === id ? { ...i, quantity: qty } : i));
  };

  const total = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);

  const loadOrderToCart = async (order) => {
    const detail = await api.getOrder(order.id);
    const newCart = detail.items.map(item => {
      const product = products.find(p => p.id === item.product_id) || {
        id: item.product_id, name: item.product_name, unit: item.unit, price: item.unit_price,
      };
      return { product, quantity: item.quantity };
    });
    setCart(newCart);
    setMemo(detail.memo || '');
    setEditingOrderId(order.id);
    setEditingOrderUpdatedAt(detail.updated_at || null);
    setTab('new');
  };

  const resetCart = () => { setCart([]); setMemo(''); setEditingOrderId(null); setEditingOrderUpdatedAt(null); };

  // 지난번처럼 발주: 과거 발주서의 품목을 그대로 새 장바구니에 담음 (수정이 아니라 새 발주로 시작)
  const reorderFromOrder = async (order) => {
    const detail = await api.getOrder(order.id);
    const newCart = [];
    const skipped = [];
    for (const item of detail.items) {
      const product = products.find(p => p.id === item.product_id);
      if (!product) { skipped.push(item.product_name); continue; }
      const qty = item.confirmed_quantity ?? item.quantity;
      const existing = newCart.find(i => i.product.id === product.id);
      if (existing) existing.quantity += qty;
      else newCart.push({ product, quantity: qty });
    }
    if (newCart.length === 0) {
      toast('현재 판매 중인 상품이 없어 다시 담을 수 없습니다', 'error');
      return;
    }
    setCart(newCart);
    setMemo('');
    setEditingOrderId(null);
    setEditingOrderUpdatedAt(null);
    setTab('new');
    if (skipped.length > 0) toast(`${skipped.join(', ')}은 현재 판매 중인 상품이 아니라 제외되었습니다`, 'info');
    else toast('지난 발주 내용을 장바구니에 담았습니다', 'success');
  };

  const submitOrder = async (draft) => {
    if (cart.length === 0) { toast('상품을 선택해주세요', 'error'); return; }
    if (submitting) return; // 연속 클릭 시 같은 발주가 중복 생성되는 것을 방지
    setSubmitting(true);
    const payload = {
      memo, submit: !draft,
      items: cart.map(i => ({
        product_id: i.product.id, product_name: i.product.name,
        unit: i.product.unit, unit_price: i.product.price, quantity: i.quantity,
      })),
      updated_at: editingOrderUpdatedAt,
    };
    try {
      if (editingOrderId) await api.updateOrder(editingOrderId, payload);
      else await api.createOrder(payload);
      toast(draft ? '임시저장 완료' : '발주 완료', 'success');
      resetCart();
      loadOrders();
      if (!draft) setTab('history');
    } catch (e) {
      toast(e.message || '저장에 실패했습니다. 새로고침 후 다시 시도해주세요', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const pendingOrders = orders.filter(o => ['DRAFT', 'REVISION_REQUESTED'].includes(o.status));

  // 카탈로그가 커지면 한눈에 찾기 어려워지므로 카테고리(상품관리에서 설정)와 이름 검색으로 좁힐 수 있게 함
  const categories = ['전체', ...new Set(products.map(p => p.category).filter(Boolean))];
  const visibleProducts = products.filter(p => {
    if (activeCategory !== '전체' && p.category !== activeCategory) return false;
    if (search.trim() && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <h2>발주하기</h2>

      {pendingOrders.length > 0 && tab !== 'new' && (
        <div className="card" style={{ borderLeft: '4px solid #f59e0b', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: '#f59e0b' }}>미완료 발주 {pendingOrders.length}건</div>
          {pendingOrders.map(o => (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <StatusBadge status={o.status} />
                <span className="text-sub">{new Date(o.created_at).toLocaleDateString('ko-KR')} — {o.total_amount.toLocaleString()}원</span>
              </span>
              <button className="primary small" onClick={() => loadOrderToCart(o)}>이어하기</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className={tab === 'new' ? 'primary' : 'secondary'} onClick={() => { setTab('new'); resetCart(); }}>새 발주</button>
        <button className={tab === 'history' ? 'primary' : 'secondary'} onClick={() => setTab('history')}>발주 내역</button>
      </div>

      {tab === 'new' && (
        <div className="split-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 12 }}>
              상품 목록
              {editingOrderId && <span style={{ fontSize: 12, color: '#f59e0b', marginLeft: 10 }}>발주서 #{editingOrderId} 수정 중</span>}
            </div>
            {products.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="상품명 검색" style={{ marginBottom: 8, width: '100%' }} />
                {categories.length > 1 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {categories.map(c => (
                      <button key={c} type="button"
                        className={activeCategory === c ? 'primary small' : 'secondary small'}
                        onClick={() => setActiveCategory(c)}>
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {products.length === 0
              ? <div className="empty">등록된 상품 없음</div>
              : visibleProducts.length === 0
              ? <div className="empty">검색 결과가 없습니다</div>
              : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {visibleProducts.map(p => {
                  const inCart = cart.find(i => i.product.id === p.id);
                  const recommendedQty = recommendations[p.id];
                  return (
                    <div key={p.id} onClick={() => addToCart(p)}
                      className="elevated-card"
                      style={{ padding: '14px 16px', cursor: 'pointer', position: 'relative', transition: 'border-color 0.15s', borderColor: inCart ? 'var(--purple)' : 'var(--border)' }}
                      onMouseOver={e => e.currentTarget.style.borderColor = 'var(--purple)'}
                      onMouseOut={e => e.currentTarget.style.borderColor = inCart ? 'var(--purple)' : 'var(--border)'}
                    >
                      {inCart && (
                        <span style={{ position: 'absolute', top: 8, right: 8, background: 'var(--purple)', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                          {inCart.quantity}
                        </span>
                      )}
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
                      <div className="text-sub" style={{ fontSize: 12 }}>{p.unit}</div>
                      <div style={{ fontSize: 13, color: 'var(--purple)', fontWeight: 700, marginTop: 6 }}>
                        {p.price > 0 ? `${p.price.toLocaleString()}원` : '단가 미설정'}
                      </div>
                      {recommendedQty > 0 && (
                        <div
                          onClick={e => { e.stopPropagation(); if (!inCart) addToCart(p); updateQty(p.id, recommendedQty); }}
                          style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, color: '#16a34a', background: '#dcfce7', borderRadius: 6, padding: '3px 8px', display: 'inline-block' }}
                          title="최근 7일 판매 추세 기준 추천 발주량 — 클릭하면 이 수량으로 담깁니다"
                        >
                          추천 {recommendedQty}{p.unit}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            }
          </div>

          <div>
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>장바구니</div>
              {cart.length === 0
                ? <div className="empty">상품을 선택해주세요</div>
                : <>
                  {cart.map(i => (
                    <div key={i.product.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ flex: 1, fontSize: 14 }}>{i.product.name}</div>
                      <input type="number" value={i.quantity} min={0}
                        onChange={e => updateQty(i.product.id, Number(e.target.value))}
                        style={{ width: 60, textAlign: 'center' }} />
                      <div className="text-sub" style={{ fontSize: 13, minWidth: 70, textAlign: 'right' }}>
                        {(i.product.price * i.quantity).toLocaleString()}원
                      </div>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12, fontWeight: 700, textAlign: 'right' }}>
                    합계: {total.toLocaleString()}원
                  </div>
                </>
              }
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <textarea value={memo} onChange={e => setMemo(e.target.value)}
                placeholder="메모 (선택)" rows={3} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="secondary" onClick={() => submitOrder(true)} disabled={submitting} style={{ flex: 1 }}>임시저장</button>
              <button className="primary" onClick={() => submitOrder(false)} disabled={submitting} style={{ flex: 1 }}>{submitting ? '처리 중...' : '발주하기'}</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="split-layout" style={{ display: 'grid', gridTemplateColumns: detailOrder ? '1fr 400px' : '1fr', gap: 20 }}>
          <div className="card">
            {orders.length === 0
              ? <div className="empty">발주 내역 없음</div>
              : <table>
                <thead><tr><th>발주일</th><th>상태</th><th>금액</th><th>메모</th><th style={{ width: 150 }}></th></tr></thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} style={{ cursor: 'pointer', background: detailOrder?.id === o.id ? 'var(--bg-elevated)' : '' }}
                      onClick={async () => { const d = await api.getOrder(o.id); setDetailOrder(d); }}>
                      <td>{new Date(o.created_at).toLocaleDateString('ko-KR')}</td>
                      <td><StatusBadge status={o.status} /></td>
                      <td>{(o.confirmed_amount ?? o.total_amount).toLocaleString()}원</td>
                      <td className="text-muted" style={{ fontSize: 13 }}>{o.memo || '-'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {['DRAFT', 'REVISION_REQUESTED'].includes(o.status) && (
                            <button className="primary small" onClick={e => { e.stopPropagation(); loadOrderToCart(o); }}>이어하기</button>
                          )}
                          <button className="secondary small" title="지난번처럼 발주" onClick={e => { e.stopPropagation(); reorderFromOrder(o); }}>재주문</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          </div>

          {detailOrder && (
            <div className="card" style={{ position: 'sticky', top: 0, maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontWeight: 700 }}>발주서 #{detailOrder.id}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="secondary small" onClick={() => window.open(`/store/orders/${detailOrder.id}/invoice`, '_blank')}>거래명세서</button>
                  <button className="secondary small" onClick={() => setDetailOrder(null)}>닫기</button>
                </div>
              </div>
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <StatusBadge status={detailOrder.status} />
                {['CONFIRMED', 'PAYMENT_PENDING'].includes(detailOrder.status) && (
                  <button className="primary small" onClick={() => payForOrder(detailOrder).catch(e => toast(e.message || '결제 실패', 'error'))}>
                    {detailOrder.status === 'PAYMENT_PENDING' ? '다시 결제하기' : '결제하기'}
                  </button>
                )}
                {detailOrder.status === 'PAYMENT_PENDING' && (
                  <button className="secondary small" onClick={async () => {
                    if (!confirm('발주를 취소하시겠습니까?')) return;
                    try {
                      await api.cancelOrder(detailOrder.id);
                      setDetailOrder(null);
                      loadOrders();
                    } catch (e) {
                      toast(e.message || '취소에 실패했습니다', 'error');
                    }
                  }}>
                    발주 취소
                  </button>
                )}
              </div>
              <table style={{ marginBottom: 12 }}>
                <thead><tr><th>상품</th><th>수량</th><th>금액</th></tr></thead>
                <tbody>
                  {detailOrder.items?.map(item => {
                    const changed = item.confirmed_quantity != null && item.confirmed_quantity !== item.quantity;
                    return (
                      <tr key={item.id}>
                        <td>
                          {item.product_name}
                          {item.status === 'SOLD_OUT' && <span className="badge red" style={{ marginLeft: 6 }}>품절</span>}
                          {item.substitute_note && (
                            <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>본사 메모: {item.substitute_note}</div>
                          )}
                        </td>
                        <td>
                          {changed && (
                            <span className="text-muted" style={{ textDecoration: 'line-through', marginRight: 4 }}>{item.quantity}{item.unit}</span>
                          )}
                          <span style={{ fontWeight: changed ? 700 : 400 }}>{item.confirmed_quantity ?? item.quantity} {item.unit}</span>
                          {changed && <span className="badge yellow" style={{ marginLeft: 6 }}>변경됨</span>}
                        </td>
                        <td>{item.amount.toLocaleString()}원</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ fontWeight: 700, textAlign: 'right', marginBottom: 12 }}>
                {detailOrder.confirmed_amount
                  ? `확정금액: ${detailOrder.confirmed_amount.toLocaleString()}원`
                  : `총 금액: ${detailOrder.total_amount.toLocaleString()}원`}
              </div>
              {detailOrder.created_by_name && (
                <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>작성자: {detailOrder.created_by_name}</div>
              )}
              {detailOrder.memo && (
                <div className="elevated-card" style={{ padding: 10, fontSize: 13, marginBottom: 12 }}>메모: {detailOrder.memo}</div>
              )}
              {detailOrder.history?.length > 0 && (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>처리 이력</div>
                  {detailOrder.history.map(h => (
                    <div key={h.id} className="text-muted" style={{ fontSize: 12, marginBottom: 3 }}>
                      {new Date(h.created_at).toLocaleString('ko-KR')} — {h.action}{h.reason && ` (${h.reason})`}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
