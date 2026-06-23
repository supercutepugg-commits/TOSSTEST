import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
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
import PaymentResult from './pages/PaymentResult';
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

// 상단 탭 하나당 좌측 사이드바에 보일 세부 그룹. 키는 경로의 첫 segment ('/' 포함)
const SIDE_MENU_MAP = {
  '/': { title: '가맹점', items: [
    { to: '/', end: true, icon: '🏪', label: '가맹점 목록' },
  ] },
  '/dashboard': { title: '대시보드', items: [
    { to: '/dashboard', end: true, icon: '🏠', label: '대시보드 홈' },
  ] },
  '/analytics': { title: '매출분석', items: [
    { to: '/analytics', end: true, icon: '📊', label: '매출 분석' },
  ] },
  '/orders': { title: '주문관리', items: [
    { to: '/orders', end: true, icon: '✅', label: '주문 목록' },
  ] },
  '/products': { title: '매입발주', items: [
    { to: '/products', end: true, icon: '📦', label: '발주 상품' },
  ] },
  '/ingredients': { title: '재고관리', items: [
    { to: '/ingredients', end: true, icon: '🥬', label: '재료 목록' },
  ] },
  '/menus': { title: '메뉴관리', items: [
    { to: '/menus', end: true, icon: '🍽', label: '메뉴 & 레시피' },
  ] },
  '/waste': { title: '폐기관리', items: [
    { to: '/waste', end: true, icon: '🗑', label: '폐기 입력' },
  ] },
  '/risks': { title: '리스크', items: [
    { to: '/risks', end: true, icon: '⚠️', label: '리스크 알림' },
  ] },
  '/users': { title: '사용자', items: [
    { to: '/users', end: true, icon: '👤', label: '사용자 관리' },
  ] },
};

function SideMenu({ collapsed, onToggle, storeSelected }) {
  const location = useLocation();
  const topKey = '/' + (location.pathname.split('/')[1] || '');
  const group = SIDE_MENU_MAP[topKey];
  if (!group) return null;

  return (
    <aside className={'side-menu' + (collapsed ? ' collapsed' : '')}>
      <button className="side-menu-collapse" onClick={onToggle} title={collapsed ? '펼치기' : '접기'}>
        {collapsed ? '»' : '«'}
      </button>
      {!collapsed && (
        <div className="side-menu-group">
          <div className="side-menu-group-title">{group.title}</div>
          {group.items.map(item => (
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
      )}
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
      <div className="admin-back-bar">
        <NavLink to="/">← 관리자로 돌아가기</NavLink>
      </div>
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
            <Route path="/store/payment/:id/result" element={<PaymentResult />} />
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
