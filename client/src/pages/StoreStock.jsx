import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';

export default function StoreStock() {
  const { user } = useAuth();
  const [list, setList] = useState([]);

  const load = () => {
    if (!user?.store_id) return;
    api.getIngredients(user.store_id).then(setList).catch(() => {});
  };

  useEffect(() => { load(); }, [user?.store_id]);

  return (
    <div>
      <div className="top-bar">
        <h2>재고 확인</h2>
        <button className="secondary" onClick={load}>새로고침</button>
      </div>

      <div className="card">
        {list.length === 0 ? (
          <div className="empty">등록된 재고 없음 (납품 완료 시 자동 등록됩니다)</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>식자재명</th>
                <th>현재 재고</th>
                <th>알림 기준</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {list.map(i => {
                const low = i.threshold > 0 && i.stock <= i.threshold;
                const pct = i.threshold > 0 ? Math.min((i.stock / (i.threshold * 2)) * 100, 100) : 50;
                return (
                  <tr key={i.id}>
                    <td><b>{i.name}</b></td>
                    <td>
                      {i.stock} {i.unit}
                      <div className="progress-bar">
                        <div className="fill" style={{ width: `${pct}%`, background: low ? '#dc2626' : '#16a34a' }} />
                      </div>
                    </td>
                    <td>{i.threshold > 0 ? `${i.threshold} ${i.unit}` : <span style={{ color: '#64748b', fontSize: 12 }}>미설정</span>}</td>
                    <td>
                      <span className={`badge ${low ? 'red' : 'green'}`}>{low ? '부족' : '정상'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
