import { useState } from 'react';
import { api } from '../api';
import { useStore } from '../StoreContext';

function SyncModal({ store, onClose }) {
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]);
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      const r = await api.syncStore(store.id, { from, to });
      setResult(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>📥 매출 데이터 동기화 — {store.name}</h3>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
          Toss Place API에서 과거 주문 데이터를 가져옵니다.<br />
          API 키가 설정되어 있어야 합니다.
        </p>
        <div className="form-row">
          <div className="form-group">
            <label>시작일</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label>종료일</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>
        {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        {result && (
          <div className="elevated-card" style={{ padding: 12, fontSize: 13, marginBottom: 12 }}>
            ✅ 동기화 완료 — {result.inserted.toLocaleString()}건 저장 ({result.from} ~ {result.to})
          </div>
        )}
        <div className="modal-footer">
          <button className="secondary" onClick={onClose}>닫기</button>
          <button className="primary" onClick={run} disabled={loading}>
            {loading ? '동기화 중...' : '동기화 시작'}
          </button>
        </div>
      </div>
    </div>
  );
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const FRANCHISE_TYPES = ['가맹점', '직영점'];

function StoreModal({ item, onClose, onSave }) {
  const [form, setForm] = useState(item || {
    name: '', webhook_secret: '', toss_store_id: '', order_deadline: '', delivery_days: '',
    business_number: '', owner_name: '', phone: '', open_date: '', franchise_type: '', is_open: true,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleDay = (d) => {
    const days = form.delivery_days ? form.delivery_days.split(',').filter(Boolean) : [];
    const ds = String(d);
    const next = days.includes(ds) ? days.filter(x => x !== ds) : [...days, ds].sort();
    set('delivery_days', next.join(','));
  };
  const selectedDays = form.delivery_days ? form.delivery_days.split(',').filter(Boolean) : [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{item ? '가맹점 수정' : '가맹점 추가'}</h3>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>가맹점명</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="예: 강남점" />
        </div>
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>가맹형태</label>
            <select value={form.franchise_type || ''} onChange={e => set('franchise_type', e.target.value)}>
              <option value="">선택 안함</option>
              {FRANCHISE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>오픈여부</label>
            <select value={form.is_open ? '1' : '0'} onChange={e => set('is_open', e.target.value === '1')}>
              <option value="1">오픈</option>
              <option value="0">폐점</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>대표자명</label>
            <input value={form.owner_name || ''} onChange={e => set('owner_name', e.target.value)} placeholder="예: 홍길동" />
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>전화번호</label>
            <input value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="02-1234-5678" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>사업자번호</label>
            <input value={form.business_number || ''} onChange={e => set('business_number', e.target.value)} placeholder="123-45-67890" />
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>개점일자</label>
            <input type="date" value={form.open_date || ''} onChange={e => set('open_date', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>웹훅 시크릿 키 (토스플레이스 발급)</label>
          <input value={form.webhook_secret} onChange={e => set('webhook_secret', e.target.value)} placeholder="시크릿 키 입력" />
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>토스플레이스 매장 ID (선택)</label>
          <input value={form.toss_store_id} onChange={e => set('toss_store_id', e.target.value)} placeholder="store_xxx" />
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>발주 마감 시간 (예: 18:00)</label>
          <input value={form.order_deadline} onChange={e => set('order_deadline', e.target.value)} placeholder="18:00" />
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>납품 가능 요일</label>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            {[0,1,2,3,4,5,6].map(d => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                style={{
                  padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                  background: selectedDays.includes(String(d)) ? 'var(--purple)' : 'var(--bg-elevated)',
                  color: selectedDays.includes(String(d)) ? '#fff' : 'var(--text)',
                  border: '1px solid var(--border)',
                }}
              >
                {DAY_LABELS[d]}
              </button>
            ))}
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

export default function Stores() {
  const { stores, currentStore, selectStore, reloadStores } = useStore();
  const [modal, setModal] = useState(null);
  const [syncTarget, setSyncTarget] = useState(null);
  const [search, setSearch] = useState('');

  const filteredStores = stores.filter(s => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return [s.name, s.owner_name, s.business_number, s.phone].some(v => v && String(v).toLowerCase().includes(q));
  });

  const handleSave = async (form) => {
    if (modal?.edit) await api.updateStore(modal.edit.id, form);
    else await api.createStore(form);
    setModal(null);
    reloadStores();
  };

  const handleDelete = async (store) => {
    if (!confirm(`"${store.name}"을 삭제하시겠습니까?\n해당 가맹점의 재료, 메뉴, 주문 데이터가 모두 삭제됩니다.`)) return;
    await api.deleteStore(store.id);
    reloadStores();
  };

  return (
    <div>
      <div className="top-bar">
        <h2>가맹점 관리</h2>
        <button className="primary" onClick={() => setModal('add')}>+ 가맹점 추가</button>
      </div>

      <div className="card" style={{ marginBottom: 12, padding: 12 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="가맹점명 / 대표자명 / 사업자번호 / 전화번호 검색"
          style={{ width: '100%' }}
        />
      </div>

      <div className="card">
        {stores.length === 0 ? (
          <div className="empty">가맹점을 추가해주세요</div>
        ) : filteredStores.length === 0 ? (
          <div className="empty">검색 결과가 없습니다</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>NO</th>
                <th>가맹점명</th>
                <th>대표자명</th>
                <th>전화번호</th>
                <th>사업자번호</th>
                <th>가맹형태</th>
                <th>오픈여부</th>
                <th>개점일</th>
                <th>웹훅 URL</th>
                <th>발주마감</th>
                <th>납품요일</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredStores.map((s, i) => {
                const days = s.delivery_days ? s.delivery_days.split(',').filter(Boolean).map(d => DAY_LABELS[Number(d)]).join(' ') : '-';
                return (
                <tr key={s.id} style={{ background: s.id === currentStore?.id ? 'rgba(99,102,241,0.08)' : '' }}>
                  <td className="text-sub" style={{ fontSize: 13 }}>{i + 1}</td>
                  <td>
                    <b>{s.name}</b>
                    {s.id === currentStore?.id && <span className="badge green" style={{ marginLeft: 8 }}>선택됨</span>}
                  </td>
                  <td className="text-sub" style={{ fontSize: 13 }}>{s.owner_name || '-'}</td>
                  <td className="text-sub" style={{ fontSize: 13 }}>{s.phone || '-'}</td>
                  <td className="text-sub" style={{ fontSize: 13 }}>{s.business_number || '-'}</td>
                  <td className="text-sub" style={{ fontSize: 13 }}>{s.franchise_type || '-'}</td>
                  <td>
                    <span className={`badge ${s.is_open === false ? 'red' : 'green'}`}>{s.is_open === false ? '폐점' : '오픈'}</span>
                  </td>
                  <td className="text-sub" style={{ fontSize: 13 }}>{s.open_date || '-'}</td>
                  <td className="text-sub" style={{ fontSize: 12 }}>/webhook/{s.id}</td>
                  <td className="text-sub" style={{ fontSize: 13 }}>{s.order_deadline || '-'}</td>
                  <td className="text-sub" style={{ fontSize: 13 }}>{days}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="secondary small" onClick={() => selectStore(s)}>선택</button>
                    <button className="secondary small" onClick={() => setModal({ edit: s })}>수정</button>
                    <button className="secondary small" onClick={() => setSyncTarget(s)}>📥 동기화</button>
                    <button className="danger small" onClick={() => handleDelete(s)}>삭제</button>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        )}
      </div>

      <div className="elevated-card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>웹훅 URL 안내</div>
        <div className="text-muted" style={{ fontSize: 13, lineHeight: 2 }}>
          각 가맹점별 웹훅 URL은 <b style={{ color: 'var(--text)' }}>백엔드주소/webhook/가맹점ID</b> 형식입니다.<br />
          토스플레이스 관리자에서 가맹점별로 웹훅 URL을 등록해주세요.
        </div>
      </div>

      {(modal === 'add' || modal?.edit) && (
        <StoreModal
          item={modal?.edit}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {syncTarget && (
        <SyncModal store={syncTarget} onClose={() => setSyncTarget(null)} />
      )}
    </div>
  );
}
