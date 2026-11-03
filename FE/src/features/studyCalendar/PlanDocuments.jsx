import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../auth/useAuth.js';
export function PlanDocuments({value,onChange}) {
  const {data:auth}=useAuth();
  const query=useQuery({queryKey:['plan-documents',auth.user.id,value.courseId],enabled:!!value.courseId,queryFn:({signal})=>api(`/courses/${value.courseId}/documents?pageSize=100`,{signal,envelope:true}),retry:false});
  const docs=query.data?.data.filter(d=>d.status==='ready')||[];
  function select(ids){const primary=docs.find(d=>d.id===ids[0]);onChange({...value,documentIds:ids,documentId:primary?.id,pageFrom:1,pageTo:primary?.pageCount||1});}
  return <fieldset className="calendar-wide"><legend>PDF để AI chia nội dung buổi học</legend>
    {!value.courseId?<p>Chọn môn học trước.</p>:query.isPending?<p>Đang tải tài liệu…</p>:query.isError?<p role="alert">{query.error.message}</p>:<>
    <p>Chọn tối đa 10 PDF trong cùng môn. AI gộp chủ đề trùng và chia theo thời lượng từng buổi.</p>
    {docs.map(d=><label className="calendar-check" key={d.id}><input type="checkbox" checked={value.documentIds?.includes(d.id)||false} onChange={e=>select(e.target.checked?[...(value.documentIds||[]),d.id]:(value.documentIds||[]).filter(id=>id!==d.id))}/>{d.fileName} · {d.pageCount} trang</label>)}
    {!docs.length&&<p>Chưa có PDF sẵn sàng trong môn này.</p>}
    </>}
  </fieldset>;
}
