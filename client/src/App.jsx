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

function TopBar({ name, stores, currentStore, selectStore }) {
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  return (
    <div className="topbar-info">
      <div className="topbar-info-left">
        {stores && stores.length > 0 && (
          <select
            className="topbar-store-select"
            value={currentStore?.id || ''}
            onChange={e => { const s = stores.find(x => x.id === Number(e.target.value)); if (s) selectStore(s); }}
          >
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>
      <div className="topbar-info-right">
        <span className="topbar-user">{name} 님</span>
        <button className="topbar-link" onClick={toggle}>{theme === 'light' ? '🌙' : '☀️'}</button>
        <button className="topbar-link" onClick={logout}>로그아웃</button>
      </div>
    </div>
  );
}

function NavTab({ to, end, icon, label }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => 'topnav-tab' + (isActive ? ' active' : '')}>
      <span className="topnav-tab-icon">{icon}</span>
      <span className="topnav-tab-label">{label}</span>
    </NavLink>
  );
}

function HQLayout() {
  const { user } = useAuth();
  const { stores, currentStore, selectStore } = useStore();

  return (
    <div className="kicc-layout">
      <header className="topnav">
        <div className="topnav-brand">🧾 포스모스</div>
        <nav className="topnav-menu">
          <NavTab to="/" end icon="🏪" label="가맹점" />
          <NavTab to="/dashboard" icon="🏠" label="대시보드" />
          <NavTab to="/analytics" icon="📊" label="매출분석" />
          <NavTab to="/orders" icon="✅" label="주문관리" />
          <NavTab to="/products" icon="📦" label="매입발주" />
          <NavTab to="/ingredients" icon="🥬" label="재고관리" />
          <NavTab to="/menus" icon="🍽" label="메뉴관리" />
          <NavTab to="/waste" icon="🗑" label="폐기관리" />
          <NavTab to="/risks" icon="⚠️" label="리스크" />
          <NavTab to="/users" icon="👤" label="사용자" />
        </nav>
      </header>
      <TopBar name={user?.name} stores={stores} currentStore={currentStore} selectStore={selectStore} />
      <main className="kicc-main">
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
    <div className="kicc-layout">
      <header className="topnav">
        <div className="topnav-brand">🧾 포스모스</div>
        <nav className="topnav-menu">
          <NavTab to="/store" end icon="📋" label="발주하기" />
          <NavTab to="/store/stock" icon="🥬" label="재고 확인" />
          <NavTab to="/store/waste" icon="🗑" label="폐기 입력" />
        </nav>
      </header>
      <TopBar name={user?.name} />
      <main className="kicc-main">
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
