import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useTheme } from '../ThemeContext';

export default function Login() {
  const { login } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      if (['STORE_OWNER', 'STORE_STAFF'].includes(user.role)) navigate('/store');
      else navigate('/');
    } catch {
      setError('이메일 또는 비밀번호가 올바르지 않습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <button className="theme-toggle" onClick={toggle} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          {theme === 'light' ? '다크 모드' : '라이트 모드'}
        </button>
      </div>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: '40px 48px', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>포스모스</h1>
        <p className="text-muted" style={{ marginBottom: 32, fontSize: 14 }}>오더페이 관리 시스템</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>이메일</label>
            <input type="email" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="admin@posmos.com" />
          </div>
          <div className="form-group" style={{ marginBottom: 24 }}>
            <label>비밀번호</label>
            <input type="password" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="••••••••" />
          </div>
          {error && <div style={{ color: '#ef4444', fontSize: 14, marginBottom: 16 }}>{error}</div>}
          <button type="submit" className="primary" style={{ width: '100%', padding: '12px', fontSize: 15 }} disabled={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
