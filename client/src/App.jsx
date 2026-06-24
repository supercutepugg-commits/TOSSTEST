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
// storeRequired: false = 가맹점 선택과 무관하게 전체 브랜드 단위로 보는 메뉴 (선택 전 화면에 노출)
// storeRequired: true = 특정 가맹점 데이터를 보는 메뉴 (가맹점 선택 후 화면에 노출)
const SIDE_MENU_GROUPS = [
  { title: '가맹점 (전체)', storeRequired: false, items: [
    { to: '/', end: true, label: '가맹점 목록' },
    { to: '/rankings', end: true, label: '가맹점 순위' },
    { to: '/settlement', end: true, label: '정산 리포트' },
    { to: '/analytics', end: true, label: '매출 분석' },
    { to: '/purchase-anomalies', end: true, label: '사입 이상 모니터링' },
  ] },
  { title: '주문 · 발주 (전체)', storeRequired: false, items: [
    { to: '/orders', end: true, label: '주문 목록' },
    { to: '/products', end: true, label: '발주 상품' },
  ] },
  { title: '리스크 · 사용자 (전체)', storeRequired: false, items: [
    { to: '/risks', end: true, label: '리스크 알림' },
    { to: '/users', end: true, label: '사용자 관리' },
  ] },
  { title: '감사', storeRequired: false, hqAdminOnly: true, items: [
    { to: '/audit-log', end: true, label: '변경 이력' },
  ] },
  { title: '대시보드', storeRequired: true, items: [
    { to: '/dashboard', end: true, label: '대시보드 홈' },
  ] },
  { title: '재고 · 메뉴', storeRequired: true, items: [
    { to: '/ingredients', end: true, label: '재료 목록' },
    { to: '/menus', end: true, label: '메뉴 & 레시피' },
    { to: '/waste', end: true, label: '폐기 내역' },
  ] },
];

function SideMenu({ collapsed, onToggle, storeSelected, isHqAdmin }) {
  const location = useLocation();
  const visibleGroups = SIDE_MENU_GROUPS.filter(g => (!g.hqAdminOnly || isHqAdmin) && g.storeRequired === storeSelected);

  const [openGroups, setOpenGroups] = useState(() => {
    const saved = localStorage.getItem('sideMenuOpenGroups');
    if (saved) {
      try { return new Set(JSON.parse(saved)); } catch { /* fall through */ }
    }
    const activeGroup = SIDE_MENU_GROUPS.find(g => g.items.some(i => i.to === location.pathname));
    return new Set(activeGroup ? [activeGroup.title] : [SIDE_MENU_GROUPS[0].title]);
  });

  const toggleGroup = (title) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      localStorage.setItem('sideMenuOpenGroups', JSON.stringify([...next]));
      return next;
    });
  };

  return (
    <aside className={'side-menu' + (collapsed ? ' collapsed' : '')}>
      <button className="side-menu-collapse" onClick={onToggle} title={collapsed ? '펼치기' : '접기'}>
        {collapsed ? '»' : '«'}
      </button>
      {!collapsed && visibleGroups.map(group => {
        const isOpen = openGroups.has(group.title);
        return (
          <div key={group.title} className={'side-menu-group' + (isOpen ? ' open' : '')}>
            <button className="side-menu-group-title" onClick={() => toggleGroup(group.title)}>
              <span>{group.title}</span>
            </button>
            {isOpen && (
              <div className="side-menu-group-items">
                {group.items.map(item => (
                  <NavLink key={item.to} to={item.to} end={item.end}
                    className={({ isActive }) => 'side-menu-item' + (isActive ? ' active' : '')}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}

function HQLayout() {
  const { user } = useAuth();
  const { currentStore, clearStore } = useStore();
  const storeSelected = !!currentStore;
  const isHqAdmin = ['SUPER_ADMIN', 'HQ_ADMIN'].includes(user?.role);
  const [collapsed, setCollapsed] = useState(false);

  // 가맹점 선택 여부에 따라 상단 탭도 좌측 메뉴와 동일한 기준으로 보여줄 메뉴를 가른다
  const visibleTabs = SIDE_MENU_GROUPS
    .filter(g => (!g.hqAdminOnly || isHqAdmin) && g.storeRequired === storeSelected)
    .flatMap(g => g.items);

  return (
    <div className="kicc-layout">
      {storeSelected && (
        <div className="admin-back-bar">
          <NavLink to="/" onClick={clearStore}>관리자로 돌아가기 (가맹점 선택 해제)</NavLink>
        </div>
      )}
      <header className="topnav">
        <div className="topnav-brand">포스모스</div>
        <nav className="topnav-menu">
          {visibleTabs.map(item => (
            <NavTab key={item.to} to={item.to} end={item.end} label={item.label} />
          ))}
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
      <StockAlert storeId={currentStore?.id} storeName={currentStore?.name} />
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
      <StockAlert storeId={user?.store_id} storeName={user?.store_name} />
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
