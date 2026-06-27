import { toast } from '../toast';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useStore } from '../StoreContext';
import { useAuth } from '../AuthContext';

const ADMIN_ROLES = ['SUPER_ADMIN', 'HQ_ADMIN'];
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// 토스플레이스 API는 2022-01-01 이전 날짜를 from으로 보내면 에러를 반환함 (API 자체 제약)
const TOSS_PLACE_MIN_DATE = '2022-01-01';

function BulkSyncModal({ stores, onClose }) {
  const [from, setFrom] = useState(() => {
    const fiveYearsAgo = new Date(Date.now() - 5 * 365 * 86400000).toISOString().split('T')[0];
    return fiveYearsAgo < TOSS_PLACE_MIN_DATE ? TOSS_PLACE_MIN_DATE : fiveYearsAgo;
  });
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
        <h3>전체 가맹점 매출 동기화</h3>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
          토스플레이스 매장 ID가 등록된 가맹점({targets.length}개)을 순서대로 하나씩 동기화합니다.
        </p>
        <div className="form-row">
          <div className="form-group">
            <label>시작일</label>
            <input type="date" value={from} min={TOSS_PLACE_MIN_DATE} onChange={e => setFrom(e.target.value)} disabled={running} />
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
                {r.status === 'done' && <span style={{ color: '#16a34a' }}>{r.inserted.toLocaleString()}건</span>}
                {r.status === 'error' && <span style={{ color: '#dc2626' }}>{r.error}</span>}
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

const ACTIVE_ORDER_STATUSES = ['ORDERED', 'REVIEWING', 'REVISION_REQUESTED', 'CONFIRMED', 'PAYMENT_PENDING', 'PAID', 'PREPARING_SHIPMENT', 'SHIPPED'];

const won = (v) => `${Math.round(v || 0).toLocaleString()}원`;

// 가맹점명을 클릭했을 때 뜨는 운영 미니 대시보드 — 기본정보(전화번호/주소 등)는 거의 입력이 안 되고
// 잘 쓰이지도 않아서, 본사가 실제로 알고싶어하는 "이 가맹점 요즘 어때?"에 답이 되는 매출/발주/리스크
// 신호를 모아서 보여준다. 기존 대시보드/주문목록 API를 그대로 재사용한다.
function StoreDetailPanel({ store, onClose }) {
  const [dashboard, setDashboard] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ratioTrend, setRatioTrend] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    Promise.all([
      api.getDashboard(store.id),
      api.getOrders({ store_id: store.id }),
      api.getStoreRankings({ from: thisMonthStart.toISOString(), to: now.toISOString() }),
      api.getStoreRankings({ from: lastMonthStart.toISOString(), to: lastMonthEnd.toISOString() }),
    ]).then(([d, o, thisMonth, lastMonth]) => {
      setDashboard(d); setOrders(o);
      const thisRatio = thisMonth.efficiencyRanking.find(r => r.store_id === store.id)?.ratio ?? null;
      const lastRatio = lastMonth.efficiencyRanking.find(r => r.store_id === store.id)?.ratio ?? null;
      setRatioTrend({ thisRatio, lastRatio });
    }).finally(() => setLoading(false));
  }, [store.id]);

  const attentionCount = orders.filter(o => o.needs_attention).length;
  const activeCount = orders.filter(o => ACTIVE_ORDER_STATUSES.includes(o.status)).length;
  const maxRevenue = Math.max(1, ...(dashboard?.weeklyStats || []).map(d => d.revenue));

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{store.name}</div>
        <button className="secondary small" onClick={onClose}>닫기</button>
      </div>

      {loading ? <div className="loading-state">불러오는 중...</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
            <div className="elevated-card" style={{ padding: 12 }}>
              <div className="text-sub" style={{ fontSize: 12 }}>오늘 매출</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>{won(dashboard?.todayRevenue)}</div>
            </div>
            <div className="elevated-card" style={{ padding: 12 }}>
              <div className="text-sub" style={{ fontSize: 12 }}>재고 자산가치</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>{won(dashboard?.stockValue)}</div>
            </div>
            <div className="elevated-card" style={{ padding: 12 }}>
              <div className="text-sub" style={{ fontSize: 12 }}>처리중 발주</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>{activeCount}건</div>
            </div>
            <div className="elevated-card" style={{ padding: 12 }}>
              <div className="text-sub" style={{ fontSize: 12 }}>미확인 변경알림</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4, color: attentionCount > 0 ? '#f59e0b' : 'var(--text)' }}>{attentionCount}건</div>
            </div>
            <div className="elevated-card" style={{ padding: 12 }}>
              <div className="text-sub" style={{ fontSize: 12 }}>이번달 발주율 (전월대비)</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>
                {ratioTrend?.thisRatio ?? '-'}{ratioTrend?.thisRatio !== null && ratioTrend?.thisRatio !== undefined ? '%' : ''}
                {ratioTrend?.thisRatio != null && ratioTrend?.lastRatio != null && (
                  <span style={{ fontSize: 12, marginLeft: 6, color: ratioTrend.thisRatio > ratioTrend.lastRatio ? '#dc2626' : '#16a34a' }}>
                    {ratioTrend.thisRatio > ratioTrend.lastRatio ? '▲' : '▼'} {Math.abs(Math.round((ratioTrend.thisRatio - ratioTrend.lastRatio) * 10) / 10)}%p
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>최근 7일 매출</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
                {(dashboard?.weeklyStats || []).map(d => (
                  <div key={d.date} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{
                      background: 'var(--purple)', borderRadius: 3, margin: '0 auto',
                      height: Math.max(2, (d.revenue / maxRevenue) * 60), width: '70%',
                    }} title={won(d.revenue)} />
                    <div className="text-sub" style={{ fontSize: 11, marginTop: 4 }}>{d.weekday}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>미확인 리스크 ({dashboard?.risks?.length || 0})</div>
              {(!dashboard?.risks || dashboard.risks.length === 0) ? (
                <div className="empty" style={{ padding: 12 }}>없음</div>
              ) : (
                dashboard.risks.slice(0, 5).map(r => (
                  <div key={r.id} className="text-muted" style={{ fontSize: 12.5, marginBottom: 4 }}>
                    {new Date(r.created_at).toLocaleDateString('ko-KR')} — {r.description || r.type}
                  </div>
                ))
              )}
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>최근 발주</div>
              {orders.length === 0 ? (
                <div className="empty" style={{ padding: 12 }}>발주 내역 없음</div>
              ) : (
                orders.slice(0, 5).map(o => (
                  <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span className="text-muted">{new Date(o.created_at).toLocaleDateString('ko-KR')} — 발주서 #{o.id}</span>
                    <span>{won(o.confirmed_amount ?? o.total_amount)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const FRANCHISE_TYPES = ['가맹점', '직영점'];

const HQ_ROLES = ['SUPER_ADMIN', 'HQ_ADMIN', 'HQ_LOGISTICS', 'HQ_ACCOUNTING'];

function StoreModal({ item, onClose, onSave }) {
  const [form, setForm] = useState(item || {
    name: '', webhook_secret: '', toss_store_id: '', order_deadline: '', delivery_days: '',
    business_number: '', owner_name: '', phone: '', open_date: '', franchise_type: '', is_open: true, address: '',
    assigned_user_id: '',
  });
  const [hqUsers, setHqUsers] = useState([]);
  useEffect(() => {
    api.getUsers().then(users => setHqUsers(users.filter(u => HQ_ROLES.includes(u.role)))).catch(() => {});
  }, []);
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
          <label>담당자 (본사)</label>
          <select value={form.assigned_user_id || ''} onChange={e => set('assigned_user_id', e.target.value)}>
            <option value="">지정 안함</option>
            {hqUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
          </select>
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
  const { user } = useAuth();
  const canEdit = ADMIN_ROLES.includes(user?.role);
  const { stores, currentStore, reloadStores } = useStore();
  const [modal, setModal] = useState(null);
  const [bulkSyncOpen, setBulkSyncOpen] = useState(false);
  const [detailStore, setDetailStore] = useState(null);
  const [orderStatus, setOrderStatus] = useState([]);
  const [auditStatus, setAuditStatus] = useState([]);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [statusChip, setStatusChip] = useState('all');
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [showOptional, setShowOptional] = useState(false);
  const [todayRevenue, setTodayRevenue] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  useEffect(() => {
    api.getStoreOrderStatus().then(setOrderStatus).catch(() => {});
    api.getStoreAuditStatus().then(setAuditStatus).catch(() => {});
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    api.getStoreRankings({ from: todayStart, to: now.toISOString() })
      .then(data => {
        const arr = Array.isArray(data) ? data[0]?.revenueRanking : data?.revenueRanking;
        const total = (arr || []).reduce((sum, r) => sum + (r.revenue || 0), 0);
        if (total > 0) setTodayRevenue(total);
      }).catch(() => {});
  }, []);

  useEffect(() => {
    const close = () => setOpenMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const [nameQuery, setNameQuery] = useState('');
  const [bizQuery, setBizQuery] = useState('');
  const [franchiseType, setFranchiseType] = useState('');
  const [openStatus, setOpenStatus] = useState('');
  const [filters, setFilters] = useState(null);

  const handleLogin = (store) => {
    localStorage.setItem('currentStoreId', store.id);
    window.open(`${window.location.origin}/dashboard`, '_blank');
  };

  const runSearch = () => setFilters({ nameQuery, bizQuery, franchiseType, openStatus });

  const filteredStores = stores.filter(s => {
    if (statusChip === 'open' && s.is_open === false) return false;
    if (statusChip === 'closed' && s.is_open !== false) return false;
    if (!filters) return true;
    if (filters.nameQuery && !String(s.name || '').toLowerCase().includes(filters.nameQuery.toLowerCase())) return false;
    if (filters.bizQuery && !String(s.business_number || '').includes(filters.bizQuery)) return false;
    if (filters.franchiseType && s.franchise_type !== filters.franchiseType) return false;
    if (filters.openStatus === 'open' && s.is_open === false) return false;
    if (filters.openStatus === 'closed' && s.is_open !== false) return false;
    return true;
  });

  const handleSave = async (form) => {
    if (!form.name?.trim()) { toast('가맹점명을 입력해주세요', 'error'); return; }
    try {
      if (modal?.edit) await api.updateStore(modal.edit.id, form);
      else await api.createStore(form);
      setModal(null);
      reloadStores();
    } catch (e) {
      toast(e.message || '저장에 실패했습니다', 'error');
    }
  };

  const handleDelete = async (store) => {
    if (!confirm(`"${store.name}"을 삭제하시겠습니까?\n해당 가맹점의 재료, 메뉴, 주문 데이터가 모두 삭제됩니다.`)) return;
    await api.deleteStore(store.id);
    reloadStores();
  };

  const handleRefresh = () => {
    reloadStores();
    setLastUpdated(Date.now());
    toast('최신 데이터로 갱신됐습니다', 'success');
  };

  const openCount = stores.filter(s => s.is_open !== false).length;
  const closedCount = stores.filter(s => s.is_open === false).length;
  const hasRisks = auditStatus.length > 0 || orderStatus.length > 0;

  const visibleIds = filteredStores.map(s => s.id);
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => checkedIds.has(id));
  const toggleAll = () => {
    if (allChecked) setCheckedIds(new Set());
    else setCheckedIds(new Set(visibleIds));
  };
  const toggleOne = (id) => setCheckedIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const minutesAgo = Math.floor((nowTs - lastUpdated) / 60000);
  const lastUpdatedText = minutesAgo < 1 ? '방금 업데이트됨' : `${minutesAgo}분 전 업데이트됨`;

  const colSpan = 7 + (showOptional ? 6 : 0);

  return (
    <div>
      {/* 페이지 헤더 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 15, color: 'var(--text-3)', fontWeight: 600, marginBottom: 8 }}>
          기초정보 <span style={{ opacity: 0.5 }}>›</span> 가맹점관리
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ borderLeft: '2px solid var(--border-input)', paddingLeft: 16, fontSize: 27 }}>가맹점조회</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="secondary" onClick={() => setBulkSyncOpen(true)}>매출 동기화</button>
            {canEdit && <button className="primary" onClick={() => setModal('add')}>+ 가맹점 추가</button>}
          </div>
        </div>
      </div>

      {/* 대량 작업 바 */}
      {checkedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--text)', color: '#fff', borderRadius: 10,
          padding: '10px 16px', marginBottom: 16,
        }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>선택 {checkedIds.size}건</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="small" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}
              onClick={() => { toast('상태가 변경됐습니다', 'success'); setCheckedIds(new Set()); }}>상태 변경</button>
            <button className="small" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}
              onClick={() => toast('내보내기를 시작합니다', 'info')}>내보내기</button>
            <button className="small" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}
              onClick={() => setCheckedIds(new Set())}>선택 해제</button>
          </div>
        </div>
      )}

      {/* 2컬럼 레이아웃 */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

        {/* 메인 콘텐츠 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>

            {/* 검색 필터 헤더 */}
            <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
              <h3 style={{ fontSize: 21, fontWeight: 700, marginBottom: 14 }}>가맹점 목록</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 1fr 1fr auto', gap: 16, alignItems: 'end' }}>
                <div className="form-group">
                  <label htmlFor="sq-name">매장명</label>
                  <input id="sq-name" value={nameQuery} onChange={e => setNameQuery(e.target.value)} placeholder="가맹점명"
                    onKeyDown={e => e.key === 'Enter' && runSearch()} />
                </div>
                <div className="form-group">
                  <label htmlFor="sq-biz">사업자번호</label>
                  <input id="sq-biz" value={bizQuery} onChange={e => setBizQuery(e.target.value)} placeholder="123-45-67890"
                    onKeyDown={e => e.key === 'Enter' && runSearch()} />
                </div>
                <div className="form-group">
                  <label htmlFor="sq-ft">가맹형태</label>
                  <select id="sq-ft" value={franchiseType} onChange={e => setFranchiseType(e.target.value)}>
                    <option value="">전체</option>
                    {FRANCHISE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="sq-open">오픈여부</label>
                  <select id="sq-open" value={openStatus} onChange={e => setOpenStatus(e.target.value)}>
                    <option value="">전체</option>
                    <option value="open">오픈</option>
                    <option value="closed">폐점</option>
                  </select>
                </div>
                <button className="primary" style={{ marginBottom: 16 }} onClick={runSearch}>조회</button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {[
                  { key: 'all', label: `전체 ${stores.length}` },
                  { key: 'open', label: `오픈 ${openCount}` },
                  { key: 'closed', label: `폐점 ${closedCount}` },
                ].map(chip => (
                  <button key={chip.key} onClick={() => setStatusChip(chip.key)} style={{
                    padding: '5px 13px', borderRadius: 99, border: '1px solid var(--border)',
                    background: statusChip === chip.key ? 'var(--text)' : 'transparent',
                    color: statusChip === chip.key ? '#fff' : 'var(--text-3)',
                    fontSize: 14, fontWeight: 600,
                  }}>{chip.label}</button>
                ))}
              </div>
            </div>

            {/* 테이블 툴바 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 15, color: 'var(--text-3)' }}>
                  전체 <b style={{ color: 'var(--text)' }}>{filteredStores.length}건</b>
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-3)', opacity: 0.8 }}>· {lastUpdatedText}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button className="small ghost" aria-label={showOptional ? '컬럼 줄이기' : '컬럼 더보기'} onClick={() => setShowOptional(v => !v)}>
                  {showOptional ? '↑ 컬럼 줄이기' : '↓ 컬럼 더보기'}
                </button>
                <button className="small ghost" aria-label="새로고침" onClick={handleRefresh}>↺ 새로고침</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button className="small ghost" style={{ padding: '3px 7px' }} disabled>‹</button>
                  <button style={{ padding: '3px 9px', background: 'var(--purple)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'default' }}>1</button>
                  <button className="small ghost" style={{ padding: '3px 7px' }} disabled>›</button>
                </div>
              </div>
            </div>

            {/* 테이블 */}
            <div style={{ marginTop: 10, overflowX: 'auto' }}>
              {stores.length === 0 ? (
                <div className="empty">가맹점을 추가해주세요</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>
                        <input type="checkbox" checked={allChecked} onChange={toggleAll}
                          style={{ accentColor: 'var(--purple)', cursor: 'pointer', width: 15, height: 15 }} />
                      </th>
                      <th style={{ width: 46 }}>NO</th>
                      <th>매장</th>
                      <th>대표자명</th>
                      <th>전화번호</th>
                      <th>사업자번호</th>
                      {showOptional && <><th>가맹형태</th><th>담당자</th></>}
                      <th>오픈여부</th>
                      {showOptional && <><th>개점일</th><th>주소</th><th>발주마감</th><th>납품요일</th></>}
                      <th style={{ width: 48 }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStores.length === 0 ? (
                      <tr><td colSpan={colSpan} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-3)', fontSize: 16 }}>검색 결과가 없습니다</td></tr>
                    ) : filteredStores.map((s, i) => {
                      const initial = (s.name || '?').charAt(0);
                      const isSelected = s.id === currentStore?.id;
                      const isClosed = s.is_open === false;
                      const isChecked = checkedIds.has(s.id);
                      const days = s.delivery_days ? s.delivery_days.split(',').filter(Boolean).map(d => DAY_LABELS[Number(d)]).join(' ') : '—';
                      return (
                        <tr key={s.id} style={{ background: isChecked ? 'var(--purple-light)' : isClosed ? 'var(--bg-muted)' : undefined }}>
                          <td>
                            <input type="checkbox" checked={isChecked} onChange={() => toggleOne(s.id)}
                              style={{ accentColor: 'var(--purple)', cursor: 'pointer', width: 15, height: 15 }} />
                          </td>
                          <td style={{ color: 'var(--text-3)', fontSize: 15, textAlign: 'center' }}>{i + 1}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{
                                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                                background: 'var(--bg-muted)', border: '1px solid var(--border)',
                                color: 'var(--text-2)', fontSize: 14, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>{initial}</div>
                              <button type="button" onClick={() => setDetailStore(s)} style={{
                                background: 'none', border: 'none', padding: 0, fontSize: 17,
                                fontWeight: 600, color: isClosed ? 'var(--text-3)' : 'var(--text)',
                                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                              }}>
                                {s.name}
                                {isSelected && <span className="badge green" style={{ fontSize: 11 }}>선택됨</span>}
                              </button>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-3)', opacity: s.owner_name ? 1 : 0.55 }}>{s.owner_name || '—'}</td>
                          <td style={{ color: 'var(--text-3)', opacity: s.phone ? 1 : 0.55 }}>{s.phone || '—'}</td>
                          <td style={{ color: 'var(--text-3)', opacity: s.business_number ? 1 : 0.55 }}>{s.business_number || '—'}</td>
                          {showOptional && <>
                            <td style={{ color: 'var(--text-2)', fontSize: 16 }}>{s.franchise_type || '—'}</td>
                            <td style={{ color: 'var(--text-3)', opacity: s.assigned_user_name ? 1 : 0.55 }}>{s.assigned_user_name || '—'}</td>
                          </>}
                          <td>
                            <span className={`badge subtle ${isClosed ? 'red' : 'green'}`}>
                              {isClosed ? '폐점' : '오픈'}
                            </span>
                          </td>
                          {showOptional && <>
                            <td style={{ color: 'var(--text-3)', fontSize: 15 }}>{s.open_date || '—'}</td>
                            <td style={{ color: 'var(--text-3)', fontSize: 14, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.address || ''}>{s.address || '—'}</td>
                            <td style={{ color: 'var(--text-3)', fontSize: 15 }}>{s.order_deadline || '—'}</td>
                            <td style={{ color: 'var(--text-3)', fontSize: 15 }}>{days}</td>
                          </>}
                          <td>
                            <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                              <button onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)}
                                aria-label="관리 메뉴 열기"
                                style={{ padding: '4px 8px', background: 'transparent', color: 'var(--text-3)', border: 'none', borderRadius: 6, fontSize: 18, lineHeight: 1 }}>
                                ⋮
                              </button>
                              {openMenuId === s.id && (
                                <div style={{
                                  position: 'absolute', right: 0, top: '100%', zIndex: 100,
                                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                                  borderRadius: 8, boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
                                  minWidth: 110, padding: 4,
                                }}>
                                  <button onClick={() => { handleLogin(s); setOpenMenuId(null); }}
                                    style={{ width: '100%', background: 'none', color: 'var(--text-2)', fontSize: 15, padding: '8px 12px', borderRadius: 6, justifyContent: 'flex-start', display: 'flex' }}>로그인</button>
                                  {canEdit && <>
                                    <button onClick={() => { setModal({ edit: s }); setOpenMenuId(null); }}
                                      style={{ width: '100%', background: 'none', color: 'var(--text-2)', fontSize: 15, padding: '8px 12px', borderRadius: 6, justifyContent: 'flex-start', display: 'flex' }}>수정</button>
                                    <button onClick={() => { handleDelete(s); setOpenMenuId(null); }}
                                      style={{ width: '100%', background: 'none', color: '#b91c1c', fontSize: 15, padding: '8px 12px', borderRadius: 6, justifyContent: 'flex-start', display: 'flex' }}>삭제</button>
                                  </>}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {detailStore && (
            <div style={{ marginTop: 16 }}>
              <StoreDetailPanel store={detailStore} onClose={() => setDetailStore(null)} />
            </div>
          )}
        </div>

        {/* 우측 사이드바 */}
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 24 }}>

          {/* 리스크 알림 카드 */}
          {hasRisks && (
            <div className="card" style={{ borderLeft: '3px solid #dc2626' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>최근 리스크 알림</h3>
              {auditStatus.map(s => (
                <div key={s.store_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: '#fee2e2', color: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14, fontWeight: 700 }}>!</div>
                  <div style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                    <b>{s.store_name}</b> — 재고 실사 지연
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>{s.daysSince}일 전</span>
                </div>
              ))}
              {orderStatus.map(s => (
                <div key={s.store_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: '#fef3c7', color: '#92400e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13 }}>△</div>
                  <div style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                    <b>{s.store_name}</b> — 발주 마감 임박
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>
                    {s.diffMin <= 0 ? `${Math.abs(s.diffMin)}분 경과` : `${s.diffMin}분 전`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 금일 전체 매출 스파크라인 */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600, marginBottom: 4 }}>금일 전체 매출</div>
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.3, color: 'var(--text)' }}>
                  {todayRevenue !== null ? `₩${Math.round(todayRevenue).toLocaleString()}` : '₩—'}
                </div>
              </div>
              <span className="badge subtle green" style={{ marginTop: 2, fontSize: 13 }}>↑ +0.0%</span>
            </div>
            <svg viewBox="0 0 280 48" preserveAspectRatio="none" style={{ width: '100%', height: 48, marginTop: 10, display: 'block' }}>
              <polyline points="6,38 46,30 86,34 126,18 166,22 206,10 246,16 274,8"
                fill="none" stroke="var(--purple)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="6" cy="38" r="2.5" fill="var(--bg-card)" stroke="var(--purple)" strokeWidth="1.5" />
              <circle cx="46" cy="30" r="2.5" fill="var(--bg-card)" stroke="var(--purple)" strokeWidth="1.5" />
              <circle cx="86" cy="34" r="2.5" fill="var(--bg-card)" stroke="var(--purple)" strokeWidth="1.5" />
              <circle cx="126" cy="18" r="2.5" fill="var(--bg-card)" stroke="var(--purple)" strokeWidth="1.5" />
              <circle cx="166" cy="22" r="2.5" fill="var(--bg-card)" stroke="var(--purple)" strokeWidth="1.5" />
              <circle cx="206" cy="10" r="2.5" fill="var(--bg-card)" stroke="var(--purple)" strokeWidth="1.5" />
              <circle cx="246" cy="16" r="2.5" fill="var(--bg-card)" stroke="var(--purple)" strokeWidth="1.5" />
              <circle cx="274" cy="8" r="3.5" fill="var(--purple)" />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              {['06시','12시','18시','현재'].map(t => (
                <span key={t} style={{ fontSize: 11, color: 'var(--text-3)' }}>{t}</span>
              ))}
            </div>
          </div>

          {/* 웹훅 URL 안내 (접힘) */}
          <details className="card">
            <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>
              웹훅 URL 안내 <span style={{ opacity: 0.5 }}>▾</span>
            </summary>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7 }}>
              각 가맹점별 웹훅 URL은 <b>백엔드주소/webhook/가맹점ID</b> 형식입니다.<br />
              토스플레이스 관리자에서 가맹점별로 웹훅 URL을 등록해주세요.
            </div>
          </details>
        </div>
      </div>

      {(modal === 'add' || modal?.edit) && (
        <StoreModal item={modal?.edit} onClose={() => setModal(null)} onSave={handleSave} />
      )}
      {bulkSyncOpen && (
        <BulkSyncModal stores={stores} onClose={() => setBulkSyncOpen(false)} />
      )}
    </div>
  );
}
