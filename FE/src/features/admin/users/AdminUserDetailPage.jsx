import { Link,useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/useAuth.js';
import { StatusPanel } from '../../../components/StatusPanel.jsx';
import { getAdminUser } from './api.js';
import { UserStatusDialog } from './UserStatusDialog.jsx';
export function AdminUserDetailPage(){const {userId}=useParams();return <UserDetail key={userId} userId={userId}/>;}
function UserDetail({userId}){
 const {data:auth}=useAuth();const valid=/^[1-9][0-9]{0,19}$/.test(userId);
 const detail=useQuery({queryKey:['admin','users','detail',auth.user.id,userId],enabled:valid,retry:false,queryFn:({signal})=>getAdminUser(userId,signal)});
 if(!valid)return <StatusPanel title="ID người dùng không hợp lệ"><Link to="/admin/users">Về danh sách</Link></StatusPanel>;
 if(detail.isPending)return <StatusPanel title="Đang tải tài khoản…"/>;
 if(detail.isError)return <StatusPanel title={detail.error.status===404 ? 'Không tìm thấy người dùng' : 'Không thể tải tài khoản'} retry={detail.error.status===404 ? undefined : ()=>detail.refetch()}><p>{detail.error.message}</p><Link to="/admin/users">Về danh sách</Link></StatusPanel>;
 const user=detail.data;
 return <section className="admin-users-page"><Link to="/admin/users">← Người dùng</Link><h1>{user.fullName}</h1><dl className="admin-user-info"><dt>Email</dt><dd>{user.email}</dd><dt>Vai trò</dt><dd>{user.role==='admin' ? 'Quản trị viên' : 'Sinh viên'}</dd><dt>Trạng thái</dt><dd>{user.status==='active' ? 'Hoạt động' : 'Đã khóa'}</dd><dt>Ngày tạo</dt><dd>{new Date(user.createdAt).toLocaleString('vi-VN')}</dd><dt>Cập nhật</dt><dd>{new Date(user.updatedAt).toLocaleString('vi-VN')}</dd></dl><UserStatusDialog user={user}/></section>;
}
