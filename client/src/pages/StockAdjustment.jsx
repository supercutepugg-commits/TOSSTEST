import { toast } from '../toast';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useStore } from '../StoreContext';

export default function StockAdjustment() {
  const { user } = useAuth();
  const storeCtx = useStore();
  const currentStore = storeCtx?.currentStore || (user?.store_id ? { id: user.store_id } : null);
  const [ingredients, setIngredients] = useState([]);
  const [history, setHistory] = useState([]);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ingredient_id: '', counted_stock: '', memo: '' });

  const load = () => {
    if (!currentStore) return;
    api.getIngredients(currentStore.id).then(setIngredients).catch(() => {});
    api.getStockAdjustments(currentStore.id).then(setHistory).catch(() => {});
  };

  useEffect(() => { load(); }, [currentStore?.id]);

  const selected = ingredients.find(i => i.id === Number(form.ingredient_id));
  const diff = selected && form.counted_stock !== '' ? Number(form.counted_stock) - selected.stock : null;

  const openModal = () => {
    const first = ingredients[0];
    setForm({ ingredient_id: first?.id || '', counted_stock: '', memo: '' });
    setModal(true);
  };

  const save = async () => {
    if (!form.ingredient_id) { toast('재료를 선택해주세요', 'error'); return; }
    if (form.counted_stock === '') { toast('실사 수량을 입력해주세요', 'error'); return; }
    if (saving) return;
    setSaving(true);
    try {
      const result = await api.createStockAdjustment({
        ingredient_id: form.ingredient_id, counted_stock: Number(form.counted_stock), memo: form.memo,
        store_id: currentStore?.id,
      });
      toast(result.diff === 0 ? '재고가 일치합니다' : `재고가 ${result.diff > 0 ? '+' : ''}${result.diff} 조정되었습니다`, 'success');
      setModal(false);
      load();
    } catch (e) {
      toast(e.message || '저장에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!currentStore) return <div className="empty">가맹점을 선택해주세요</div>;

  return (
    <div>
      <div className="top-bar">
        <h2>실사 재고 조정</h2>
        <button className="primary" onClick={openModal} disabled={ingredients.length === 0}>+ 실사 등록</button>
      </div>

      <div className="card">
        {history.length === 0 ? <div className="empty">실사 조정 내역이 없습니다</div> : (
          <table>
            <thead><tr><th>재료</th><th>조정 전</th><th>실사 수량</th><th>차이</th><th>메모</th><th>처리자</th><th>일시</th></tr></thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id}>
                  <td><b>{h.ingredient_name}</b></td>
                  <td>{h.before_stock} {h.unit}</td>
                  <td>{h.counted_stock} {h.unit}</td>
                  <td>
                    <span className={'badge ' + (h.diff > 0 ? 'green' : h.diff < 0 ? 'red' : 'yellow')}>
                      {h.diff > 0 ? '+' : ''}{h.diff} {h.unit}
                    </span>
                  </td>
                  <td className="text-muted" style={{ fontSize: 13 }}>{h.memo || '-'}</td>
                  <td className="text-muted" style={{ fontSize: 13 }}>{h.created_by_name || '-'}</td>
                  <td className="text-muted" style={{ fontSize: 12 }}>{new Date(h.created_at).toLocaleString('ko-KR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>실사 재고 조정</h3>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>재료</label>
              <select value={form.ingredient_id} onChange={e => setForm(f => ({ ...f, ingredient_id: e.target.value }))}>
                {ingredients.map(i => (
                  <option key={i.id} value={i.id}>{i.name} (시스템 재고: {i.stock}{i.unit})</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>실사로 직접 센 수량{selected ? ` (${selected.unit})` : ''}</label>
              <input type="number" value={form.counted_stock}
                onChange={e => setForm(f => ({ ...f, counted_stock: e.target.value }))}
                placeholder="0" autoFocus />
              {diff !== null && diff !== 0 && (
                <div className={'text-muted'} style={{ fontSize: 12.5, marginTop: 4, color: diff > 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                  시스템 재고 대비 {diff > 0 ? '+' : ''}{diff}{selected.unit} 조정됩니다
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>메모</label>
              <input value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} placeholder="메모 (선택)" />
            </div>

            <div className="modal-footer">
              <button className="secondary" onClick={() => setModal(false)}>취소</button>
              <button className="primary" onClick={save} disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
