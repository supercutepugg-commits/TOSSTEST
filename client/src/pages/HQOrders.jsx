import { toast } from '../toast';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { exportCsv } from '../exportCsv';

const LOGISTICS_ROLES = ['SUPER_ADMIN', 'HQ_ADMIN', 'HQ_LOGISTICS'];

// 환불 사유를 자유 텍스트로만 받으면 나중에 "어떤 사유가 잦은지" 통계를 낼 수 없어서
// 코드를 같이 받는다 — 자유 텍스트(reason)는 그대로 두고, 분류용 코드만 추가로 선택받는다.
const REFUND_REASON_CODES = [
  { code: 'DAMAGED', label: '파손/불량' },
  { code: 'WRONG_ITEM', label: '오배송' },
  { code: 'OUT_OF_STOCK', label: '품절' },
  { code: 'STORE_REQUEST', label: '가맹점 요청 취소' },
  { code: 'OTHER', label: '기타' },
];

function promptReasonCode() {
  const list = REFUND_REASON_CODES.map((r, i) => `${i + 1}. ${r.label}`).join('\n');
  const input = prompt(`환불 사유 분류를 선택하세요\n${list}`, '1');
  if (input === null) return undefined;
  const idx = Number(input) - 1;
  return REFUND_REASON_CODES[idx]?.code || 'OTHER';
}

const STATUS_LABEL = {
  DRAFT: '임시저장', ORDERED: '발주완료', REVIEWING: '검토중',
  REVISION_REQUESTED: '수정요청', CONFIRMED: '주문확정',
  PAYMENT_PENDING: '결제대기', PAID: '결제완료',
  PREPARING_SHIPMENT: '출고준비', SHIPPED: '출고완료',
  DELIVERED: '납품완료', CLOSED: '주문종료', CANCELED: '주문취소',
};
const STATUS_COLOR = {
  ORDERED: '#6366f1', REVIEWING: '#f59e0b', REVISION_REQUESTED: '#ef4444',
  CONFIRMED: '#06b6d4', PAYMENT_PENDING: '#f97316', PAID: '#22c55e',
  PREPARING_SHIPMENT: '#8b5cf6', SHIPPED: '#3b82f6', DELIVERED: '#16a34a',
  CLOSED: '#64748b', CANCELED: '#ef4444', DRAFT: '#94a3b8',
};
const STATUS_FLOW = ['ORDERED', 'REVIEWING', 'CONFIRMED', 'PAYMENT_PENDING', 'PAID', 'PREPARING_SHIPMENT', 'SHIPPED', 'DELIVERED'];
const ACTIVE = ['ORDERED', 'REVIEWING', 'REVISION_REQUESTED', 'CONFIRMED', 'PAYMENT_PENDING', 'PAID', 'PREPARING_SHIPMENT', 'SHIPPED'];
const DONE = ['DELIVERED', 'CLOSED', 'CANCELED'];

function exportExcel(detail) {
  const rows = [
    ['발주서 #' + detail.id, detail.store_name, STATUS_LABEL[detail.status], new Date(detail.created_at).toLocaleDateString('ko-KR')],
    [],
    ['상품명', '단위', '발주량', '확정량', '단가', '금액', '상태', '대체메모'],
    ...(detail.items || []).map(i => [
      i.product_name, i.unit, i.quantity, i.confirmed_quantity ?? i.quantity,
      i.unit_price, i.amount, i.status === 'OUT_OF_STOCK' ? '품절' : '정상', i.substitute_note || '',
    ]),
    [],
    ['', '', '', '', '', '확정금액', detail.confirmed_amount ?? detail.total_amount],
  ];
  exportCsv(`발주서_${detail.id}_${detail.store_name}.csv`, rows);
}

function exportOrderList(orders) {
  const rows = [
    ['가맹점', '발주일', '상태', '금액'],
    ...orders.map(o => [
      o.store_name, new Date(o.created_at).toLocaleDateString('ko-KR'),
      STATUS_LABEL[o.status], o.confirmed_amount ?? o.total_amount,
    ]),
  ];
  exportCsv(`발주_목록_${new Date().toISOString().slice(0, 10)}.csv`, rows);
}

