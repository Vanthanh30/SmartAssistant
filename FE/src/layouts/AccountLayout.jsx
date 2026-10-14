import { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, BookOpen, History, UserRound, Users, Files, LogOut, PanelLeftClose, PanelLeftOpen, Menu, X, ChevronRight, ChevronDown } from 'lucide-react';
import { Brand } from '../components/Brand.jsx';
import { Avatar } from '../features/profile/Avatar.jsx';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { logout } from '../features/auth/api.js';
import { sessionKey, useAuth } from '../features/auth/useAuth.js';
export function AccountLayout({ role }) {
  const { data } = useAuth();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 850px)').matches);
  const sidebar = useRef(null);
  const menuTrigger = useRef(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 850px)');
    const update = event => setIsMobile(event.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!mobileOpen || !isMobile) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = menuTrigger.current;
    document.body.style.overflow = 'hidden';
    const controls = () => [...sidebar.current.querySelectorAll('a[href],button:not(:disabled)')].filter(element => element.getClientRects().length);
    controls()[0]?.focus();
    const keyboard = event => {
      if (event.key === 'Escape') setMobileOpen(false);
      if (event.key !== 'Tab') return;
      const elements = controls(); const first = elements[0]; const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keyboard); trigger?.focus(); };
  }, [mobileOpen, isMobile]);
  const items = role === 'admin' ? [
    { to: '/admin/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { to: '/admin/users', label: 'Người dùng', icon: Users },
    { to: '/admin/documents', label: 'Tài liệu hệ thống', icon: Files },
  ] : [
    { to: '/app/courses', label: 'Môn học của tôi', icon: BookOpen },
    { to: '/app/history', label: 'Lịch sử hỏi đáp', icon: History },
    { to: '/app/profile', label: 'Hồ sơ cá nhân', icon: UserRound },
  ];
  const current = items.find(item => pathname.startsWith(item.to));
  const title = pathname.startsWith('/app/learning/') ? 'Quiz & flashcard' : current?.label ?? 'Không gian học tập';
  const detail = current && pathname !== current.to;
  const mutation = useMutation({ mutationFn: () => logout(data.csrfToken),
    onSuccess: async () => {
      await client.cancelQueries(); client.setQueryData(sessionKey, null);
      client.removeQueries({ predicate: query => query.queryKey[0] !== 'auth' });
      navigate(role === 'admin' ? '/admin/login' : '/login', { replace: true });
    } });
  const signOut = () => { if (!mutation.isPending) mutation.mutate(); };
  return <div className={`account ${collapsed ? 'sidebar-collapsed' : ''}`}>
    <a className="skip-link" href="#main-content">Đến nội dung chính</a>
    {mobileOpen && <button className="sidebar-backdrop" aria-label="Đóng điều hướng" onClick={() => setMobileOpen(false)}/>}
    <aside ref={sidebar} id="account-sidebar" className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Thanh điều hướng" inert={isMobile && !mobileOpen}>
      <div className="sidebar-brand"><Brand compact={collapsed}/><button className="icon-button mobile-close" aria-label="Đóng điều hướng" onClick={() => setMobileOpen(false)}><X size={20}/></button></div>
      <p className="nav-caption">{role === 'admin' ? 'QUẢN TRỊ HỆ THỐNG' : 'KHÔNG GIAN CỦA BẠN'}</p>
      <nav aria-label={role === 'admin' ? 'Điều hướng quản trị' : 'Điều hướng sinh viên'}>{items.map(item => <NavLink key={item.to} to={item.to} title={collapsed ? item.label : undefined} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><item.icon size={20} aria-hidden="true"/><span>{item.label}</span></NavLink>)}</nav>
      <div className="sidebar-bottom">
        {!collapsed && role === 'student' && <div className="sidebar-note"><BookOpen size={20} aria-hidden="true"/><strong>Học từ nguồn của bạn</strong><p>PDF, hỏi đáp, quiz và flashcard trong từng môn học.</p></div>}
        <button className="nav-item logout-button" disabled={mutation.isPending} onClick={signOut} title={collapsed ? 'Đăng xuất' : undefined}><LogOut size={20} aria-hidden="true"/><span>{mutation.isPending ? 'Đang đăng xuất…' : 'Đăng xuất'}</span></button>
        <button className="sidebar-toggle" aria-label={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? <PanelLeftOpen size={20}/> : <><PanelLeftClose size={20}/><span>Thu gọn</span></>}</button>
      </div>
    </aside>
    <div className="account-body"><header className="app-header">
      <button ref={menuTrigger} className="icon-button mobile-menu" aria-label="Mở điều hướng" aria-controls="account-sidebar" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu size={22}/></button>
      <div className="header-context"><nav className="breadcrumbs" aria-label="Đường dẫn"><span>{role === 'admin' ? 'Quản trị' : 'Không gian học tập'}</span><ChevronRight size={14} aria-hidden="true"/>{detail ? <><Link to={current.to}>{title}</Link><ChevronRight size={14} aria-hidden="true"/><span>Chi tiết</span></> : <span aria-current="page">{title}</span>}</nav><strong>{detail ? 'Chi tiết' : title}</strong></div>
      {data?.user && <details className="account-menu"><summary><span className="header-avatar">{role === 'student' ? <Avatar user={data.user}/> : <span className="avatar avatar-fallback">{[...data.user.fullName][0]}</span>}</span><span className="account-identity"><strong>{data.user.fullName}</strong><small>{role === 'admin' ? 'Quản trị viên' : 'Sinh viên'}</small></span><ChevronDown size={16} aria-hidden="true"/></summary><div className="account-dropdown"><p>{data.user.email}</p>{role === 'student' && <Link to="/app/profile"><UserRound size={16}/>Hồ sơ cá nhân</Link>}<button disabled={mutation.isPending} onClick={signOut}><LogOut size={16}/>{mutation.isPending ? 'Đang đăng xuất…' : 'Đăng xuất'}</button></div></details>}
    </header><main id="main-content" tabIndex={-1}>{mutation.isError && <p role="alert" className="field-error">{mutation.error.message}</p>}<Outlet/></main></div>
  </div>;
}
