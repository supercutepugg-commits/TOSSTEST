import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useStore } from '../StoreContext';

const TYPE_LABEL = {
  DELIVERY: '입고 (납품)', REFUND: '환불 (입고취소)',
  SALE: '판매 차감', SALE_CANCEL: '판매취소 복구',
  WASTE: '폐기', WASTE_CANCEL: '폐기취소 복구',
  ADJUSTMENT: '실사 조정',
};
const TYPE_COLOR = {
  DELIVERY: 'green', REFUND: 'red', SALE: 'red', SALE_CANCEL: 'green',
  WASTE: 'red', WASTE_CANCEL: 'green', ADJUSTMENT: 'yellow',
};

export default function StockLedger() {
  const { user } = useAuth();
  const storeCtx = useStore();
  const currentStore = storeCtx?.currentStore || (user?.store_id ? { id: user.store_id } : null);
  const [ingredients, setIngredients] = useState([]);
  const [rows, setRows] = useState([]);
  const [ingredientId, setIngredientId] = useState('');
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!currentStore) return;
    api.getIngredients(currentStore.id).then(setIngredients).catch(() => {});
  }, [currentStore?.id]);

  const load = () => {
    if (!currentStore) return;
    api.getStockLedger({ store_id: currentStore.id, ingredient_id: ingredientId || undefined, from, to }).then(setRows).catch(() => {});
  };
  useEffect(() => { load(); }, [currentStore?.id]);

  if (!currentStore) return <div className="empty">가맹점을 선택해주세요</div>;

  return (
    <div>
      <div className="top-bar">
        <h2>상품별 거래 수불</h2>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="form-row">
          <div className="form-group">
            <label>재료</label>
            <select value={ingredientId} onChange={e => setIngredientId(e.target.value)}>
              <option value="">전체</option>
              {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>시작일</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label>종료일</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div className="form-group" style={{ alignSelf: 'flex-end' }}>
            <button className="primary" onClick={load}>조회</button>
          </div>
        </div>
      </div>

      <div className="card">
        {rows.length === 0 ? <div className="empty">조회된 내역이 없습니다</div> : (
          <table>
            <thead><tr><th>일시</th><th>재료</th><th>구분</th><th>변동량</th><th>변동 후 재고</th><th>메모</th><th>처리자</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="text-muted" style={{ fontSize: 12 }}>{new Date(r.created_at).toLocaleString('ko-KR')}</td>
                  <td><b>{r.ingredient_name}</b></td>
                  <td><span className={'badge ' + TYPE_COLOR[r.type]}>{TYPE_LABEL[r.type] || r.type}</span></td>
                  <td style={{ color: r.quantity_delta > 0 ? '#16a34a' : r.quantity_delta < 0 ? '#dc2626' : undefined, fontWeight: 600 }}>
                    {r.quantity_delta > 0 ? '+' : ''}{r.quantity_delta} {r.unit}
                  </td>
                  <td>{r.after_stock != null ? `${r.after_stock} ${r.unit}` : '-'}</td>
                  <td className="text-muted" style={{ fontSize: 13 }}>{r.memo || '-'}</td>
                  <td className="text-muted" style={{ fontSize: 13 }}>{r.created_by_name || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