function StatusBadge({ status }) {
  const c = STATUS_COLOR[status] || '#64748b';
  return (
    <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 6, background: c + '22', color: c }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function HQOrders() {
  const { user } = useAuth();
  const canEdit = LOGISTICS_ROLES.includes(user?.role);
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('active');
  const [refundQty, setRefundQty] = useState({});

  const load = () => api.getOrders().then(setOrders).catch(() => {});
  useEffect(() => { load(); }, []);

  const loadDetail = async (id) => {
    const d = await api.getOrder(id);
    setDetail(d);
    setSelected(id);
    setRefundQty({});
  };

  const reject = async (order) => {
    const reason = prompt('수정 요청 사유를 입력하세요');
    if (!reason) return;
    await api.changeOrderStatus(order.id, 'REVISION_REQUESTED', reason);
    load();
  };

  const refund = async (order) => {
    const total = Math.round(order.confirmed_amount ?? order.total_amount);
    const remaining = total - Math.round(order.refunded_amount || 0);
    const amountInput = prompt(`환불 금액을 입력하세요 (전액: ${remaining.toLocaleString()}원)`, remaining);
    if (amountInput === null) return;
    const amount = Number(amountInput.replace(/[^0-9]/g, ''));
    if (!amount || amount <= 0 || amount > remaining) { toast('환불 금액이 올바르지 않습니다', 'error'); return; }
    const reason = prompt('환불 사유를 입력하세요');
    if (!reason) return;
    const reasonCode = promptReasonCode();
    if (reasonCode === undefined) return;
    if (!confirm(`${amount.toLocaleString()}원이 환불됩니다. 실제 카드 결제가 취소됩니다. 진행하시겠습니까?`)) return;
    try {
      await api.refundOrder(order.id, reason, amount, reasonCode);
      toast('환불이 완료되었습니다', 'success');
      loadDetail(order.id);
      load();
    } catch (e) {
      toast(e.message || '환불에 실패했습니다', 'error');
    }
  };

  const refundItems = async (order) => {
    const items = Object.entries(refundQty)
      .map(([item_id, qty]) => ({ item_id: Number(item_id), quantity: Number(qty) }))
      .filter(i => i.quantity > 0);
    if (items.length === 0) { toast('환불할 품목의 수량을 입력해주세요', 'error'); return; }
    const total = items.reduce((s, i) => {
      const item = order.items.find(x => x.id === i.item_id);
      return s + (item ? item.unit_price * i.quantity : 0);
    }, 0);
    const reason = prompt(`선택한 품목 환불 금액: ${total.toLocaleString()}원\n환불 사유를 입력하세요`);
    if (!reason) return;
    const reasonCode = promptReasonCode();
    if (reasonCode === undefined) return;
    if (!confirm(`${total.toLocaleString()}원이 환불됩니다. 실제 카드 결제가 취소됩니다. 진행하시겠습니까?`)) return;
    try {
      await api.refundOrderItems(order.id, reason, items, reasonCode);
      toast('환불이 완료되었습니다', 'success');
      loadDetail(order.id);
      load();
    } catch (e) {
      toast(e.message || '환불에 실패했습니다', 'error');
    }
  };

  const visibleOrders = orders.filter(o =>
    tab === 'active' ? ACTIVE.includes(o.status) : DONE.includes(o.status)
  );

  const [refundStats, setRefundStats] = useState(null);
  const toggleRefundStats = async () => {
    if (refundStats) { setRefundStats(null); return; }
    try {
      const rows = await api.getRefundReasons();
      setRefundStats(rows);
    } catch (e) {
      toast(e.message || '환불 사유 통계를 불러오지 못했습니다', 'error');
    }
  };

  // 가맹점 담당자로 지정 안 된 본사 계정도 검수 이상신고를 놓치지 않도록, 발주관리 화면에서
  // 전체 가맹점 기준으로 한 번에 모아 보여준다 (담당자별로만 보이던 "내 업무"의 사각지대 보완)
  const [receiptIssues, setReceiptIssues] = useState([]);
  const [showReceiptIssues, setShowReceiptIssues] = useState(false);
  const loadReceiptIssues = () => api.getReceiptIssues().then(setReceiptIssues).catch(() => {});
  useEffect(() => { loadReceiptIssues(); }, []);
  const resolveIssue = async (orderId) => {
    await api.resolveReceiptIssue(orderId);
    toast('처리완료로 표시되었습니다', 'success');
    loadReceiptIssues();
    load();
  };

  return (
    <div className="split-layout" style={{ display: 'grid', gridTemplateColumns: detail ? '1fr 480px' : '1fr', gap: 20 }}>
      <div>
        <div className="top-bar">
          <h2>주문 관리</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className={tab === 'active' ? 'primary' : 'secondary'} onClick={() => { setTab('active'); setDetail(null); setSelected(null); }}>
              처리중 {orders.filter(o => ACTIVE.includes(o.status)).length > 0 && `(${orders.filter(o => ACTIVE.includes(o.status)).length})`}
            </button>
            <button className={tab === 'done' ? 'primary' : 'secondary'} onClick={() => { setTab('done'); setDetail(null); setSelected(null); }}>
              완료/취소
            </button>
            <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
            <button className="secondary" onClick={toggleRefundStats}>환불 사유 통계</button>
            <button className="secondary" onClick={() => setShowReceiptIssues(v => !v)}>
              검수 이상신고{receiptIssues.length > 0 && ` (${receiptIssues.length})`}
            </button>
            <button className="secondary" onClick={() => exportOrderList(visibleOrders)}>⬇ 엑셀 다운로드</button>
          </div>
        </div>
        {showReceiptIssues && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>처리 대기 중인 검수 이상신고</div>
            {receiptIssues.length === 0
              ? <div className="empty">처리할 이상신고가 없습니다</div>
              : receiptIssues.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 8, gap: 10 }}>
                  <div>
                    <b>{r.store_name}</b> — 발주서 #{r.id}
                    <div className="text-muted" style={{ marginTop: 2 }}>{r.receipt_issue_note}</div>
                  </div>
                  <button className="secondary small" onClick={() => resolveIssue(r.id)}>처리완료</button>
                </div>
              ))}
          </div>
        )}
        {refundStats && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>환불 사유 통계 (최근 30일)</div>
            {refundStats.length === 0
              ? <div className="empty">환불 사유 데이터가 없습니다</div>
              : refundStats.map(r => (
                <div key={r.reason_code} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span>{REFUND_REASON_CODES.find(c => c.code === r.reason_code)?.label || r.reason_code}</span>
                  <span style={{ fontWeight: 700 }}>{r.count}건</span>
                </div>
              ))}
          </div>
        )}
        <div className="card">
          {visibleOrders.length === 0
            ? <div className="empty">{tab === 'active' ? '처리할 주문 없음' : '완료된 주문 없음'}</div>
            : <table>
              <thead>
                <tr><th>가맹점</th><th>발주일</th><th>상태</th><th>금액</th>{tab === 'active' && canEdit && <th>상태 변경</th>}</tr>
              </thead>
              <tbody>
                {visibleOrders.map(o => (
                  <tr key={o.id} style={{ cursor: 'pointer', background: selected === o.id ? 'var(--bg-elevated)' : '' }}
                    onClick={() => loadDetail(o.id)}>
                    <td><b>{o.store_name}</b></td>
                    <td className="text-sub" style={{ fontSize: 13 }}>{new Date(o.created_at).toLocaleDateString('ko-KR')}</td>
                    <td>
                      <StatusBadge status={o.status} />
                      {o.status === 'PAYMENT_PENDING' && o.updated_at && !isNaN(new Date(o.updated_at)) && (Date.now() - new Date(o.updated_at).getTime() > 24 * 3600000) && (
                        <span className="badge red" style={{ marginLeft: 6 }} title="결제대기 24시간 이상 경과">방치</span>
                      )}
                      {o.receipt_issue_note && !o.receipt_issue_resolved_at && (
                        <span className="badge red" style={{ marginLeft: 6 }} title="가맹점이 수령 이상을 신고함">검수이상</span>
                      )}
                    </td>
                    <td>{(o.confirmed_amount ?? o.total_amount).toLocaleString()}원</td>
                    {tab === 'active' && canEdit && (
                      <td onClick={e => e.stopPropagation()}>
                        <select
                          value={o.status}
                          onChange={async e => {
                            const next = e.target.value;
                            if (next === o.status) return;
                            if (next === 'REVISION_REQUESTED') { reject(o); return; }
                            await api.changeOrderStatus(o.id, next);
                            load();
                            if (selected === o.id) loadDetail(o.id);
                          }}
                          style={{ width: 'auto', fontSize: 12, padding: '5px 8px' }}
                        >
                          <option value={o.status}>{STATUS_LABEL[o.status]}</option>
                          {STATUS_FLOW.indexOf(o.status) >= 0 && STATUS_FLOW.slice(STATUS_FLOW.indexOf(o.status) + 1).map(s => (
                            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                          ))}
                          {o.status === 'REVIEWING' && <option value="REVISION_REQUESTED">수정요청</option>}
                        </select>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </div>
      </div>

      {detail && (
        <div className="card" style={{ position: 'sticky', top: 0, maxHeight: '90vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>발주서 #{detail.id} — {detail.store_name}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="secondary small" onClick={() => window.open(`/orders/${detail.id}/invoice`, '_blank')}>거래명세서</button>
              <button className="secondary small" onClick={() => { setDetail(null); setSelected(null); }}>닫기</button>
            </div>
          </div>
          {(detail.created_by_name || detail.assigned_user_name) && (
            <div className="text-muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
              {detail.created_by_name && <>작성자: {detail.created_by_name}</>}
              {detail.created_by_name && detail.assigned_user_name && ' · '}
              {detail.assigned_user_name && <>담당자: {detail.assigned_user_name}</>}
            </div>
          )}

          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusBadge status={detail.status} />
            {detail.refunded_amount > 0 && (
              <span className="badge yellow">환불 {detail.refunded_amount.toLocaleString()}원</span>
            )}
            {detail.receipt_confirmed_at && <span className="badge green">수령확인 완료</span>}
            {canEdit && ['PAID', 'PREPARING_SHIPMENT', 'SHIPPED', 'DELIVERED', 'CLOSED'].includes(detail.status) && (
              <button className="secondary small" onClick={() => refund(detail)}>
                {detail.refunded_amount > 0 ? '추가 금액 환불' : '금액 환불'}
              </button>
            )}
          </div>
          {detail.receipt_issue_note && (
            <div className="elevated-card" style={{ padding: 10, fontSize: 13, marginBottom: 16, borderLeft: '3px solid #ef4444' }}>
              <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>가맹점 검수 이상신고</div>
              {detail.receipt_issue_note}
              {!detail.receipt_issue_resolved_at && canEdit && (
                <div style={{ marginTop: 8 }}>
                  <button className="secondary small" onClick={async () => {
                    await api.resolveReceiptIssue(detail.id);
                    toast('처리완료로 표시되었습니다', 'success');
                    loadDetail(detail.id);
                    load();
                  }}>처리완료로 표시</button>
                </div>
              )}
              {detail.receipt_issue_resolved_at && <div className="text-sub" style={{ marginTop: 6 }}>처리완료됨</div>}
            </div>
          )}
          {canEdit && ['PAID', 'PREPARING_SHIPMENT', 'SHIPPED', 'DELIVERED', 'CLOSED'].includes(detail.status) && (
            <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>
              아래 표에서 반품된 품목의 수량을 입력하면 해당 품목만 환불(재고도 함께 차감)됩니다.
            </div>
          )}

          <table style={{ marginBottom: 16 }}>
            <thead><tr><th>상품</th><th>단위</th><th>발주량</th><th>확정량</th><th>상태</th><th>대체/메모</th><th>금액</th>
              {canEdit && ['PAID', 'PREPARING_SHIPMENT', 'SHIPPED', 'DELIVERED', 'CLOSED'].includes(detail.status) && <th>환불수량</th>}
            </tr></thead>
            <tbody>
              {detail.items?.map(item => {
                const editable = canEdit && ['REVIEWING', 'CONFIRMED'].includes(detail.status);
                const isOOS = item.status === 'OUT_OF_STOCK';
                const refundable = canEdit && ['PAID', 'PREPARING_SHIPMENT', 'SHIPPED', 'DELIVERED', 'CLOSED'].includes(detail.status);
                const maxRefundQty = (item.confirmed_quantity ?? item.quantity) - (item.refunded_quantity || 0);
                return (
                  <tr key={item.id} style={{ opacity: isOOS ? 0.5 : 1 }}>
                    <td>{item.product_name}</td>
                    <td>{item.unit}</td>
                    <td>{item.quantity}</td>
                    <td>
                      {editable
                        ? <input type="number" defaultValue={item.confirmed_quantity ?? item.quantity}
                            style={{ width: 70 }}
                            onBlur={async e => {
                              await api.updateOrderItem(detail.id, item.id, { confirmed_quantity: Number(e.target.value) });
                              loadDetail(detail.id);
                            }} />
                        : (item.confirmed_quantity ?? item.quantity)
                      }
                    </td>
                    <td>
                      {editable ? (
                        <button
                          className={isOOS ? 'primary small' : 'secondary small'}
                          style={isOOS ? { background: '#dc2626', border: 'none' } : {}}
                          onClick={async () => {
                            await api.updateOrderItem(detail.id, item.id, { status: isOOS ? 'NORMAL' : 'OUT_OF_STOCK' });
                            loadDetail(detail.id);
                          }}
                        >
                          {isOOS ? '품절' : '정상'}
                        </button>
                      ) : (
                        <span className={`badge ${isOOS ? 'red' : 'green'}`}>{isOOS ? '품절' : '정상'}</span>
                      )}
                    </td>
                    <td>
                      {editable ? (
                        <input
                          defaultValue={item.substitute_note || ''}
                          placeholder="대체 메모"
                          style={{ width: 120, fontSize: 12 }}
                          onBlur={async e => {
                            await api.updateOrderItem(detail.id, item.id, { substitute_note: e.target.value });
                          }}
                        />
                      ) : (
                        <span className="text-sub" style={{ fontSize: 12 }}>{item.substitute_note || '-'}</span>
                      )}
                    </td>
                    <td>{item.amount.toLocaleString()}원</td>
                    {refundable && (
                      <td>
                        {maxRefundQty > 0 ? (
                          <input type="number" min={0} max={maxRefundQty} placeholder="0"
                            value={refundQty[item.id] ?? ''}
                            onChange={e => setRefundQty(q => ({ ...q, [item.id]: e.target.value }))}
                            style={{ width: 60, textAlign: 'center' }} />
                        ) : (
                          <span className="badge yellow" style={{ fontSize: 11 }}>전량 환불됨</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {canEdit && ['PAID', 'PREPARING_SHIPMENT', 'SHIPPED', 'DELIVERED', 'CLOSED'].includes(detail.status) && (
            <div style={{ marginBottom: 16 }}>
              <button className="secondary small" onClick={() => refundItems(detail)}>선택 품목 환불</button>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700 }}>
              확정금액: {(detail.confirmed_amount ?? detail.total_amount).toLocaleString()}원
            </div>
            <button className="secondary small" onClick={() => exportExcel(detail)}>⬇ 엑셀 다운로드</button>
          </div>

          {detail.memo && (
            <div className="elevated-card" style={{ padding: 12, fontSize: 13, marginBottom: 16 }}>
              메모: {detail.memo}
            </div>
          )}

          {detail.history?.length > 0 && (
            <>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>처리 이력</div>
              {detail.history.map(h => (
                <div key={h.id} className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  {new Date(h.created_at).toLocaleString('ko-KR')} — {h.changed_by_name || '시스템'}: {h.action}
                  {h.reason && ` (${h.reason})`}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
