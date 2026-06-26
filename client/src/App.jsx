import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { StoreProvider, useStore } from './StoreContext';
import { ThemeProvider, useTheme } from './ThemeContext';
import { api } from './api';
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
import Notices from './pages/Notices';
import StockAdjustment from './pages/StockAdjustment';
import StockLedger from './pages/StockLedger';
import Products from './pages/Products';
import Analytics from './pages/Analytics';
import StoreRankings from './pages/StoreRankings';
import Settlement from './pages/Settlement';
import PurchaseAnomalies from './pages/PurchaseAnomalies';
import AuditLog from './pages/AuditLog';
import OrderInvoice from './pages/OrderInvoice';
import MyTasks from './pages/MyTasks';
import Login from './pages/Login';
import StockAlert from './components/StockAlert';
import NoticeBanner from './components/NoticeBanner';
import OrderAttentionBanner from './components/OrderAttentionBanner';
import ToastHost from './components/ToastHost';

function TopBar({ name, currentStore, onBackToAdmin }) {
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  return (
    <div className="topbar-info">
      <div className="topbar-info-left">
        {currentStore && <span className="topbar-current-store">{currentStore.name}</span>}
        {onBackToAdmin && (
          <button className="topbar-link" onClick={onBackToAdmin}>관리자로 돌아가기</button>
        )}
      </div>
      <div className="topbar-info-right">
        <span className="topbar-user">{name} 님</span>
        <button className="topbar-link" onClick={toggle}>{theme === 'light' ? '다크 모드' : '라이트 모드'}</button>
        <button className="topbar-link" onClick={logout}>로그아웃</button>
      </div>
    </div>
  );
}

function NavTab({ to, end, label, count }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => 'topnav-tab' + (isActive ? ' active' : '')}>
      <span className="topnav-tab-label">{label}</span>
      {count > 0 && <span className="nav-badge">{count > 99 ? '99+' : count}</span>}
    </NavLink>
  );
}

// 관리자 페이지 메뉴 — 가맹점 선택 없이도 쓸 수 있는 그룹과, 특정 가맹점을 선택해야 의미가 있는 그룹으로 구분
// storeRequired: false = 가맹점 선택과 무관하게 전체 브랜드 단위로 보는 메뉴 (선택 전 화면에 노출)
// storeRequired: true = 특정 가맹점 데이터를 보는 메뉴 (가맹점 선택 후 화면에 노출)
// 그룹(title)이 상단 탭의 대분류가 되고, 그 안의 items가 좌측 메뉴의 세부 항목이 된다 —
// 예전에는 상단/좌측에 같은 항목이 그대로 중복 노출돼서 둘이 다른 역할을 하지 못했음
const SIDE_MENU_GROUPS = [
  { title: '가맹점', storeRequired: false, items: [
    { to: '/', end: true, label: '가맹점 목록' },
    { to: '/rankings', end: true, label: '가맹점 순위' },
    { to: '/settlement', end: true, label: '정산 리포트' },
    { to: '/analytics', end: true, label: '매출 분석' },
    { to: '/purchase-anomalies', end: true, label: '사입 이상 모니터링' },
  ] },
  { title: '주문 · 발주', storeRequired: false, items: [
    { to: '/orders', end: true, label: '주문 목록' },
    { to: '/products', end: true, label: '발주 상품' },
  ] },
  { title: '리스크 · 사용자', storeRequired: false, items: [
    { to: '/my-tasks', end: true, label: '내 업무' },
    { to: '/risks', end: true, label: '리스크 알림' },
    { to: '/notices', end: true, label: '공지사항' },
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
    { to: '/stock-adjustments', end: true, label: '실사 재고 조정' },
    { to: '/stock-ledger', end: true, label: '상품별 거래 수불' },
  ] },
];

// 현재 경로가 해당 그룹에 속하는지 — 정확히 일치하거나, 그 하위 경로(/orders/5/invoice 같은)인 경우도 포함
function pathInGroup(pathname, group) {
  return group.items.some(item => pathname === item.to || (item.to !== '/' && pathname.startsWith(item.to + '/')));
}

