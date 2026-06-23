import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { StoreProvider, useStore } from './StoreContext';
import { ThemeProvider, useTheme } from './ThemeContext';
import Dashboard from './pages/Dashboard';
import Ingredients from './pages/Ingredients';
import Menus from './pages/Menus';
import Stores from './pages/Stores';
import Users from './pages/Users';
import HQOrders from './pages/HQOrders';
import StoreOrder from './pages/StoreOrder';
import StoreStock from './pages/StoreStock';
import Waste from './pages/Waste';
import Risks from './pages/Risks';
import Products from './pages/Products';
import Analytics from './pages/Analytics';
import Login from './pages/Login';
import StockAlert from './components/StockAlert';

function SidebarFooter({ name }) {
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  return (
    <div className="sidebar-footer">
      <div className="sidebar-user">{name}</div>
      <div className="sidebar-actions">
        <button className="secondary small" onClick={logout}>로그아웃</button>
        <button className="theme-toggle" onClick={toggle} title="테마 전환">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>
    </div>
  );
}

function HQLayout() {
  const { user } = useAuth();
  const { stores, currentStore, selectStore } = useStore();

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>🧾 포스모스</h1>

        {stores.length > 0 && (
          <div style={{ padding: '12px 20px 4px' }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, fontWeight: 600, letterSpacing: 1 }}>가맹점</div>
            <select
              value={currentStore?.id || ''}
              onChange={e => { const s = stores.find(x => x.id === Number(e.target.value)); if (s) selectStore(s); }}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #2d2d4e', background: '#2d2d4e', color: '#fff', fontSize: 13, cursor: 'pointer' }}
            >
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        <nav style={{ marginTop: 4 }}>
          <div className="sidebar-section">운영</div>
          <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>🏪 가맹점 선택</NavLink>
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>🏠 대시보드</NavLink>
          <NavLink to="/orders" className={({ isActive }) => isActive ? 'active' : ''}>📋 주문 관리</NavLink>
          <NavLink to="/risks" className={({ isActive }) => isActive ? 'active' : ''}>⚠️ 리스크 알림</NavLink>
          <div className="sidebar-section">재고 · 메뉴</div>
          <NavLink to="/ingredients" className={({ isActive }) => isActive ? 'active' : ''}>🥬 재료 관리</NavLink>
          <NavLink to="/menus" className={({ isActive }) => isActive ? 'active' : ''}>🍽 메뉴 & 레시피</NavLink>
          <NavLink to="/products" className={({ isActive }) => isActive ? 'active' : ''}>📦 발주 상품</NavLink>
          <NavLink to="/waste" className={({ isActive }) => isActive ? 'active' : ''}>🗑 폐기 관리</NavLink>
          <div className="sidebar-section">분석 · 설정</div>
          <NavLink to="/analytics" className={({ isActive }) => isActive ? 'active' : ''}>📊 판매 분석</NavLink>
          <NavLink to="/users" className={({ isActive }) => isActive ? 'active' : ''}>👤 사용자 관리</NavLink>
        </nav>

        <SidebarFooter name={user?.name} />
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Stores />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/orders" element={<HQOrders />} />
          <Route path="/risks" element={<Risks />} />
          <Route path="/ingredients" element={<Ingredients />} />
          <Route path="/menus" element={<Menus />} />
          <Route path="/products" element={<Products />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/waste" element={<Waste />} />
          <Route path="/users" element={<Users />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      <StockAlert />
    </div>
  );
}

function StoreLayout() {
  const { user } = useAuth();
  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>🧾 포스모스</h1>
        <nav style={{ marginTop: 8 }}>
          <NavLink to="/store" end className={({ isActive }) => isActive ? 'active' : ''}>발주하기</NavLink>
          <NavLink to="/store/stock" className={({ isActive }) => isActive ? 'active' : ''}>재고 확인</NavLink>
          <NavLink to="/store/waste" className={({ isActive }) => isActive ? 'active' : ''}>폐기 입력</NavLink>
        </nav>
        <SidebarFooter name={user?.name} />
      </aside>
      <main className="main">
        <Routes>
          <Route path="/store" element={<StoreOrder />} />
          <Route path="/store/stock" element={<StoreStock />} />
          <Route path="/store/waste" element={<Waste />} />
          <Route path="*" element={<Navigate to="/store" />} />
        </Routes>
      </main>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text)', background: 'var(--bg)' }}>로딩 중...</div>;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;
  if (['STORE_OWNER', 'STORE_STAFF'].includes(user.role)) return <StoreLayout />;
  return (
    <StoreProvider>
      <HQLayout />
    </StoreProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
