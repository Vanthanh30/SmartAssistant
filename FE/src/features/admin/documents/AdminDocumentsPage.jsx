import { Files } from 'lucide-react';
import { SectionHeading } from '../../../components/SectionHeading.jsx';
import { useEffect,useState } from 'react';
import { Link,useSearchParams } from 'react-router-dom';
import { useInfiniteQuery,useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/useAuth.js';
import { listAdminUsers } from '../users/api.js';
import { StatusPanel } from '../../../components/StatusPanel.jsx';
import { EmptyState } from '../../../components/EmptyState.jsx';
import { DocumentStatus } from '../../documents/DocumentStatus.jsx';
import { DeleteDocumentDialog } from '../../documents/DeleteDocumentDialog.jsx';
import { listAdminDocuments,listDocumentCourses,deleteAdminDocument,documentStates,shouldPoll } from './api.js';
export function AdminDocumentsPage(){
 const {data:auth}=useAuth();const [params,setParams]=useSearchParams();const [accepted,setAccepted]=useState(null);
 const q=params.get('q')||'';const status=params.get('status')||'';const userId=params.get('userId')||'';const courseId=params.get('courseId')||'';const pageText=params.get('page')||'1';const page=Number(pageText);const [draft,setDraft]=useState({query:q,text:q});if(draft.query!==q)setDraft({query:q,text:q});const search=draft.query===q?draft.text:q;const setSearch=value=>setDraft({query:q,text:value});
 const valid=(!status || Object.hasOwn(documentStates,status)) && (!userId || /^[1-9][0-9]{0,19}$/.test(userId)) && (!courseId || /^[1-9][0-9]{0,19}$/.test(courseId)) && [...q].length<=255 && /^\d+$/.test(pageText) && page>=1 && page<=1000000;
 const users=useInfiniteQuery({queryKey:['admin','document-owners',auth.user.id],initialPageParam:1,retry:false,queryFn:({signal,pageParam})=>listAdminUsers({page:pageParam,pageSize:100},signal),getNextPageParam:last=>last.meta.page*last.meta.pageSize<last.meta.total ? last.meta.page+1 : undefined});
 const courses=useInfiniteQuery({queryKey:['admin','document-courses',auth.user.id,userId],enabled:valid,initialPageParam:1,retry:false,queryFn:({signal,pageParam})=>listDocumentCourses({userId,page:pageParam,pageSize:100},signal),getNextPageParam:last=>last.meta.page*last.meta.pageSize<last.meta.total ? last.meta.page+1 : undefined});
 const documents=useQuery({queryKey:['admin','documents','list',auth.user.id,{q,status,userId,courseId,page}],enabled:valid,retry:false,queryFn:({signal})=>listAdminDocuments({q,status,userId,courseId,page,pageSize:20},signal),refetchInterval:query=>query.state.data?.data.some(shouldPoll) ? Math.min(30000,3000*2**Math.min(query.state.dataUpdateCount,3)) : false});
 useEffect(()=>{if(documents.data && page>1 && !documents.data.data.length)setParams(previous=>{const next=new URLSearchParams(previous);next.set('page',String(Math.max(1,Math.ceil(documents.data.meta.total/20))));return next;},{replace:true});},[documents.data,page,setParams]);
 const change=(key,value)=>{setAccepted(null);setParams(previous=>{const next=new URLSearchParams(previous);value ? next.set(key,value) : next.delete(key);next.set('page','1');if(key==='userId')next.delete('courseId');return next;});};
 const owners=[...new Map((users.data?.pages.flatMap(group=>group.data)??[]).map(user=>[user.id,user])).values()];
 const courseOptions=[...new Map((courses.data?.pages.flatMap(group=>group.data)??[]).map(course=>[course.id,course])).values()];
 return <section className="admin-users-page"><SectionHeading icon={Files} eyebrow="QUẢN TRỊ HỆ THỐNG" title="Quản lý tài liệu"/><p>Xem nguồn theo người tải, môn học và trạng thái. Xóa sẽ chạy cleanup trên index và file thật.</p>
  <form className="admin-user-filters" onSubmit={event=>{event.preventDefault();change('q',search.trim().normalize('NFC'));}}><label htmlFor="admin-doc-q">Tài liệu, môn hoặc người tải</label><input id="admin-doc-q" value={search} maxLength={510} onChange={event=>setSearch(event.target.value)}/><button disabled={[...search.trim().normalize('NFC')].length>255}>Tìm kiếm</button>
   <label htmlFor="admin-doc-status">Trạng thái</label><select id="admin-doc-status" value={status} onChange={event=>change('status',event.target.value)}><option value="">Tất cả chưa xóa</option>{Object.entries(documentStates).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
   <label htmlFor="admin-doc-owner">Người tải</label><select id="admin-doc-owner" value={userId} onChange={event=>change('userId',event.target.value)}><option value="">Tất cả người tải</option>{userId && !owners.some(user=>user.id===userId) && <option value={userId}>Người tải đã chọn</option>}{owners.map(user=><option key={user.id} value={user.id}>{user.fullName} · {user.email}</option>)}</select>
   <label htmlFor="admin-doc-course">Môn học</label><select id="admin-doc-course" value={courseId} onChange={event=>change('courseId',event.target.value)}><option value="">Tất cả môn học</option>{courseId && !courseOptions.some(course=>course.id===courseId) && <option value={courseId}>Môn học đã chọn</option>}{courseOptions.map(course=><option key={course.id} value={course.id}>{course.name} · {course.ownerName}</option>)}</select>
   <button type="button" onClick={()=>{setParams({});setSearch('');setAccepted(null);}}>Xóa bộ lọc</button>
  </form>
  {(users.isPending || courses.isPending) && valid && <p role="status">Đang tải bộ lọc…</p>}
  {users.hasNextPage && <button disabled={users.isFetchingNextPage} onClick={()=>users.fetchNextPage()}>Tải thêm người tải</button>}{courses.hasNextPage && <button disabled={courses.isFetchingNextPage} onClick={()=>courses.fetchNextPage()}>Tải thêm môn học</button>}
  {(users.isError || courses.isError) && <p role="alert">Không tải được bộ lọc. <button onClick={()=>{void users.refetch();void courses.refetch();}}>Thử lại</button></p>}
  {accepted && <p role="status">{accepted.status==='deleted' ? 'Cleanup đã hoàn tất.' : 'Đã tiếp nhận yêu cầu xóa; chưa xác nhận cleanup hoàn tất.'} <Link to={`/admin/documents/${accepted.id}`}>Theo dõi kết quả</Link></p>}
  {!valid ? <StatusPanel title="Bộ lọc tài liệu không hợp lệ"><button onClick={()=>setParams({})}>Xóa bộ lọc</button></StatusPanel> : documents.isPending ? <StatusPanel title="Đang tải tài liệu…"/> : documents.isError ? <StatusPanel title="Không thể tải tài liệu" retry={()=>documents.refetch()}><p>{documents.error.message}</p></StatusPanel> : <>
   {!documents.data.data.length ? <EmptyState title="Không tìm thấy tài liệu"><p>Thử bộ lọc khác.</p></EmptyState> : <ul className="admin-user-list">{documents.data.data.map(document=><li key={document.id}><div><h2><Link to={`/admin/documents/${document.id}`}>{document.fileName}</Link></h2><DocumentStatus document={document}/><p>{document.uploadedBy.fullName} · {document.uploadedBy.email} · {document.courseName}</p><p>{(document.sizeBytes/1024**2).toFixed(2)} MB · {document.pageCount ?? 'Chưa biết'} trang</p>{document.errorMessage && <p className="field-error">{document.errorMessage}</p>}</div><div className="actions"><Link to={`/admin/documents/${document.id}`}>Chi tiết</Link><DeleteDocumentDialog document={document} queryScope="admin" removeDocument={deleteAdminDocument} onAccepted={(id,state)=>setAccepted({id,status:state})}/></div></li>)}</ul>}
   <nav className="pagination" aria-label="Phân trang tài liệu"><button disabled={page<=1} onClick={()=>setParams({...Object.fromEntries(params),page:String(page-1)})}>Trang trước</button><span>Trang {page} · {documents.data.meta.total} tài liệu</span><button disabled={page*20>=documents.data.meta.total} onClick={()=>setParams({...Object.fromEntries(params),page:String(page+1)})}>Trang sau</button></nav>
  </>}
 </section>;
}
