import { toast } from '../toast';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useStore } from '../StoreContext';
import { useAuth } from '../AuthContext';

const LOGISTICS_ROLES = ['SUPER_ADMIN', 'HQ_ADMIN', 'HQ_LOGISTICS'];

function IngredientModal({ item, onClose, onSave }) {
  const [form, setForm] = useState(item || { name: '', unit: 'g', stock: '', threshold: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{item ? '재료 수정' : '재료 추가'}</h3>
        <div className="form-row">
          <div className="form-group">
            <label>재료명</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="예: 밀가루" />
          </div>
          <div className="form-group" style={{ maxWidth: 80 }}>
            <label>단위</label>
            <select value={form.unit} onChange={e => set('unit', e.target.value)}>
              <option>g</option>
              <option>kg</option>
              <option>ml</option>
              <option>L</option>
              <option>개</option>
              <option>팩</option>
              <option>봉</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>현재 재고</label>
            <input type="number" value={form.stock} onChange={e => set('stock', e.target.value)} placeholder="0" />
          </div>
          <div className="form-group">
            <label>알림 기준량 (이하 시 알림)</label>
            <input type="number" value={form.threshold} onChange={e => set('threshold', e.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="secondary" onClick={onClose}>취소</button>
          <button className="primary" onClick={() => onSave(form)}>저장</button>
        </div>
      </div>
    </div>
  );
}

function RestockModal({ item, onClose, onSave }) {
  const [amount, setAmount] = useState('');
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{item.name} 입고</h3>
        <div className="form-group">
          <label>입고량 ({item.unit})</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" autoFocus />
        </div>
        <div className="modal-footer">
          <button className="secondary" onClick={onClose}>취소</button>
          <button className="primary" onClick={() => onSave(Number(amount))}>입고</button>
        </div>
      </div>
    </div>
  );
}

export default function Ingredients() {
  const { user } = useAuth();
  const canEdit = LOGISTICS_ROLES.includes(user?.role);
  const { currentStore } = useStore();
  const [list, setList] = useState([]);
  const [modal, setModal] = useState(null);

  const load = () => {
    if (!currentStore) return;
    api.getIngredients(currentStore.id).then(setList).catch(() => {});
  };
  useEffect(() => { load(); }, [currentStore?.id]);

  const handleSave = async (form) => {
    if (!form.name?.trim()) { toast('재료명을 입력해주세요', 'error'); return; }
    const data = { ...form, stock: Number(form.stock), threshold: Number(form.threshold), store_id: currentStore.id };
    try {
      if (modal?.edit) await api.updateIngredient(modal.edit.id, data);
      else await api.createIngredient(data);
      setModal(null);
      load();
    } catch (e) {
      toast(e.message || '저장에 실패했습니다', 'error');
    }
  };

  const handleRestock = async (amount) => {
    try {
      await api.restock(modal.restock.id, amount);
      setModal(null);
      load();
    } catch (e) {
      toast(e.message || '입고 처리에 실패했습니다', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
      await api.deleteIngredient(id);
      load();
    } catch (e) {
      toast(e.message || '삭제에 실패했습니다', 'error');
    }
  };

  if (!currentStore) return <div className="empty">가맹점을 선택해주세요</div>;

  return (
    <div>
      <div className="top-bar">
        <h2>재료 관리 — {currentStore.name}</h2>
        {canEdit && <button className="primary" onClick={() => setModal('add')}>+ 재료 추가</button>}
      </div>

      <div className="card">
        {list.length === 0 ? (
          <div className="empty">재료를 추가해주세요</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>재료명</th>
                <th>단위</th>
                <th>현재 재고</th>
                <th>알림 기준</th>
                <th>핵심재료</th>
                <th>상태</th>
                {canEdit && <th>관리</th>}
              </tr>
            </thead>
            <tbody>
              {list.map(i => {
                const low = i.stock <= i.threshold;
                const pct = i.threshold > 0 ? Math.min((i.stock / (i.threshold * 2)) * 100, 100) : 50;
                return (
                  <tr key={i.id}>
                    <td><b>{i.name}</b></td>
                    <td>{i.unit}</td>
                    <td>
                      {i.stock}
                      <div className="progress-bar">
                        <div className="fill" style={{ width: `${pct}%`, background: low ? '#dc2626' : '#16a34a' }} />
                      </div>
                    </td>
                    <td>{i.threshold} {i.unit}</td>
                    <td>
                      {canEdit ? (
                        <button
                          className={i.is_key ? 'primary small' : 'secondary small'}
                          onClick={async () => {
                            await api.updateIngredient(i.id, { ...i, is_key: !i.is_key });
                            load();
                          }}
                        >
                          {i.is_key ? '핵심' : '일반'}
                        </button>
                      ) : (i.is_key ? '핵심' : '일반')}
                    </td>
                    <td><span className={`badge ${low ? 'red' : 'green'}`}>{low ? '부족' : '정상'}</span></td>
                    {canEdit && (
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="secondary small" onClick={() => setModal({ restock: i })}>입고</button>
                        <button className="secondary small" onClick={() => setModal({ edit: i })}>수정</button>
                        <button className="danger small" onClick={() => handleDelete(i.id)}>삭제</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {(modal === 'add' || modal?.edit) && (
        <IngredientModal
          item={modal?.edit}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {modal?.restock && (
        <RestockModal
          item={modal.restock}
          onClose={() => setModal(null)}
          onSave={handleRestock}
        />
      )}
    </div>
  );
}
