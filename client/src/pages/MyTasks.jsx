import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

// 가맹점마다 담당 본사 직원이 지정되는데, 브랜드 전체 화면(발주관리/리스크/가맹점조회)만 있어서
// "내가 담당하는 가맹점 중 처리할 게 있는 것"만 빠르게 훑어볼 방법이 없었던 문제를 해소
export default function MyTasks() {
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.getMyTasks().then(setData).catch(() => {});
  }, []);

  if (!data) return <div className="loading-state">불러오는 중...</div>;

  const stores = data.stores || [];
  const totalTasks = stores.reduce((s, st) => s + st.pendingReview + st.needsAttention + st.openRisks + (st.receiptIssues || 0), 0);

  return (
    <div>
      <h2>내 업무</h2>
      <div className="text-sub" style={{ fontSize: 13, marginBottom: 16 }}>
        담당 가맹점에서 처리가 필요한 항목만 모아서 보여줍니다.
      </div>

      {stores.length === 0 ? (
        <div className="empty">담당으로 지정된 가맹점이 없습니다</div>
      ) : totalTasks === 0 ? (
        <div className="empty">처리할 업무가 없습니다 🎉</div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr><th>가맹점</th><th>검토대기 발주</th><th>미확인 변경알림</th><th>검수 이상신고</th><th>미처리 리스크</th><th></th></tr>
            </thead>
            <tbody>
              {stores.filter(s => s.pendingReview + s.needsAttention + s.openRisks + (s.receiptIssues || 0) > 0).map(s => (
                <tr key={s.store_id}>
                  <td><b>{s.store_name}</b></td>
                  <td>{s.pendingReview > 0 ? <span className="badge yellow">{s.pendingReview}건</span> : '-'}</td>
                  <td>{s.needsAttention > 0 ? <span className="badge red">{s.needsAttention}건</span> : '-'}</td>
                  <td>{s.receiptIssues > 0 ? <span className="badge red">{s.receiptIssues}건</span> : '-'}</td>
                  <td>{s.openRisks > 0 ? <span className="badge red">{s.openRisks}건</span> : '-'}</td>
                  <td>
                    <button className="secondary small" onClick={() => navigate('/orders')}>발주관리로 이동</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
