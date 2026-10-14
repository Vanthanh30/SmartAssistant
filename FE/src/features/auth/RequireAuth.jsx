import { Navigate, Outlet, Link } from 'react-router-dom';
import { useAuth } from './useAuth.js';
import { StatusPanel } from '../../components/StatusPanel.jsx';
export function RequireAuth({ role }) {
  const auth = useAuth();
  const loginPath = role === 'admin' ? '/admin/login' : '/login';
  if (auth.isPending) return <StatusPanel title="Đang kiểm tra phiên…"/>;
  if (auth.isError) return <StatusPanel title="Không thể kiểm tra phiên" retry={() => auth.refetch()}><p>{auth.error.message}</p><Link to={loginPath}>Đăng nhập</Link></StatusPanel>;
  if (!auth.data?.user) return <Navigate to={loginPath} replace/>;
  if (auth.data.user.role !== role) return <StatusPanel title="Bạn không có quyền truy cập"><Link to={auth.data.user.role === 'admin' ? '/admin/dashboard' : '/app/courses'}>Về không gian của tôi</Link></StatusPanel>;
  return <Outlet/>;
}
