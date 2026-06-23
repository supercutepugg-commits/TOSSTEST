import { toast } from '../toast';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';

export default function StoreStock() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [products, setProducts] = useState([]);
  const [qty, setQty] = useState({});
  const [cart, setCart] = useState([]); // [{ product, quantity, ingredientName }]
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    if (!user?.store_id) return;
    api.getIngredients(user.store_id).then(setList).catch(() => {});
    api.getProducts().then(setProducts).catch(() => {});
  };

  useEffect(() => { load(); }, [user?.store_id]);

  const findProduct = (ingredient) =>
    products.find(p => p.ingredient_id === ingredient.id) ||
    products.find(p => p.name === ingredient.name);

  const addToCart = (ingredient) => {
    const product = findProduct(ingredient);
    if (!product) { toast('연결된 발주 상품이 없어 자동 주문할 수 없습니다. 매입발주 메뉴에서 상품을 등록해주세요.', 'error'); return; }
    const quantity = Number(qty[ingredient.id]) || 1;
    setCart(c => {
      const existing = c.find(e => e.product.id === product.id);
      if (existing) return c.map(e => e.product.id === product.id ? { ...e, quantity: e.quantity + quantity } : e);
      return [...c, { product, quantity, ingredientName: ingredient.name }];
    });
    setQty(q => ({ ...q, [ingredient.id]: '' }));
  };

  const updateCartQty = (productId, quantity) => {
    if (quantity <= 0) setCart(c => c.filter(e => e.product.id !== productId));
    else setCart(c => c.map(e => e.product.id === productId ? { ...e, quantity } : e));
  };

  const removeFromCart = (productId) => setCart(c => c.filter(e => e.product.id !== productId));

  const cartTotal = cart.reduce((s, e) => s + e.product.price * e.quantity, 0);

  const submitCart = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      await api.createOrder({
        submit: true,
        memo: '재고관리에서 추가주문',
        items: cart.map(e => ({
          product_id: e.product.id, product_name: e.product.name,
          unit: e.product.unit, unit_price: e.product.price, quantity: e.quantity,
        })),
      });
      toast('발주가 완료되었습니다', 'success');
      setCart([]);
    } catch (e) {
      toast(e.message || '발주에 실패했습니다', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="top-bar">
        <h2>재고 확인</h2>
        <button className="secondary" onClick={load}>새로고침</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
        <div className="card">
          {list.length === 0 ? (
            <div className="empty">등록된 재고 없음 (납품 완료 시 자동 등록됩니다)</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>식자재명</th>
                  <th>현재 재고</th>
                  <th>알림 기준</th>
                  <th>상태</th>
                  <th>장바구니 담기</th>
                </tr>
              </thead>
              <tbody>
                {list.map(i => {
                  const low = i.threshold > 0 && i.stock <= i.threshold;
                  const pct = i.threshold > 0 ? Math.min((i.stock / (i.threshold * 2)) * 100, 100) : 50;
                  const product = findProduct(i);
                  return (
                    <tr key={i.id}>
                      <td><b>{i.name || <span style={{ color: '#dc2626' }}>(이름 없음)</span>}</b></td>
                      <td>
                        {i.stock} {i.unit}
                        <div className="progress-bar">
                          <div className="fill" style={{ width: `${pct}%`, background: low ? '#dc2626' : '#16a34a' }} />
                        </div>
                      </td>
                      <td>{i.threshold > 0 ? `${i.threshold} ${i.unit}` : <span style={{ color: '#64748b', fontSize: 12 }}>미설정</span>}</td>
                      <td>
                        <span className={`badge ${low ? 'red' : 'green'}`}>{low ? '부족' : '정상'}</span>
                      </td>
                      <td>
                        {product ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input type="number" min={1} placeholder="수량"
                              value={qty[i.id] ?? ''}
                              onChange={e => setQty(q => ({ ...q, [i.id]: e.target.value }))}
                              style={{ width: 60, textAlign: 'center' }} />
                            <span className="text-sub" style={{ fontSize: 12 }}>{product.unit}</span>
                            <button className="primary small" onClick={() => addToCart(i)}>담기</button>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: 12 }}>연결 상품 없음</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="card" style={{ position: 'sticky', top: 0, alignSelf: 'start' }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>장바구니</div>
          {cart.length === 0 ? (
            <div className="empty">담은 항목이 없습니다</div>
          ) : (
            <>
              {cart.map(e => (
                <div key={e.product.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1, fontSize: 14 }}>{e.product.name}</div>
                  <input type="number" value={e.quantity} min={0}
                    onChange={ev => updateCartQty(e.product.id, Number(ev.target.value))}
                    style={{ width: 60, textAlign: 'center' }} />
                  <div className="text-sub" style={{ fontSize: 13, minWidth: 70, textAlign: 'right' }}>
                    {(e.product.price * e.quantity).toLocaleString()}원
                  </div>
                  <button className="secondary small" onClick={() => removeFromCart(e.product.id)}>×</button>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12, fontWeight: 700, textAlign: 'right' }}>
                합계: {cartTotal.toLocaleString()}원
              </div>
              <button className="primary" style={{ width: '100%', marginTop: 12 }} disabled={submitting} onClick={submitCart}>
                {submitting ? '발주 중...' : '발주하기'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
