import { toast } from '../toast';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';

const LOGISTICS_ROLES = ['SUPER_ADMIN', 'HQ_ADMIN', 'HQ_LOGISTICS'];

function ProductModal({ item, ingredients, onClose, onSave }) {
  const [form, setForm] = useState(item || { name: '', unit: '박스', base_unit: 'g', unit_conversion: 1, price: 0, ingredient_id: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{item ? '상품 수정' : '상품 추가'}</h3>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>상품명</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="예: 김치 10kg 박스" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>발주 단위</label>
            <select value={form.unit} onChange={e => set('unit', e.target.value)}>
              {['박스', '봉', '통', '묶음', 'kg', 'L', '개', '팩'].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>기본 단위</label>
            <select value={form.base_unit} onChange={e => set('base_unit', e.target.value)}>
              {['g', 'kg', 'ml', 'L', '개'].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>단위 환산 (1{form.unit} = ? {form.base_unit})</label>
          <input type="number" value={form.unit_conversion} onChange={e => set('unit_conversion', e.target.value)} placeholder="예: 10000" />
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>단가 (원 / {form.unit})</label>
          <input type="number" value={form.price} onChange={e => set('price', e.target.value)} placeholder="0" />
        </div>
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>연결 식자재 (선택 — 납품 시 재고 자동 반영)</label>
          <select value={form.ingredient_id} onChange={e => set('ingredient_id', e.target.value)}>
            <option value="">선택 안함</option>
            {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
          </select>
        </div>
        <div className="modal-footer">
          <button className="secondary" onClick={onClose}>취소</button>
          <button className="primary" onClick={() => onSave(form)}>저장</button>
        </div>
      </div>
    </div>
  );
}

export default function Products() {
  const { user } = useAuth();
  const canEdit = LOGISTICS_ROLES.includes(user?.role);
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [modal, setModal] = useState(null);

  const load = () => api.getProducts().then(setProducts).catch(() => {});
  useEffect(() => {
    load();
    api.getIngredients().then(setIngredients).catch(() => {});
  }, []);

  const handleSave = async (form) => {
    if (!form.name?.trim()) { toast('상품명을 입력해주세요', 'error'); return; }
    const data = {
      ...form,
      unit_conversion: Number(form.unit_conversion),
      price: Number(form.price),
      ingredient_id: form.ingredient_id ? Number(form.ingredient_id) : null,
    };
    try {
      if (modal?.edit) await api.updateProduct(modal.edit.id, data);
      else await api.createProduct(data);
      setModal(null);
      load();
    } catch (e) {
      toast(e.message || '저장에 실패했습니다', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await api.deleteProduct(id);
    load();
  };

  return (
    <div>
      <div className="top-bar">
        <h2>발주 상품 관리</h2>
        {canEdit && <button className="primary" onClick={() => setModal('add')}>+ 상품 추가</button>}
      </div>

      <div className="card">
        {products.length === 0 ? (
          <div className="empty">발주 상품을 추가해주세요</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>상품명</th>
                <th>발주 단위</th>
                <th>단위 환산</th>
                <th>단가</th>
                <th>연결 식자재</th>
                {canEdit && <th>관리</th>}
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td><b>{p.name}</b></td>
                  <td>{p.unit}</td>
                  <td style={{ fontSize: 13, color: '#94a3b8' }}>
                    1{p.unit} = {p.unit_conversion}{p.base_unit}
                  </td>
                  <td>{p.price > 0 ? `${p.price.toLocaleString()}원` : <span className="badge yellow">미설정</span>}</td>
                  <td style={{ fontSize: 13, color: '#94a3b8' }}>
                    {ingredients.find(i => i.id === p.ingredient_id)?.name || '-'}
                  </td>
                  {canEdit && (
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="secondary small" onClick={() => setModal({ edit: p })}>수정</button>
                      <button className="danger small" onClick={() => handleDelete(p.id)}>삭제</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(modal === 'add' || modal?.edit) && (
        <ProductModal
          item={modal?.edit}
          ingredients={ingredients}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
