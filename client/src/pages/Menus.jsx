import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { useStore } from '../StoreContext';
import { useAuth } from '../AuthContext';

const LOGISTICS_ROLES = ['SUPER_ADMIN', 'HQ_ADMIN', 'HQ_LOGISTICS'];

function MenuModal({ item, onClose, onSave }) {
  const [form, setForm] = useState(item ? { name: item.name, toss_menu_id: item.toss_menu_id || '' } : { name: '', toss_menu_id: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{item ? '메뉴 수정' : '메뉴 추가'}</h3>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>메뉴명 (토스플레이스 메뉴명과 동일하게)</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="예: 아메리카노" />
        </div>
        <div className="form-group">
          <label>토스플레이스 메뉴 ID (선택)</label>
          <input value={form.toss_menu_id} onChange={e => set('toss_menu_id', e.target.value)} placeholder="menu_xxx" />
        </div>
        <div className="modal-footer">
          <button className="secondary" onClick={onClose}>취소</button>
          <button className="primary" onClick={() => onSave(form)}>저장</button>
        </div>
      </div>
    </div>
  );
}

function RecipeModal({ menu, ingredients, onClose, onRefresh }) {
  const [form, setForm] = useState({ ingredient_id: '', amount: '' });

  const addRecipe = async () => {
    if (!form.ingredient_id || !form.amount) return;
    await api.addRecipe(menu.id, { ingredient_id: Number(form.ingredient_id), amount: Number(form.amount) });
    setForm({ ingredient_id: '', amount: '' });
    onRefresh();
  };

  const removeRecipe = async (ingId) => {
    await api.deleteRecipe(menu.id, ingId);
    onRefresh();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>레시피 관리 — {menu.name}</h3>

        <div style={{ marginBottom: 16 }}>
          {menu.recipes.length === 0 ? (
            <div className="empty" style={{ padding: 16 }}>레시피 없음</div>
          ) : (
            <table>
              <thead><tr><th>재료</th><th>소모량</th><th></th></tr></thead>
              <tbody>
                {menu.recipes.map(r => (
                  <tr key={r.ingredient_id}>
                    <td>{r.ingredient_name}</td>
                    <td>{r.amount} {r.unit}</td>
                    <td><button className="danger small" onClick={() => removeRecipe(r.ingredient_id)}>삭제</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ fontWeight: 600, marginBottom: 8 }}>재료 추가</div>
        <div className="form-row">
          <div className="form-group">
            <label>재료</label>
            <select value={form.ingredient_id} onChange={e => setForm(f => ({ ...f, ingredient_id: e.target.value }))}>
              <option value="">선택</option>
              {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
            </select>
          </div>
          <div className="form-group" style={{ maxWidth: 120 }}>
            <label>1개당 소모량</label>
            <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
          </div>
          <button className="primary" style={{ marginTop: 20 }} onClick={addRecipe}>추가</button>
        </div>

        <div className="modal-footer">
          <button className="secondary" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

function RecipeHistoryModal({ menu, onClose }) {
  const [history, setHistory] = useState([]);
  useEffect(() => {
    api.getRecipeHistory(menu.id).then(setHistory).catch(() => {});
  }, [menu.id]);

  const ACTION_LABEL = { ADDED: '추가', UPDATED: '수정', DELETED: '삭제' };
  const ACTION_COLOR = { ADDED: '#16a34a', UPDATED: '#f59e0b', DELETED: '#ef4444' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <h3>레시피 변경 이력 — {menu.name}</h3>
        {history.length === 0 ? (
          <div className="empty">변경 이력이 없습니다</div>
        ) : (
          <table>
            <thead><tr><th>일시</th><th>재료</th><th>변경</th><th>수량</th><th>처리자</th></tr></thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id}>
                  <td className="text-sub" style={{ fontSize: 12 }}>{new Date(h.created_at).toLocaleString('ko-KR')}</td>
                  <td>{h.ingredient_name || '-'}</td>
                  <td><span style={{ color: ACTION_COLOR[h.action], fontWeight: 600 }}>{ACTION_LABEL[h.action]}</span></td>
                  <td className="text-sub" style={{ fontSize: 12 }}>
                    {h.old_amount != null && `${h.old_amount} → `}{h.new_amount != null ? h.new_amount : '-'}
                  </td>
                  <td className="text-sub" style={{ fontSize: 12 }}>{h.changed_by_name || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="modal-footer">
          <button className="secondary" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

export default function Menus() {
  const { user } = useAuth();
  const canEdit = LOGISTICS_ROLES.includes(user?.role);
  const { currentStore } = useStore();
  const [menus, setMenus] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [modal, setModal] = useState(null);

  const loadMenus = () => {
    if (!currentStore) return;
    api.getMenus(currentStore.id).then(setMenus).catch(() => {});
  };

  useEffect(() => {
    loadMenus();
    if (currentStore) api.getIngredients(currentStore.id).then(setIngredients).catch(() => {});
  }, [currentStore?.id]);

  const handleSave = async (form) => {
    if (!form.name?.trim()) return alert('메뉴명을 입력해주세요');
    try {
      if (modal?.edit) await api.updateMenu(modal.edit.id, form);
      else await api.createMenu({ ...form, store_id: currentStore.id });
      setModal(null);
      loadMenus();
    } catch (e) {
      alert(e.message || '저장에 실패했습니다');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('메뉴를 삭제하시겠습니까? 레시피도 함께 삭제됩니다.')) return;
    await api.deleteMenu(id);
    loadMenus();
  };

  const getMenuWithLatest = (id) => menus.find(m => m.id === id);

  if (!currentStore) return <div className="empty">가맹점을 선택해주세요</div>;

  return (
    <div>
      <div className="top-bar">
        <h2>메뉴 & 레시피 관리 — {currentStore.name}</h2>
        {canEdit && <button className="primary" onClick={() => setModal('add')}>+ 메뉴 추가</button>}
      </div>

      <div className="card">
        {menus.length === 0 ? (
          <div className="empty">메뉴를 추가해주세요</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>메뉴명</th>
                <th>토스 메뉴 ID</th>
                <th>핵심메뉴</th>
                <th>레시피 재료 수</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {menus.map(m => (
                <tr key={m.id}>
                  <td><b>{m.name}</b></td>
                  <td className="text-sub" style={{ fontSize: 13 }}>{m.toss_menu_id || '-'}</td>
                  <td>
                    {canEdit ? (
                      <button
                        className={m.is_key ? 'primary small' : 'secondary small'}
                        onClick={async () => {
                          await api.updateMenu(m.id, { ...m, is_key: !m.is_key });
                          loadMenus();
                        }}
                      >
                        {m.is_key ? '핵심' : '일반'}
                      </button>
                    ) : (m.is_key ? '핵심' : '일반')}
                  </td>
                  <td>
                    {m.recipes.length === 0
                      ? <span className="badge yellow">레시피 없음</span>
                      : <span className="badge green">{m.recipes.length}가지</span>}
                  </td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="secondary small" onClick={() => setModal({ history: m })}>이력</button>
                    {canEdit && (
                      <>
                        <button className="secondary small" onClick={() => setModal({ recipe: m })}>레시피</button>
                        <button className="secondary small" onClick={() => setModal({ edit: m })}>수정</button>
                        <button className="danger small" onClick={() => handleDelete(m.id)}>삭제</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(modal === 'add' || modal?.edit) && (
        <MenuModal
          item={modal?.edit}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {modal?.recipe && (
        <RecipeModal
          menu={getMenuWithLatest(modal.recipe.id)}
          ingredients={ingredients}
          onClose={() => { setModal(null); loadMenus(); }}
          onRefresh={loadMenus}
        />
      )}
      {modal?.history && (
        <RecipeHistoryModal
          menu={modal.history}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
