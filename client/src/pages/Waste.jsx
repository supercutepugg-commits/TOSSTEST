import { toast } from '../toast';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useStore } from '../StoreContext';
import { exportCsv } from '../exportCsv';

const REASONS = ['유통기한 경과', '품질 저하', '보관 문제', '조리 실수', '오배송 또는 파손', '기타'];

export default function Waste() {
  const { user, isHQ } = useAuth();
  const storeCtx = useStore();
  const currentStore = storeCtx?.currentStore || (user?.store_id ? { id: user.store_id } : null);
  const [logs, setLogs] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    waste_date: new Date().toISOString().slice(0, 10),
    ingredient_id: '', ingredient_name: '', quantity: '', unit: 'g',
    reason: REASONS[0], memo: '',
  });

  const load = () => {
    const params = currentStore ? { store_id: currentStore.id } : {};
    api.getWaste(params).then(setLogs).catch(() => {});
  };

  useEffect(() => {
    load();
    const sid = currentStore?.id;
    if (sid) api.getIngredients(sid).then(setIngredients).catch(() => {});
  }, [currentStore?.id]);

  const handleIngredientSelect = (id) => {
    const ing = ingredients.find(i => i.id === Number(id));
    if (ing) setForm(f => ({ ...f, ingredient_id: ing.id, ingredient_name: ing.name, unit: ing.unit }));
  };

  const handleSave = async () => {
    if (!form.ingredient_id) { toast('식자재를 선택해주세요', 'error'); return; }
    if (!form.quantity) { toast('수량을 입력해주세요', 'error'); return; }
    if (saving) return; // 연속 클릭 시 폐기 기록과 재고 차감이 중복으로 들어가는 것을 방지
    setSaving(true);
    try {
      await api.createWaste({ ...form, quantity: Number(form.quantity) });
      setModal(false);
      setForm({ waste_date: new Date().toISOString().slice(0, 10), ingredient_id: '', ingredient_name: '', quantity: '', unit: 'g', reason: REASONS[0], memo: '' });
      load();
    } catch (e) {
      toast(e.message || '폐기 등록에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openModal = () => {
    const first = ingredients[0];
    if (first) setForm(f => ({ ...f, ingredient_id: first.id, ingredient_name: first.name, unit: first.unit }));
    setModal(true);
  };

  const exportLogs = () => {
    const rows = [
      ['폐기일', ...(isHQ ? ['가맹점'] : []), '식자재', '수량', '단위', '사유', '메모'],
      ...logs.map(l => [
        l.waste_date, ...(isHQ ? [l.store_name] : []),
        l.ingredient_name, l.quantity, l.unit, l.reason, l.memo || '',
      ]),
    ];
    exportCsv(`폐기내역_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  return (
    <div>
      <div className="top-bar">
        <h2>폐기 관리{currentStore?.name ? ` — ${currentStore.name}` : ''}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="secondary" onClick={exportLogs} disabled={logs.length === 0}>⬇ 엑셀 다운로드</button>
          {!isHQ && <button className="primary" onClick={openModal}>+ 폐기 입력</button>}
        </div>
      </div>

      <div className="card">
        {logs.length === 0 ? <div className="empty">폐기 내역 없음</div> : (
          <table>
            <thead>
              <tr>
                <th>폐기일</th>
                {isHQ && <th>가맹점</th>}
                <th>식자재</th>
                <th>수량</th>
                <th>사유</th>
                <th>메모</th>
                {!isHQ && <th></th>}
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td>{l.waste_date}</td>
                  {isHQ && <td>{l.store_name}</td>}
                  <td><b>{l.ingredient_name}</b></td>
                  <td>{l.quantity} {l.unit}</td>
                  <td><span className="badge yellow">{l.reason}</span></td>
                  <td className="text-muted" style={{ fontSize: 13 }}>{l.memo || '-'}</td>
                  {!isHQ && (
                    <td>
                      <button className="danger small" onClick={async () => { await api.deleteWaste(l.id); load(); }}>삭제</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>폐기 입력</h3>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>폐기일</label>
              <input type="date" value={form.waste_date}
                onChange={e => setForm(f => ({ ...f, waste_date: e.target.value }))} />
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>식자재</label>
              {ingredients.length === 0
                ? <div className="empty" style={{ padding: 12 }}>등록된 재고가 없습니다 (납품 완료 후 자동 등록)</div>
                : <select value={form.ingredient_id} onChange={e => handleIngredientSelect(e.target.value)}>
                  {ingredients.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.name} (현재 재고: {i.stock}{i.unit})
                    </option>
                  ))}
                </select>
              }
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>폐기 수량</label>
                <input type="number" value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  placeholder="0" autoFocus />
              </div>
              <div className="form-group" style={{ maxWidth: 80 }}>
                <label>단위</label>
                <input value={form.unit} readOnly />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>폐기 사유</label>
              <select value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>
                {REASONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>메모</label>
              <input value={form.memo}
                onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                placeholder="메모 (선택)" />
            </div>

            <div className="modal-footer">
              <button className="secondary" onClick={() => setModal(false)}>취소</button>
              <button className="primary" onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
