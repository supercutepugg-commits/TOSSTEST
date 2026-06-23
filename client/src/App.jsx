import { useState } from 'react';
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

function NavTab({ to, end, icon, label, disabled }) {
  if (disabled) {
    return (
      <span className="topnav-tab disabled" title="가맹점을 먼저 선택해주세요">
        <span className="topnav-tab-icon">{icon}</span>
        <span className="topnav-tab-label">{label}</span>
      </span>
    );
  }
  return (
    <NavLink to={to} end={end} className={({ isActive }) => 'topnav-tab' + (isActive ? ' active' : '')}>
      <span className="topnav-tab-icon">{icon}</span>
      <span className="topnav-tab-label">{label}</span>
    </NavLink>
  );
}

const SIDE_GROUPS = [
  { title: '운영', items: [
    { to: '/', end: true, icon: '🏪', label: '가맹점 선택' },
    { to: '/dashboard', icon: '🏠', label: '대시보드' },
  ] },
  { title: '발주 · 주문', items: [
    { to: '/orders', icon: '✅', label: '주문 관리' },
    { to: '/products', icon: '📦', label: '매입 발주' },
  ] },
  { title: '재고 · 메뉴', items: [
    { to: '/ingredients', icon: '🥬', label: '재고 관리' },
    { to: '/menus', icon: '🍽', label: '메뉴 관리' },
    { to: '/waste', icon: '🗑', label: '폐기 관리' },
  ] },
  { title: '분석 · 관리', items: [
    { to: '/analytics', icon: '📊', label: '매출 분석' },
    { to: '/risks', icon: '⚠️', label: '리스크 알림' },
    { to: '/users', icon: '👤', label: '사용자 관리' },
  ] },
];

function SideMenu({ collapsed, onToggle, storeSelected }) {
  return (
    <aside className={'side-menu' + (collapsed ? ' collapsed' : '')}>
      <button className="side-menu-collapse" onClick={onToggle} title={collapsed ? '펼치기' : '접기'}>
        {collapsed ? '»' : '«'}
      </button>
      {!collapsed && SIDE_GROUPS.map(g => (
        <div key={g.title} className="side-menu-group">
          <div className="side-menu-group-title">{g.title}</div>
          {g.items.map(item => (
            storeSelected || item.to === '/' ? (
              <NavLink key={item.to} to={item.to} end={item.end}
                className={({ isActive }) => 'side-menu-item' + (isActive ? ' active' : '')}>
                <span className="side-menu-item-icon">{item.icon}</span>
                {item.label}
              </NavLink>
            ) : (
              <span key={item.to} className="side-menu-item disabled" title="가맹점을 먼저 선택해주세요">
                <span className="side-menu-item-icon">{item.icon}</span>
                {item.label}
              </span>
            )
          ))}
        </div>
      ))}
    </aside>
  );
}

function HQLayout() {
  const { user } = useAuth();
  const { stores, currentStore, selectStore } = useStore();
  const storeSelected = !!currentStore;
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="kicc-layout">
      <header className="topnav">
        <div className="topnav-brand">🧾 포스모스</div>
        <nav className="topnav-menu">
          <NavTab to="/" end icon="🏪" label="가맹점" />
          <NavTab to="/dashboard" icon="🏠" label="대시보드" disabled={!storeSelected} />
          <NavTab to="/analytics" icon="📊" label="매출분석" disabled={!storeSelected} />
          <NavTab to="/orders" icon="✅" label="주문관리" disabled={!storeSelected} />
          <NavTab to="/products" icon="📦" label="매입발주" disabled={!storeSelected} />
          <NavTab to="/ingredients" icon="🥬" label="재고관리" disabled={!storeSelected} />
          <NavTab to="/menus" icon="🍽" label="메뉴관리" disabled={!storeSelected} />
          <NavTab to="/waste" icon="🗑" label="폐기관리" disabled={!storeSelected} />
          <NavTab to="/risks" icon="⚠️" label="리스크" disabled={!storeSelected} />
          <NavTab to="/users" icon="👤" label="사용자" disabled={!storeSelected} />
        </nav>
      </header>
      <TopBar name={user?.name} stores={stores} currentStore={currentStore} selectStore={selectStore} />
      <div className="kicc-body">
        <SideMenu collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} storeSelected={storeSelected} />
        <main className="kicc-main">
          <div className="kicc-main-inner">
            <Routes>
              <Route path="/" element={<Stores />} />
              {storeSelected ? (
                <>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/orders" element={<HQOrders />} />
                  <Route path="/risks" element={<Risks />} />
                  <Route path="/ingredients" element={<Ingredients />} />
                  <Route path="/menus" element={<Menus />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/waste" element={<Waste />} />
                  <Route path="/users" element={<Users />} />
                </>
              ) : null}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
        </main>
      </div>
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
        <div className="kicc-main-inner">
          <Routes>
            <Route path="/store" element={<StoreOrder />} />
            <Route path="/store/stock" element={<StoreStock />} />
            <Route path="/store/waste" element={<Waste />} />
            <Route path="*" element={<Navigate to="/store" />} />
          </Routes>
        </div>
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
