import { Users } from 'lucide-react';
import { SectionHeading } from '../../../components/SectionHeading.jsx';
import { useEffect,useState } from 'react';
import { Link,useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/useAuth.js';
import { StatusPanel } from '../../../components/StatusPanel.jsx';
import { EmptyState } from '../../../components/EmptyState.jsx';
import { listAdminUsers } from './api.js';
import { UserStatusDialog } from './UserStatusDialog.jsx';
export function AdminUsersPage(){
 const {data:auth}=useAuth();const [params,setParams]=useSearchParams();const [notice,setNotice]=useState('');
 const q=params.get('q')||'';const status=params.get('status')||'';const pageText=params.get('page')||'1';const page=Number(pageText);
 const [draft,setDraft]=useState({query:q,text:q});if(draft.query!==q)setDraft({query:q,text:q});const search=draft.query===q?draft.text:q;const setSearch=value=>setDraft({query:q,text:value});
 const valid=['','active','blocked'].includes(status) && [...q].length<=150 && /^\d+$/.test(pageText) && page>=1 && page<=1000000;
 const filters={q,status,page,pageSize:20};
 const users=useQuery({queryKey:['admin','users','list',auth.user.id,filters],enabled:valid,retry:false,queryFn:({signal})=>listAdminUsers(filters,signal)});
 useEffect(()=>{if(users.data && page>1 && !users.data.data.length)setParams(previous=>{const next=new URLSearchParams(previous);next.set('page',String(Math.max(1,Math.ceil(users.data.meta.total/20))));return next;},{replace:true});},[users.data,page,setParams]);
 const move=nextPage=>setParams({...Object.fromEntries(params),page:String(nextPage)});
 return <section className="admin-users-page"><SectionHeading icon={Users} eyebrow="QUẢN TRỊ HỆ THỐNG" title="Quản lý người dùng"/><p>Tìm theo tên hoặc email, xem tài khoản và thay đổi trạng thái hoạt động.</p>
  <form className="admin-user-filters" onSubmit={event=>{event.preventDefault();setNotice('');setParams({...Object.fromEntries(params),q:search.trim().normalize('NFC'),page:'1'});}}><label htmlFor="admin-user-q">Tên hoặc email</label><input id="admin-user-q" value={search} maxLength={300} onChange={event=>setSearch(event.target.value)}/><button type="submit" disabled={[...search.trim().normalize('NFC')].length>150}>Tìm kiếm</button><span>{[...search.trim().normalize('NFC')].length}/150 ký tự</span><label htmlFor="admin-user-status">Trạng thái</label><select id="admin-user-status" value={status} onChange={event=>{setNotice('');setParams({...Object.fromEntries(params),status:event.target.value,page:'1'});}}><option value="">Tất cả</option><option value="active">Hoạt động</option><option value="blocked">Đã khóa</option></select><button type="button" onClick={()=>{setParams({});setSearch('');setNotice('');}}>Xóa bộ lọc</button></form>
  {notice && <p role="status" className="success-text">{notice}</p>}
  {!valid ? <StatusPanel title="Bộ lọc không hợp lệ"><button onClick={()=>setParams({})}>Xóa bộ lọc</button></StatusPanel> : users.isPending ? <StatusPanel title="Đang tải người dùng…"/> : users.isError ? <StatusPanel title="Không thể tải người dùng" retry={()=>users.refetch()}><p>{users.error.message}</p></StatusPanel> : <>
   {!users.data.data.length ? <EmptyState title="Không tìm thấy người dùng"><p>Thử từ khóa hoặc trạng thái khác.</p></EmptyState> : <ul className="admin-user-list">{users.data.data.map(user=><li key={user.id}><div><h2><Link to={`/admin/users/${user.id}`}>{user.fullName}</Link></h2><p>{user.email}</p><p>{user.role==='admin' ? 'Quản trị viên' : 'Sinh viên'} · {user.status==='active' ? 'Hoạt động' : 'Đã khóa'}</p></div><div className="actions"><Link to={`/admin/users/${user.id}`}>Chi tiết</Link><UserStatusDialog user={user} onSaved={()=>setNotice('Đã cập nhật trạng thái tài khoản.')}/></div></li>)}</ul>}
   <nav className="pagination" aria-label="Phân trang người dùng"><button disabled={page<=1} onClick={()=>move(page-1)}>Trang trước</button><span>Trang {page} · {users.data.meta.total} người dùng</span><button disabled={page*20>=users.data.meta.total} onClick={()=>move(page+1)}>Trang sau</button></nav>
  </>}
 </section>;
}