function SideMenu({ collapsed, onToggle, activeGroup, badgeCounts }) {
  if (!activeGroup) return null;
  return (
    <aside className={'side-menu' + (collapsed ? ' collapsed' : '')}>
      <button className="side-menu-collapse" onClick={onToggle} title={collapsed ? '펼치기' : '접기'}>
        {collapsed ? '»' : '«'}
      </button>
      {!collapsed && (
        <div className="side-menu-group open">
          <div className="side-menu-section-title">{activeGroup.title}</div>
          <div className="side-menu-group-items">
            {activeGroup.items.map(item => (
              <NavLink key={item.to} to={item.to} end={item.end}
                className={({ isActive }) => 'side-menu-item' + (isActive ? ' active' : '')}>
                <span>{item.label}</span>
                {badgeCounts?.[item.to] > 0 && (
                  <span className="nav-badge">{badgeCounts[item.to] > 99 ? '99+' : badgeCounts[item.to]}</span>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function HQLayout() {
  const { user } = useAuth();
  const { currentStore, clearStore } = useStore();
  const storeSelected = !!currentStore;
  const isHqAdmin = ['SUPER_ADMIN', 'HQ_ADMIN'].includes(user?.role);
  const [collapsed, setCollapsed] = useState(false);
  const [openRiskCount, setOpenRiskCount] = useState(0);
  const [myTaskCount, setMyTaskCount] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  // 미확인 리스크 개수를 메뉴에 배지로 표시 — 1분마다 갱신
  useEffect(() => {
    const load = () => api.getRisks({ status: 'OPEN' }).then(rows => setOpenRiskCount(rows.length)).catch(() => {});
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  // 담당 가맹점의 처리할 일 개수도 리스크와 같은 방식으로 배지 표시 — 안 들어가보면 일이 있는지조차 몰랐던 문제
  useEffect(() => {
    const load = () => api.getMyTasks().then(data => {
      const total = (data.stores || []).reduce((s, st) => s + st.pendingReview + st.needsAttention + st.openRisks + (st.receiptIssues || 0), 0);
      setMyTaskCount(total);
    }).catch(() => {});
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const badgeCounts = { '/risks': openRiskCount, '/my-tasks': myTaskCount };

  // 가맹점 선택 여부에 따라 상단 탭도 좌측 메뉴와 동일한 기준으로 보여줄 그룹을 가른다.
  // 상단 탭은 대분류(그룹)만, 좌측 메뉴는 그 안의 세부 항목만 보여줘서 같은 메뉴가 두 번 나오지 않게 한다
  const visibleGroups = SIDE_MENU_GROUPS.filter(g => (!g.hqAdminOnly || isHqAdmin) && g.storeRequired === storeSelected);
  const activeGroup = visibleGroups.find(g => pathInGroup(location.pathname, g)) || visibleGroups[0];

  const backToAdmin = () => { clearStore(); navigate('/'); };

  return (
    <div className="kicc-layout">
      <header className="topnav">
        <div className="topnav-brand">포스모스</div>
        <nav className="topnav-menu">
          {visibleGroups.map(group => {
            const groupBadge = group.items.reduce((s, i) => s + (badgeCounts[i.to] || 0), 0);
            return (
              <button key={group.title}
                className={'topnav-tab' + (group === activeGroup ? ' active' : '')}
                onClick={() => navigate(group.items[0].to)}>
                <span className="topnav-tab-label">{group.title}</span>
                {groupBadge > 0 && <span className="nav-badge">{groupBadge > 99 ? '99+' : groupBadge}</span>}
              </button>
            );
          })}
        </nav>
      </header>
      <TopBar name={user?.name} currentStore={currentStore} onBackToAdmin={storeSelected ? backToAdmin : null} />
      <div className="kicc-body">
        <SideMenu collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} activeGroup={activeGroup} badgeCounts={badgeCounts} />
        <main className="kicc-main">
          <div className="kicc-main-inner">
            <Routes>
              <Route path="/" element={<Stores />} />
              <Route path="/rankings" element={<StoreRankings />} />
              <Route path="/settlement" element={<Settlement />} />
              <Route path="/purchase-anomalies" element={<PurchaseAnomalies />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/orders" element={<HQOrders />} />
              <Route path="/orders/:id/invoice" element={<OrderInvoice />} />
              <Route path="/risks" element={<Risks />} />
              <Route path="/my-tasks" element={<MyTasks />} />
              <Route path="/notices" element={<Notices />} />
              <Route path="/ingredients" element={<Ingredients />} />
              <Route path="/menus" element={<Menus />} />
              <Route path="/products" element={<Products />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/waste" element={<Waste />} />
              <Route path="/stock-adjustments" element={<StockAdjustment />} />
              <Route path="/stock-ledger" element={<StockLedger />} />
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
          <NavTab to="/store/stock-adjustments" label="실사 재고 조정" />
        </nav>
      </header>
      <TopBar name={user?.name} />
      <main className="kicc-main">
        <div className="kicc-main-inner">
          <Routes>
            <Route path="/store" element={<StoreOrder />} />
            <Route path="/store/orders/:id/invoice" element={<OrderInvoice />} />
            <Route path="/store/payment/:id/result" element={<PaymentResult />} />
            <Route path="/store/stock" element={<StoreStock />} />
            <Route path="/store/waste" element={<Waste />} />
            <Route path="/store/stock-adjustments" element={<StockAdjustment />} />
            <Route path="*" element={<Navigate to="/store" />} />
          </Routes>
        </div>
      </main>
      <StockAlert storeId={user?.store_id} storeName={user?.store_name} />
      <NoticeBanner storeId={user?.store_id} />
      <OrderAttentionBanner storeId={user?.store_id} />
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
