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
import PaymentResult from './pages/PaymentResult';
import StoreStock from './pages/StoreStock';
import Waste from './pages/Waste';
import Risks from './pages/Risks';
import Products from './pages/Products';
import Analytics from './pages/Analytics';
import StoreRankings from './pages/StoreRankings';
import PurchaseAnomalies from './pages/PurchaseAnomalies';
import Login from './pages/Login';
import StockAlert from './components/StockAlert';

function TopBar({ name, currentStore }) {
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  return (
    <div className="topbar-info">
      <div className="topbar-info-left">
        {currentStore && <span className="topbar-current-store">🏪 {currentStore.name}</span>}
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

// 관리자 페이지 메뉴 — 가맹점 선택 없이도 쓸 수 있는 그룹과, 특정 가맹점을 선택해야 의미가 있는 그룹으로 구분
// (storeRequired: true 항목은 가맹점 미선택 시에도 클릭은 가능하지만, 각 페이지가 "가맹점을 선택해주세요" 안내를 보여줌)
const SIDE_MENU_GROUPS = [
  { title: '가맹점 (전체)', storeRequired: false, items: [
    { to: '/', end: true, icon: '🏪', label: '가맹점 목록' },
    { to: '/rankings', end: true, icon: '🏆', label: '가맹점 순위' },
    { to: '/purchase-anomalies', end: true, icon: '🔍', label: '사입 이상 모니터링' },
  ] },
  { title: '대시보드 · 매출', storeRequired: true, items: [
    { to: '/dashboard', end: true, icon: '🏠', label: '대시보드 홈' },
    { to: '/analytics', end: true, icon: '📊', label: '매출 분석' },
  ] },
  { title: '주문 · 발주', storeRequired: true, items: [
    { to: '/orders', end: true, icon: '✅', label: '주문 목록' },
    { to: '/products', end: true, icon: '📦', label: '발주 상품' },
  ] },
  { title: '재고 · 메뉴', storeRequired: true, items: [
    { to: '/ingredients', end: true, icon: '🥬', label: '재료 목록' },
    { to: '/menus', end: true, icon: '🍽', label: '메뉴 & 레시피' },
    { to: '/waste', end: true, icon: '🗑', label: '폐기 입력' },
  ] },
  { title: '리스크', storeRequired: true, items: [
    { to: '/risks', end: true, icon: '⚠️', label: '리스크 알림' },
  ] },
  { title: '사용자', storeRequired: true, items: [
    { to: '/users', end: true, icon: '👤', label: '사용자 관리' },
  ] },
];

function SideMenu({ collapsed, onToggle, storeSelected }) {
  return (
    <aside className={'side-menu' + (collapsed ? ' collapsed' : '')}>
      <button className="side-menu-collapse" onClick={onToggle} title={collapsed ? '펼치기' : '접기'}>
        {collapsed ? '»' : '«'}
      </button>
      {!collapsed && SIDE_MENU_GROUPS.map(group => (
        <div key={group.title} className="side-menu-group">
          <div className="side-menu-group-title">
            {group.title}
            {group.storeRequired && !storeSelected && (
              <span style={{ marginLeft: 6, fontSize: 10, color: '#f59e0b', fontWeight: 400 }} title="가맹점을 먼저 선택해주세요">
                가맹점 선택 필요
              </span>
            )}
          </div>
          {group.items.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => 'side-menu-item' + (isActive ? ' active' : '')}>
              <span className="side-menu-item-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </aside>
  );
}

function HQLayout() {
  const { user } = useAuth();
  const { currentStore } = useStore();
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
          {/* 가맹점 선택 없이도 쓸 수 있는 메뉴 */}
          <NavTab to="/" end icon="🏪" label="가맹점" />
          <NavTab to="/rankings" icon="🏆" label="가맹점순위" />
          <NavTab to="/purchase-anomalies" icon="🔍" label="사입이상모니터링" />
          <span style={{ width: 1, alignSelf: 'stretch', margin: '0 8px', background: 'var(--border)' }} />
          {/* 특정 가맹점을 선택해야 의미가 있는 메뉴 */}
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
      <TopBar name={user?.name} currentStore={currentStore} />
      <div className="kicc-body">
        <SideMenu collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} storeSelected={storeSelected} />
        <main className="kicc-main">
          <div className="kicc-main-inner">
            <Routes>
              <Route path="/" element={<Stores />} />
              <Route path="/rankings" element={<StoreRankings />} />
              <Route path="/purchase-anomalies" element={<PurchaseAnomalies />} />
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
