import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth.js';
import { api } from '../../lib/api.js';
export function DocumentScopeFields({value,onChange}){
 const {data:auth}=useAuth(),enabled=(auth?.schemaVersion===16);
 const docs=useQuery({queryKey:['calendar-document-scope',auth?.user.id,value.courseId],enabled:enabled&&!!value.courseId,queryFn:({signal})=>api(`/courses/${value.courseId}/documents?pageSize=100`,{signal,envelope:true}),retry:false});
 if(!enabled)return null;
 const selected=docs.data?.data.find(d=>d.id===value.documentId);
 return <div className="calendar-form-grid calendar-wide"><label>Tài liệu cần học<select required disabled={!value.courseId||docs.isPending} value={value.documentId||''} onChange={e=>{const d=docs.data?.data.find(d=>d.id===e.target.value);onChange({...value,documentId:e.target.value,pageFrom:1,pageTo:d?.pageCount||1});}}><option value="">Chọn tài liệu</option>{docs.data?.data.filter(d=>d.status==='ready').map(d=><option key={d.id} value={d.id}>{d.fileName}</option>)}</select></label><label>Từ trang<input required type="number" min={1} max={selected?.pageCount} value={value.pageFrom||1} onChange={e=>onChange({...value,pageFrom:Number(e.target.value)})}/></label><label>Đến trang<input required type="number" min={value.pageFrom||1} max={selected?.pageCount} value={value.pageTo||1} onChange={e=>onChange({...value,pageTo:Number(e.target.value)})}/></label>{!value.courseId&&<p>Chọn môn học để chọn tài liệu.</p>}{docs.isError&&<p role="alert">{docs.error.message}</p>}</div>;
}
