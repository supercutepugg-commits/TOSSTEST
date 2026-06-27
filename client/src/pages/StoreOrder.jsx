import { toast } from '../toast';
import { useEffect, useState, useRef } from 'react';
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

/* ── 수량 스텝퍼 ─────────────────────────────────────── */
function QtyControl({ qty, onMinus, onPlus, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
      <button type="button" className="qty-btn" onClick={onMinus}
        style={{ width: 32, height: 32, background: 'var(--bg-muted)', border: 'none', borderRadius: 0, fontSize: 18, fontWeight: 300, color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}>
        −
      </button>
      <input type="number" className="qty-input" value={qty} min={1} onChange={e => onChange(Number(e.target.value))}
        style={{ width: 44, height: 32, textAlign: 'center', border: 'none', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', borderRadius: 0, fontSize: 14, fontWeight: 700, padding: 0, outline: 'none', background: 'var(--bg-card)', boxShadow: 'none' }} />
      <button type="button" className="qty-btn" onClick={onPlus}
        style={{ width: 32, height: 32, background: 'var(--bg-muted)', border: 'none', borderRadius: 0, fontSize: 18, fontWeight: 300, color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}>
        +
      </button>
    </div>
  );
}

/* ── 장바구니 패널 ────────────────────────────────────── */
function CartPanel({ cart, total, updateQty, memo, setMemo, submitOrder, submitting, saveAsTemplate, templates, loadTemplateToCart, deleteTemplate, editingOrderId, onClose, isMobileDrawer }) {
  const isEmpty = cart.length === 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: isMobileDrawer ? '100%' : 'auto',
    }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="cart-title" style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>장바구니</span>
          {cart.length > 0 && (
            <span style={{ background: 'var(--purple)', color: '#fff', borderRadius: 99, minWidth: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, padding: '0 5px' }}>
              {cart.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {editingOrderId && <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>#{editingOrderId} 수정 중</span>}
          {isMobileDrawer && (
            <button type="button" onClick={onClose}
              style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-3)', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 아이템 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isEmpty ? 0 : '8px 0' }}>
        {isEmpty ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-3)' }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>🛒</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>담은 상품이 없습니다</div>
            <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>상품 목록에서 상품을 선택해주세요</div>
          </div>
        ) : (
          cart.map((item, idx) => (
            <div key={item.product.id} style={{
              padding: '14px 20px',
              borderBottom: idx < cart.length - 1 ? '1px solid var(--border)' : 'none',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {/* 상품명 + 삭제 */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div className="cart-item-name" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>{item.product.name}</div>
                  <div className="cart-item-unit" style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{item.product.unit}</div>
                </div>
                <button type="button" onClick={() => updateQty(item.product.id, 0)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 16, cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0, opacity: 0.6 }}
                  title="삭제">
                  ✕
                </button>
              </div>
              {/* 수량 + 금액 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <QtyControl
                  qty={item.quantity}
                  onMinus={() => updateQty(item.product.id, item.quantity - 1)}
                  onPlus={() => updateQty(item.product.id, item.quantity + 1)}
                  onChange={v => updateQty(item.product.id, v)}
                />
                <div className="cart-item-price" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                  {item.product.price > 0 ? `${(item.product.price * item.quantity).toLocaleString()}원` : '—'}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 템플릿 */}
      {templates.length > 0 && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>정기 발주 템플릿</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {templates.map(tpl => (
              <div key={tpl.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{tpl.name} <span style={{ color: 'var(--text-3)', fontSize: 11 }}>({tpl.items.length}개)</span></span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="primary small" onClick={() => loadTemplateToCart(tpl)}>불러오기</button>
                  <button className="danger small" onClick={() => deleteTemplate(tpl.id)}>삭제</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 메모 */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <textarea value={memo} onChange={e => setMemo(e.target.value)}
          placeholder="메모 (선택)" rows={2}
          style={{ width: '100%', resize: 'none', fontSize: 13 }} />
      </div>

      {/* 합계 + 버튼 */}
      <div style={{ padding: '16px 20px', borderTop: '2px solid var(--border)', background: 'var(--bg-card)', flexShrink: 0 }}>
        {!isEmpty && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 14, color: 'var(--text-2)' }}>총 {cart.length}종 {cart.reduce((s, i) => s + i.quantity, 0)}개</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{total.toLocaleString()}원</span>
            </div>
            <button className="secondary small" onClick={saveAsTemplate} style={{ width: '100%', marginBottom: 8 }}>+ 템플릿으로 저장</button>
          </>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="secondary" onClick={() => submitOrder(true)} disabled={submitting || isEmpty} style={{ flex: 1 }}>임시저장</button>
          <button className="primary" onClick={() => submitOrder(false)} disabled={submitting || isEmpty} style={{ flex: 2 }}>
            {submitting ? '처리 중...' : isEmpty ? '상품을 담아주세요' : `발주하기 (${total.toLocaleString()}원)`}
          </button>
        </div>
      </div>
    </div>
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
  const [recommendations, setRecommendations] = useState({});
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('전체');
  const [templates, setTemplates] = useState([]);
  const [myStore, setMyStore] = useState(null);
  const [cartOpen, setCartOpen] = useState(false); // 모바일 장바구니 드로어
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const cartRestoredRef = useRef(false);
  const autosaveTimerRef = useRef(null);

  const loadOrders = () => api.getOrders().then(o => { setOrders(o); setOrdersLoaded(true); }).catch(() => setOrdersLoaded(true));
  const loadTemplates = () => api.getOrderTemplates().then(setTemplates).catch(() => {});

  useEffect(() => {
    api.getProducts().then(p => { setProducts(p); setProductsLoaded(true); }).catch(() => setProductsLoaded(true));
    api.getProductRecommendations().then(setRecommendations).catch(() => {});
    api.getMyStore().then(setMyStore).catch(() => {});
    loadTemplates();
    loadOrders();
  }, []);

  // 장바구니를 서버의 임시저장(DRAFT) 발주서로 보관 — 기기를 바꿔도, 다시 로그인해도 그대로 남아있도록
  // 가장 최근 DRAFT를 자동으로 장바구니에 복원한다 (최초 1회만)
  useEffect(() => {
    if (cartRestoredRef.current || !productsLoaded || !ordersLoaded) return;
    cartRestoredRef.current = true;
    const draft = orders.find(o => o.status === 'DRAFT');
    if (draft) loadOrderToCart(draft).catch(() => {});
  }, [productsLoaded, ordersLoaded, orders]);

  // 장바구니/메모가 바뀔 때마다 잠시 후 서버에 DRAFT로 자동 저장 — "임시저장" 버튼을 누르지 않아도
  // 다음에 와서(다른 기기 포함) 이어서 결제할 수 있게 함
  useEffect(() => {
    if (!cartRestoredRef.current) return;
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      try {
        if (cart.length === 0) {
          if (editingOrderId) {
            await api.cancelOrder(editingOrderId).catch(() => {});
            setEditingOrderId(null);
            setEditingOrderUpdatedAt(null);
            loadOrders();
          }
          return;
        }
        const payload = {
          memo, submit: false,
          items: cart.map(i => ({
            product_id: i.product.id, product_name: i.product.name,
            unit: i.product.unit, unit_price: i.product.price, quantity: i.quantity,
          })),
          updated_at: editingOrderUpdatedAt,
        };
        if (editingOrderId) {
          const res = await api.updateOrder(editingOrderId, payload);
          setEditingOrderUpdatedAt(res.updated_at);
        } else {
          const res = await api.createOrder(payload);
          setEditingOrderId(res.id);
          const fresh = await api.getOrder(res.id);
          setEditingOrderUpdatedAt(fresh.updated_at || null);
        }
        loadOrders();
      } catch {
        // 자동 저장 실패는 조용히 넘어감 — "발주하기"를 직접 누를 때 다시 시도됨
      }
    }, 800);
    return () => clearTimeout(autosaveTimerRef.current);
  }, [cart, memo]);

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
    if (newCart.length === 0) { toast('현재 판매 중인 상품이 없어 다시 담을 수 없습니다', 'error'); return; }
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
    if (submitting) return;
    clearTimeout(autosaveTimerRef.current); // 자동저장과 동시에 들어가 updated_at 충돌이 나지 않도록
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
      setCartOpen(false);
      loadOrders();
      if (!draft) setTab('history');
    } catch (e) {
      toast(e.message || '저장에 실패했습니다. 새로고침 후 다시 시도해주세요', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const pendingOrders = orders.filter(o => ['DRAFT', 'REVISION_REQUESTED'].includes(o.status));
  const draftOrders = orders.filter(o => o.status === 'DRAFT');

  const deadlineWarning = (() => {
    if (!myStore?.order_deadline || draftOrders.length === 0) return null;
    const [h, m] = myStore.order_deadline.split(':').map(Number);
    if (Number.isNaN(h)) return null;
    const deadline = new Date();
    deadline.setHours(h, m || 0, 0, 0);
    const diffMin = (deadline.getTime() - Date.now()) / 60000;
    if (diffMin <= 0 || diffMin > 60) return null;
    return Math.ceil(diffMin);
  })();

  const saveAsTemplate = async () => {
    if (cart.length === 0) { toast('템플릿으로 저장할 상품이 없습니다', 'error'); return; }
    const name = prompt('템플릿 이름을 입력하세요', '정기 발주');
    if (!name) return;
    try {
      await api.createOrderTemplate({
        name,
        items: cart.map(i => ({ product_id: i.product.id, product_name: i.product.name, unit: i.product.unit, unit_price: i.product.price, quantity: i.quantity })),
      });
      toast('템플릿으로 저장되었습니다', 'success');
      loadTemplates();
    } catch (e) {
      toast(e.message || '저장에 실패했습니다', 'error');
    }
  };

  const loadTemplateToCart = (tpl) => {
    const skipped = [];
    const newCart = [];
    for (const item of tpl.items) {
      const product = products.find(p => p.id === item.product_id);
      if (!product) { skipped.push(item.product_name); continue; }
      newCart.push({ product, quantity: item.quantity });
    }
    if (newCart.length === 0) { toast('현재 판매 중인 상품이 없어 담을 수 없습니다', 'error'); return; }
    setCart(newCart);
    setTab('new');
    if (skipped.length > 0) toast(`${skipped.join(', ')}은 현재 판매 중인 상품이 아니라 제외되었습니다`, 'info');
    else toast('템플릿을 장바구니에 담았습니다', 'success');
  };

  const deleteTemplate = async (id) => {
    if (!confirm('이 템플릿을 삭제하시겠습니까?')) return;
    await api.deleteOrderTemplate(id);
    loadTemplates();
  };

  const confirmReceipt = async (ok) => {
    let note;
    if (!ok) {
      note = prompt('수령 시 어떤 문제가 있었나요? (예: 2개 누락, 박스 파손 등)');
      if (!note || !note.trim()) return;
    } else if (!confirm('받은 물량이 발주 내용과 모두 일치합니까?')) {
      return;
    }
    try {
      await api.confirmReceipt(detailOrder.id, ok, note);
      toast(ok ? '수령확인 처리되었습니다' : '이상신고가 접수되었습니다', 'success');
      const d = await api.getOrder(detailOrder.id);
      setDetailOrder(d);
      loadOrders();
    } catch (e) {
      toast(e.message || '처리에 실패했습니다', 'error');
    }
  };

  const categories = ['전체', ...new Set(products.map(p => p.category).filter(Boolean))];
  const visibleProducts = products.filter(p => {
    if (activeCategory !== '전체' && p.category !== activeCategory) return false;
    if (search.trim() && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const cartProps = {
    cart, total, updateQty, memo, setMemo, submitOrder, submitting,
    saveAsTemplate, templates, loadTemplateToCart, deleteTemplate, editingOrderId,
  };

  return (
    <div className="store-order-page" style={{ paddingBottom: 80 }}>
      <style>{`
        @media (max-width: 768px) {
          .store-order-page { padding-left: 4px; padding-right: 4px; }
          .store-order-page h2 { font-size: 18px !important; }
          .store-order-page .cart-desktop-panel { display: none !important; }
          .store-order-page .split-layout { grid-template-columns: 1fr !important; }
          .store-order-page .product-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)) !important; gap: 8px !important; }
          .store-order-page .product-card { padding: 10px 12px !important; }
          .store-order-page .product-name { font-size: 13px !important; }
          .store-order-page .product-unit { font-size: 11px !important; }
          .store-order-page .product-price { font-size: 12px !important; }
          .store-order-page .cart-title { font-size: 15px !important; }
          .store-order-page .cart-item-name { font-size: 13px !important; }
          .store-order-page .cart-item-unit { font-size: 11px !important; }
          .store-order-page .cart-item-price { font-size: 14px !important; }
          .store-order-page .qty-btn { width: 28px !important; height: 28px !important; font-size: 16px !important; }
          .store-order-page .qty-input { width: 36px !important; height: 28px !important; font-size: 13px !important; }
          .store-order-page .cart-mobile-btn { font-size: 13px !important; padding: 12px 14px !important; }
          .store-order-page .table-scroll { overflow-x: auto; }
          .store-order-page table { font-size: 12px !important; }
          .store-order-page table th, .store-order-page table td { padding: 6px 4px !important; }
          .store-order-page .hide-mobile { display: none !important; }
        }
      `}</style>
      <h2>발주하기</h2>

      {deadlineWarning !== null && (
        <div className="card" style={{ borderLeft: '4px solid #ef4444', marginBottom: 16, background: '#fef2f2' }}>
          <div style={{ fontWeight: 700, color: '#ef4444' }}>
            발주 마감 {deadlineWarning}분 전입니다 — 임시저장된 발주 {draftOrders.length}건을 마감 전에 제출해주세요
          </div>
        </div>
      )}

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
        <>
          {/* 데스크탑: 좌우 분할 / 모바일: 상품 목록만 */}
          <div className="split-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
            {/* 상품 목록 */}
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 12 }}>상품 목록</div>
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
                : <div className="product-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                  {visibleProducts.map(p => {
                    const inCart = cart.find(i => i.product.id === p.id);
                    const recommendedQty = recommendations[p.id];
                    return (
                      <div key={p.id}
                        className="elevated-card product-card"
                        style={{ padding: '14px 16px', cursor: 'pointer', position: 'relative', transition: 'border-color 0.15s, box-shadow 0.15s', borderColor: inCart ? 'var(--purple)' : 'var(--border)', boxShadow: inCart ? '0 0 0 2px var(--purple-light)' : undefined }}
                        onClick={() => addToCart(p)}
                        onMouseOver={e => e.currentTarget.style.borderColor = 'var(--purple)'}
                        onMouseOut={e => e.currentTarget.style.borderColor = inCart ? 'var(--purple)' : 'var(--border)'}
                      >
                        {inCart && (
                          <span style={{ position: 'absolute', top: 8, right: 8, background: 'var(--purple)', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, boxShadow: '0 2px 6px rgba(0,100,255,0.4)' }}>
                            {inCart.quantity}
                          </span>
                        )}
                        <div className="product-name" style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>{p.name}</div>
                        <div className="text-sub product-unit" style={{ fontSize: 12 }}>{p.unit}</div>
                        <div className="product-price" style={{ fontSize: 13, color: 'var(--purple)', fontWeight: 700, marginTop: 6 }}>
                          {p.price > 0 ? `${p.price.toLocaleString()}원` : '단가 미설정'}
                        </div>
                        {recommendedQty > 0 && (
                          <div
                            onClick={e => { e.stopPropagation(); if (!inCart) addToCart(p); updateQty(p.id, recommendedQty); }}
                            style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#dcfce7', borderRadius: 6, padding: '3px 8px', display: 'inline-block', cursor: 'pointer' }}
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

            {/* 데스크탑 장바구니 패널 */}
            <div className="cart-desktop-panel" style={{ position: 'sticky', top: 20, alignSelf: 'flex-start' }}>
              <div className="card" style={{ padding: 0, overflow: 'hidden', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                <CartPanel {...cartProps} isMobileDrawer={false} />
              </div>
            </div>
          </div>

          {/* ── 모바일 하단 장바구니 바 ── */}
          <div className="cart-mobile-bar" style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
            background: 'var(--bg-card)',
            borderTop: '1px solid var(--border)',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
            padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <button type="button" className="cart-mobile-btn" onClick={() => setCartOpen(true)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: cart.length > 0 ? 'var(--purple)' : 'var(--bg-muted)',
                color: cart.length > 0 ? '#fff' : 'var(--text-3)',
                border: 'none', borderRadius: 12, padding: '14px 18px',
                fontSize: 15, fontWeight: 700, cursor: 'pointer',
                boxShadow: cart.length > 0 ? '0 4px 16px rgba(0,100,255,0.35)' : 'none',
              }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                🛒
                {cart.length > 0
                  ? <span>장바구니 <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 99, padding: '1px 7px', fontSize: 12 }}>{cart.length}</span></span>
                  : '장바구니 비어있음'
                }
              </span>
              {cart.length > 0 && <span>{total.toLocaleString()}원 →</span>}
            </button>
          </div>

          {/* ── 모바일 장바구니 드로어 ── */}
          {cartOpen && (
            <>
              <div onClick={() => setCartOpen(false)} style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(4px)', zIndex: 300,
              }} />
              <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 400,
                background: 'var(--bg-card)',
                borderRadius: '20px 20px 0 0',
                boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
                maxHeight: '88vh',
                display: 'flex', flexDirection: 'column',
                animation: 'slideUp 0.25s cubic-bezier(0.34,1.1,0.64,1)',
              }}>
                {/* 드래그 핸들 */}
                <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
                  <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border)' }} />
                </div>
                <CartPanel {...cartProps} isMobileDrawer onClose={() => setCartOpen(false)} />
              </div>
            </>
          )}

          <style>{`
            @keyframes slideUp {
              from { transform: translateY(100%); opacity: 0.6; }
              to   { transform: translateY(0);    opacity: 1; }
            }
            /* 데스크탑에서 모바일 바 숨기기 */
            @media (min-width: 769px) {
              .cart-mobile-bar { display: none !important; }
            }
          `}</style>
        </>
      )}

      {tab === 'history' && (
        <div className="split-layout" style={{ display: 'grid', gridTemplateColumns: detailOrder ? '1fr 400px' : '1fr', gap: 20 }}>
          <div className="card">
            {orders.length === 0
              ? <div className="empty">발주 내역 없음</div>
              : <div className="table-scroll">
                <table>
                <thead><tr><th>발주일</th><th>상태</th><th>금액</th><th className="hide-mobile">메모</th><th style={{ width: 150 }}></th></tr></thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} style={{ cursor: 'pointer', background: detailOrder?.id === o.id ? 'var(--bg-elevated)' : '' }}
                      onClick={async () => { const d = await api.getOrder(o.id); setDetailOrder(d); }}>
                      <td>{new Date(o.created_at).toLocaleDateString('ko-KR')}</td>
                      <td>
                        <StatusBadge status={o.status} />
                        {o.status === 'DELIVERED' && !o.receipt_confirmed_at && !o.receipt_issue_note && (
                          <span className="badge yellow" style={{ marginLeft: 6 }}>수령확인 필요</span>
                        )}
                      </td>
                      <td>{(o.confirmed_amount ?? o.total_amount).toLocaleString()}원</td>
                      <td className="text-muted hide-mobile" style={{ fontSize: 13 }}>{o.memo || '-'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {['DRAFT', 'REVISION_REQUESTED'].includes(o.status) && (
                            <button className="primary small" onClick={e => { e.stopPropagation(); loadOrderToCart(o); }}>이어하기</button>
                          )}
                          <button className="secondary small" onClick={e => { e.stopPropagation(); reorderFromOrder(o); }}>재주문</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
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
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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
                  }}>발주 취소</button>
                )}
                {detailOrder.status === 'DELIVERED' && !detailOrder.receipt_confirmed_at && !detailOrder.receipt_issue_note && (
                  <>
                    <button className="primary small" onClick={() => confirmReceipt(true)}>수령확인</button>
                    <button className="danger small" onClick={() => confirmReceipt(false)}>이상신고</button>
                  </>
                )}
                {detailOrder.receipt_confirmed_at && <span className="badge green">수령확인 완료</span>}
                {detailOrder.receipt_issue_note && (
                  <span className="badge red">{detailOrder.receipt_issue_resolved_at ? '이상신고 처리완료' : '이상신고 접수됨'}</span>
                )}
              </div>
              {detailOrder.receipt_issue_note && (
                <div className="elevated-card" style={{ padding: 10, fontSize: 13, marginBottom: 12, borderLeft: '3px solid #ef4444' }}>
                  신고 내용: {detailOrder.receipt_issue_note}
                </div>
              )}
              <div className="table-scroll">
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
                          {changed && <span className="text-muted" style={{ textDecoration: 'line-through', marginRight: 4 }}>{item.quantity}{item.unit}</span>}
                          <span style={{ fontWeight: changed ? 700 : 400 }}>{item.confirmed_quantity ?? item.quantity} {item.unit}</span>
                          {changed && <span className="badge yellow" style={{ marginLeft: 6 }}>변경됨</span>}
                        </td>
                        <td>{item.amount.toLocaleString()}원</td>
                      </tr>
                    );
                  })}
                </tbody>
                </table>
              </div>
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
