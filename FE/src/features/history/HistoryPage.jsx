import { History } from 'lucide-react';
import { SectionHeading } from '../../components/SectionHeading.jsx';
import { useState,useEffect } from 'react';
import { Link,useSearchParams } from 'react-router-dom';
import { useInfiniteQuery,useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth.js';
import { listCourses } from '../courses/api.js';
import { listHistory } from './api.js';
import { DeleteConversationDialog } from './DeleteConversationDialog.jsx';
import { StatusPanel } from '../../components/StatusPanel.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
export function HistoryPage(){
 const {data:auth}=useAuth();const [params,setParams]=useSearchParams();const [notice,setNotice]=useState('');
 const courseId=params.get('courseId')||'';const pageText=params.get('page')||'1';const page=Number(pageText);
 const valid=(!courseId || /^[1-9][0-9]{0,19}$/.test(courseId)) && /^\d+$/.test(pageText) && Number.isInteger(page) && page>=1 && page<=1000000;
 const filters={courseId,page,pageSize:20};
 const courses=useInfiniteQuery({queryKey:['history','courses',auth.user.id],initialPageParam:1,retry:false,
  queryFn:({signal,pageParam})=>listCourses({q:'',page:pageParam,pageSize:100},signal),getNextPageParam:last=>last.meta.page*last.meta.pageSize<last.meta.total ? last.meta.page+1 : undefined});
 const history=useQuery({queryKey:['history','list',auth.user.id,filters],enabled:valid,retry:false,queryFn:({signal})=>listHistory(filters,signal)});
 const options=[...new Map((courses.data?.pages.flatMap(group=>group.data)??[]).map(course=>[course.id,course])).values()];
 useEffect(()=>{if(history.data && page>1 && !history.data.data.length){setParams(previous=>{const next=new URLSearchParams(previous);next.set('page',String(Math.max(1,Math.ceil(history.data.meta.total/20))));return next;},{replace:true});}},[history.data,page,setParams]);
 function filter(value){setNotice('');setParams(value ? {courseId:value} : {});}
 return <section className="history-page"><SectionHeading icon={History} eyebrow="HÀNH TRÌNH HỌC TẬP" title="Lịch sử hội thoại"/><p>Xem lại câu hỏi, câu trả lời và nguồn đã trích dẫn theo từng môn học.</p>
  <div className="history-filters"><label htmlFor="history-course">Môn học</label><select id="history-course" value={courseId} onChange={event=>filter(event.target.value)}><option value="">Tất cả môn học</option>
   {courseId && !options.some(course=>course.id===courseId) && <option value={courseId}>{history.data?.data[0]?.courseName || 'Môn học đã chọn'}</option>}
   {options.map(course=><option key={course.id} value={course.id}>{course.name}</option>)}</select>
   {courses.isPending && <p role="status">Đang tải bộ lọc môn học…</p>}
   {courses.hasNextPage && <button disabled={courses.isFetchingNextPage} onClick={()=>courses.fetchNextPage()}>{courses.isFetchingNextPage ? 'Đang tải…' : 'Tải thêm môn học'}</button>}
   {courses.isError && <p role="alert">Không tải được bộ lọc môn học. <button onClick={()=>courses.refetch()}>Thử lại</button></p>}
  </div>
  {notice && <p role="status" className="success-text">{notice}</p>}
  {!valid ? <StatusPanel title="Bộ lọc lịch sử không hợp lệ"><button onClick={()=>filter('')}>Xóa bộ lọc</button></StatusPanel>
   : history.isPending ? <StatusPanel title="Đang tải lịch sử…"/> : history.isError ? <StatusPanel title={history.error.status===404 ? 'Không tìm thấy môn học' : 'Không thể tải lịch sử'} retry={()=>history.refetch()}><p>{history.error.message}</p></StatusPanel>
    : <>{!history.data.data.length ? <EmptyState title="Chưa có hội thoại"><p>Mở môn học, thêm PDF và đặt câu hỏi để bắt đầu.</p><Link to="/app/courses">Môn học của tôi</Link></EmptyState> : <ul className="history-list">{history.data.data.map(conversation=><li key={conversation.id}><div><h2><Link to={`/app/history/${conversation.id}`}>{conversation.title}</Link></h2><p>{conversation.courseName} · {conversation.messageCount} tin nhắn</p><p>Cập nhật <time dateTime={conversation.updatedAt}>{new Date(conversation.updatedAt).toLocaleString('vi-VN')}</time></p></div><div className="actions"><Link to={`/app/courses/${conversation.courseId}?conversation=${conversation.id}`}>Tiếp tục hỏi</Link><DeleteConversationDialog conversation={conversation} onDeleted={()=>setNotice('Đã xóa hội thoại.')}/></div></li>)}</ul>}
     <nav className="pagination" aria-label="Phân trang lịch sử"><button disabled={page<=1} onClick={()=>setParams({...Object.fromEntries(params),page:String(page-1)})}>Trang trước</button><span>Trang {page} · {history.data.meta.total} hội thoại</span><button disabled={page*20>=history.data.meta.total} onClick={()=>setParams({...Object.fromEntries(params),page:String(page+1)})}>Trang sau</button></nav></>}
 </section>;
}
