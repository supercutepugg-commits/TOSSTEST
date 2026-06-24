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
import Settlement from './pages/Settlement';
import PurchaseAnomalies from './pages/PurchaseAnomalies';
import AuditLog from './pages/AuditLog';
import Login from './pages/Login';
import StockAlert from './components/StockAlert';
import ToastHost from './components/ToastHost';

function TopBar({ name, currentStore }) {
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  return (
    <div className="topbar-info">
      <div className="topbar-info-left">
        {currentStore && <span className="topbar-current-store">{currentStore.name}</span>}
      </div>
      <div className="topbar-info-right">
        <span className="topbar-user">{name} 님</span>
        <button className="topbar-link" onClick={toggle}>{theme === 'light' ? '다크 모드' : '라이트 모드'}</button>
        <button className="topbar-link" onClick={logout}>로그아웃</button>
      </div>
    </div>
  );
}

function NavTab({ to, end, label }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => 'topnav-tab' + (isActive ? ' active' : '')}>
      <span className="topnav-tab-label">{label}</span>
    </NavLink>
  );
}

// 관리자 페이지 메뉴 — 가맹점 선택 없이도 쓸 수 있는 그룹과, 특정 가맹점을 선택해야 의미가 있는 그룹으로 구분
// (storeRequired: true 항목은 가맹점 미선택 시에도 클릭은 가능하지만, 각 페이지가 "가맹점을 선택해주세요" 안내를 보여줌)
const SIDE_MENU_GROUPS = [
  { title: '가맹점 (전체)', storeRequired: false, items: [
    { to: '/', end: true, label: '가맹점 목록' },
    { to: '/rankings', end: true, label: '가맹점 순위' },
    { to: '/settlement', end: true, label: '정산 리포트' },
    { to: '/purchase-anomalies', end: true, label: '사입 이상 모니터링' },
  ] },
  { title: '대시보드 · 매출', storeRequired: true, items: [
    { to: '/dashboard', end: true, label: '대시보드 홈' },
    { to: '/analytics', end: true, label: '매출 분석' },
  ] },
  { title: '주문 · 발주', storeRequired: true, items: [
    { to: '/orders', end: true, label: '주문 목록' },
    { to: '/products', end: true, label: '발주 상품' },
  ] },
  { title: '재고 · 메뉴', storeRequired: true, items: [
    { to: '/ingredients', end: true, label: '재료 목록' },
    { to: '/menus', end: true, label: '메뉴 & 레시피' },
    { to: '/waste', end: true, label: '폐기 내역' },
  ] },
  { title: '리스크', storeRequired: true, items: [
    { to: '/risks', end: true, label: '리스크 알림' },
  ] },
  { title: '사용자', storeRequired: true, items: [
    { to: '/users', end: true, label: '사용자 관리' },
  ] },
  { title: '감사', storeRequired: false, hqAdminOnly: true, items: [
    { to: '/audit-log', end: true, label: '변경 이력' },
  ] },
];

function SideMenu({ collapsed, onToggle, storeSelected, isHqAdmin }) {
  const visibleGroups = SIDE_MENU_GROUPS.filter(g => !g.hqAdminOnly || isHqAdmin);
  return (
    <aside className={'side-menu' + (collapsed ? ' collapsed' : '')}>
      <button className="side-menu-collapse" onClick={onToggle} title={collapsed ? '펼치기' : '접기'}>
        {collapsed ? '»' : '«'}
      </button>
      {!collapsed && visibleGroups.map(group => (
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
  const isHqAdmin = ['SUPER_ADMIN', 'HQ_ADMIN'].includes(user?.role);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="kicc-layout">
      <div className="admin-back-bar">
        <NavLink to="/">관리자로 돌아가기</NavLink>
      </div>
      <header className="topnav">
        <div className="topnav-brand">포스모스</div>
        <nav className="topnav-menu">
          {/* 가맹점 선택 없이도 쓸 수 있는 메뉴 */}
          <NavTab to="/" end label="가맹점" />
          <NavTab to="/rankings" label="가맹점순위" />
          <NavTab to="/settlement" label="정산리포트" />
          <NavTab to="/purchase-anomalies" label="사입이상모니터링" />
          <span style={{ width: 1, alignSelf: 'stretch', margin: '0 8px', background: 'var(--border)' }} />
          {/* 특정 가맹점을 선택해야 의미가 있는 메뉴 */}
          <NavTab to="/dashboard" label="대시보드" />
          <NavTab to="/analytics" label="매출분석" />
          <NavTab to="/orders" label="주문관리" />
          <NavTab to="/products" label="매입발주" />
          <NavTab to="/ingredients" label="재고관리" />
          <NavTab to="/menus" label="메뉴관리" />
          <NavTab to="/waste" label="폐기 내역" />
          <NavTab to="/risks" label="리스크" />
          <NavTab to="/users" label="사용자" />
          {isHqAdmin && <NavTab to="/audit-log" label="변경 이력" />}
        </nav>
      </header>
      <TopBar name={user?.name} currentStore={currentStore} />
      <div className="kicc-body">
        <SideMenu collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} storeSelected={storeSelected} isHqAdmin={isHqAdmin} />
        <main className="kicc-main">
          <div className="kicc-main-inner">
            <Routes>
              <Route path="/" element={<Stores />} />
              <Route path="/rankings" element={<StoreRankings />} />
              <Route path="/settlement" element={<Settlement />} />
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
              {isHqAdmin && <Route path="/audit-log" element={<AuditLog />} />}
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
        <div className="topnav-brand">포스모스</div>
        <nav className="topnav-menu">
          <NavTab to="/store" end label="발주하기" />
          <NavTab to="/store/stock" label="재고 확인" />
          <NavTab to="/store/waste" label="폐기 입력" />
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
          <ToastHost />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
