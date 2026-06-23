import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useStore } from '../StoreContext';

function BulkSyncModal({ stores, onClose }) {
  const [from, setFrom] = useState(() => new Date(Date.now() - 5 * 365 * 86400000).toISOString().split('T')[0]);
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);

  const targets = stores.filter(s => s.toss_store_id);

  const runAll = async () => {
    setRunning(true);
    setResults(targets.map(s => ({ store_id: s.id, store_name: s.name, status: 'pending' })));
    for (const store of targets) {
      setResults(prev => prev.map(r => r.store_id === store.id ? { ...r, status: 'running' } : r));
      try {
        const r = await api.syncStore(store.id, { from, to });
        setResults(prev => prev.map(x => x.store_id === store.id ? { ...x, status: 'done', inserted: r.inserted } : x));
      } catch (e) {
        setResults(prev => prev.map(x => x.store_id === store.id ? { ...x, status: 'error', error: e.message } : x));
      }
    }
    setRunning(false);
  };

  return (
    <div className="modal-overlay" onClick={running ? undefined : onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>📥 전체 가맹점 매출 동기화</h3>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
          토스플레이스 매장 ID가 등록된 가맹점({targets.length}개)을 순서대로 하나씩 동기화합니다.
        </p>
        <div className="form-row">
          <div className="form-group">
            <label>시작일</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} disabled={running} />
          </div>
          <div className="form-group">
            <label>종료일</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} disabled={running} />
          </div>
        </div>

        {results.length > 0 && (
          <div className="elevated-card" style={{ padding: 12, marginBottom: 16, maxHeight: 240, overflowY: 'auto' }}>
            {results.map(r => (
              <div key={r.store_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{r.store_name}</span>
                {r.status === 'pending' && <span className="text-muted">대기중</span>}
                {r.status === 'running' && <span style={{ color: 'var(--purple)' }}>동기화 중...</span>}
                {r.status === 'done' && <span style={{ color: '#16a34a' }}>✅ {r.inserted.toLocaleString()}건</span>}
                {r.status === 'error' && <span style={{ color: '#dc2626' }}>❌ {r.error}</span>}
              </div>
            ))}
          </div>
        )}

        {targets.length === 0 && (
          <div className="empty" style={{ padding: 16 }}>토스플레이스 매장 ID가 등록된 가맹점이 없습니다</div>
        )}

        <div className="modal-footer">
          <button className="secondary" onClick={onClose} disabled={running}>닫기</button>
          <button className="primary" onClick={runAll} disabled={running || targets.length === 0}>
            {running ? '동기화 진행 중...' : '동기화 시작'}
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
    business_number: '', owner_name: '', phone: '', open_date: '', franchise_type: '', is_open: true, address: '',
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
          <label>주소</label>
          <input value={form.address || ''} onChange={e => set('address', e.target.value)} placeholder="예: 서울 강남구 ..." />
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
  const navigate = useNavigate();
  const [modal, setModal] = useState(null);
  const [bulkSyncOpen, setBulkSyncOpen] = useState(false);

  const [nameQuery, setNameQuery] = useState('');
  const [bizQuery, setBizQuery] = useState('');
  const [franchiseType, setFranchiseType] = useState('');
  const [openStatus, setOpenStatus] = useState('');
  const [filters, setFilters] = useState(null); // 조회 버튼 눌렀을 때 적용되는 값

  const handleSelect = (store) => {
    selectStore(store);
    navigate('/dashboard');
  };

  const runSearch = () => setFilters({ nameQuery, bizQuery, franchiseType, openStatus });

  const filteredStores = stores.filter(s => {
    if (!filters) return true;
    if (filters.nameQuery && !String(s.name || '').toLowerCase().includes(filters.nameQuery.toLowerCase())) return false;
    if (filters.bizQuery && !String(s.business_number || '').includes(filters.bizQuery)) return false;
    if (filters.franchiseType && s.franchise_type !== filters.franchiseType) return false;
    if (filters.openStatus === 'open' && s.is_open === false) return false;
    if (filters.openStatus === 'closed' && s.is_open !== false) return false;
    return true;
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
      <div className="breadcrumb">기초정보 &gt; 가맹점관리 &gt; <b>가맹점조회</b></div>

      <div className="top-bar">
        <h2>가맹점조회</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="secondary" onClick={() => setBulkSyncOpen(true)}>📥 매출 동기화</button>
          <button className="primary" onClick={() => setModal('add')}>+ 가맹점 추가</button>
        </div>
      </div>

      {/* 검색 필터 패널 */}
      <div className="card kicc-search-panel">
        <div className="kicc-search-row">
          <div className="filter-field">
            <label>매장명</label>
            <input value={nameQuery} onChange={e => setNameQuery(e.target.value)} placeholder="가맹점명" />
          </div>
          <div className="filter-field">
            <label>사업자번호</label>
            <input value={bizQuery} onChange={e => setBizQuery(e.target.value)} placeholder="123-45-67890" />
          </div>
          <div className="filter-field">
            <label>가맹형태</label>
            <select value={franchiseType} onChange={e => setFranchiseType(e.target.value)}>
              <option value="">전체</option>
              {FRANCHISE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="filter-field">
            <label>오픈여부</label>
            <select value={openStatus} onChange={e => setOpenStatus(e.target.value)}>
              <option value="">전체</option>
              <option value="open">오픈</option>
              <option value="closed">폐점</option>
            </select>
          </div>
          <button className="primary kicc-search-btn" onClick={runSearch}>🔍 조회</button>
        </div>
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
                <th>매장</th>
                <th>대표자명</th>
                <th>전화번호</th>
                <th>사업자번호</th>
                <th>가맹형태</th>
                <th>오픈여부</th>
                <th>개점일</th>
                <th>주소</th>
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
                <tr key={s.id} style={{ background: s.id === currentStore?.id ? 'rgba(0,100,255,0.06)' : '' }}>
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
                  <td className="text-sub" style={{ fontSize: 13 }}>{s.address || '-'}</td>
                  <td className="text-sub" style={{ fontSize: 12 }}>/webhook/{s.id}</td>
                  <td className="text-sub" style={{ fontSize: 13 }}>{s.order_deadline || '-'}</td>
                  <td className="text-sub" style={{ fontSize: 13 }}>{days}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="secondary small" onClick={() => handleSelect(s)}>선택</button>
                    <button className="secondary small" onClick={() => setModal({ edit: s })}>수정</button>
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
      {bulkSyncOpen && (
        <BulkSyncModal stores={stores} onClose={() => setBulkSyncOpen(false)} />
      )}
    </div>
  );
}
