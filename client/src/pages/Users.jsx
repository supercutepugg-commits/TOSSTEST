import { useEffect, useState } from 'react';
import { api } from '../api';

const ROLE_LABEL = {
  SUPER_ADMIN: '최고관리자', HQ_ADMIN: '본사 관리자',
  HQ_LOGISTICS: '본사 물류', HQ_ACCOUNTING: '본사 경리',
  STORE_OWNER: '가맹점 점주', STORE_STAFF: '가맹점 직원',
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'STORE_OWNER', store_id: '' });

  const load = () => { api.getUsers().then(setUsers).catch(() => {}); };
  useEffect(() => {
    load();
    api.getStores().then(setStores).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (modal?.edit) await api.updateUser(modal.edit.id, form);
    else await api.createUser(form);
    setModal(null);
    load();
  };

  const openEdit = (u) => {
    setForm({ name: u.name, email: u.email, password: '', role: u.role, store_id: u.store_id || '' });
    setModal({ edit: u });
  };

  return (
    <div>
      <div className="top-bar">
        <h2>사용자 관리</h2>
        <button className="primary" onClick={() => { setForm({ name: '', email: '', password: '', role: 'STORE_OWNER', store_id: '' }); setModal('add'); }}>+ 사용자 추가</button>
      </div>
      <div className="card">
        {users.length === 0 ? <div className="empty">사용자 없음</div> : (
          <table>
            <thead><tr><th>이름</th><th>이메일</th><th>역할</th><th>가맹점</th><th>활성</th><th>관리</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><b>{u.name}</b></td>
                  <td style={{ fontSize: 13 }}>{u.email}</td>
                  <td><span className="badge green">{ROLE_LABEL[u.role] || u.role}</span></td>
                  <td style={{ fontSize: 13, color: '#94a3b8' }}>{stores.find(s => s.id === u.store_id)?.name || '-'}</td>
                  <td><span className={`badge ${u.is_active ? 'green' : 'red'}`}>{u.is_active ? '활성' : '비활성'}</span></td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="secondary small" onClick={() => openEdit(u)}>수정</button>
                    <button className="danger small" onClick={async () => { if (confirm('삭제?')) { await api.deleteUser(u.id); load(); } }}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(modal === 'add' || modal?.edit) && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{modal?.edit ? '사용자 수정' : '사용자 추가'}</h3>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>이름</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>이메일</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>비밀번호 {modal?.edit && '(변경 시만 입력)'}</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>역할</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {['STORE_OWNER', 'STORE_STAFF'].includes(form.role) && (
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>가맹점</label>
                <select value={form.store_id} onChange={e => setForm(f => ({ ...f, store_id: e.target.value }))}>
                  <option value="">선택</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div className="modal-footer">
              <button className="secondary" onClick={() => setModal(null)}>취소</button>
              <button className="primary" onClick={handleSave}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
