import { toast } from '../toast';
import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Notices() {
  const [notices, setNotices] = useState([]);
  const [stores, setStores] = useState([]);
  const [modal, setModal] = useState(null); // null | { editing: notice|null }
  const [form, setForm] = useState({ title: '', content: '', store_id: '' });
  const [saving, setSaving] = useState(false);

  const load = () => api.getNotices().then(setNotices).catch(() => {});
  useEffect(() => {
    load();
    api.getStores().then(setStores).catch(() => {});
  }, []);

  const openCreate = () => {
    setForm({ title: '', content: '', store_id: '' });
    setModal({ editing: null });
  };
  const openEdit = (n) => {
    setForm({ title: n.title, content: n.content, store_id: n.store_id || '' });
    setModal({ editing: n });
  };

  const save = async () => {
    if (!form.title.trim()) { toast('제목을 입력해주세요', 'error'); return; }
    if (!form.content.trim()) { toast('내용을 입력해주세요', 'error'); return; }
    if (saving) return;
    setSaving(true);
    try {
      if (modal.editing) {
        await api.updateNotice(modal.editing.id, { title: form.title, content: form.content });
      } else {
        await api.createNotice({ title: form.title, content: form.content, store_id: form.store_id || null });
      }
      toast('저장되었습니다', 'success');
      setModal(null);
      load();
    } catch (e) {
      toast(e.message || '저장에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (n) => {
    try {
      await api.updateNotice(n.id, { is_active: !n.is_active });
      load();
    } catch (e) {
      toast(e.message || '처리에 실패했습니다', 'error');
    }
  };

  const remove = async (n) => {
    if (!confirm('이 공지를 삭제하시겠습니까?')) return;
    try {
      await api.deleteNotice(n.id);
      load();
    } catch (e) {
      toast(e.message || '삭제에 실패했습니다', 'error');
    }
  };

  const targetCount = (n) => n.store_id ? 1 : stores.length;

  return (
    <div>
      <div className="top-bar">
        <h2>공지사항</h2>
        <button className="primary" onClick={openCreate}>+ 공지 작성</button>
      </div>

      <div className="card">
        {notices.length === 0 ? <div className="empty">등록된 공지가 없습니다</div> : (
          <table>
            <thead><tr><th>제목</th><th>대상</th><th>확인</th><th>상태</th><th>작성일</th><th>관리</th></tr></thead>
            <tbody>
              {notices.map(n => (
                <tr key={n.id}>
                  <td><b>{n.title}</b><div className="text-muted" style={{ fontSize: 12, marginTop: 2, maxWidth: 320 }}>{n.content}</div></td>
                  <td>{n.store_id ? n.store_name : '전체 가맹점'}</td>
                  <td>{n.read_count} / {targetCount(n)}</td>
                  <td>
                    <span className={'badge ' + (n.is_active ? 'green' : 'yellow')}>{n.is_active ? '게시중' : '숨김'}</span>
                  </td>
                  <td className="text-muted" style={{ fontSize: 12 }}>{new Date(n.created_at).toLocaleDateString('ko-KR')}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button className="secondary small" onClick={() => openEdit(n)}>수정</button>
                    <button className="secondary small" onClick={() => toggleActive(n)}>{n.is_active ? '숨기기' : '게시'}</button>
                    <button className="danger small" onClick={() => remove(n)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{modal.editing ? '공지 수정' : '공지 작성'}</h3>

            {!modal.editing && (
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>대상 가맹점</label>
                <select value={form.store_id} onChange={e => setForm(f => ({ ...f, store_id: e.target.value }))}>
                  <option value="">전체 가맹점</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>제목</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus />
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>내용</label>
              <textarea rows={5} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
            </div>

            <div className="modal-footer">
              <button className="secondary" onClick={() => setModal(null)}>취소</button>
              <button className="primary" onClick={save} disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
