import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api} from '../../lib/api.js';
import {Button} from '../../components/ui/Button.jsx';

export function DocumentScope({courseId,userId,documentIds,onChange,disabled,isActive}) {
  const [page,setPage]=useState(1);
  const documents=useQuery({queryKey:['documents','scope',userId,courseId,page],enabled:isActive,
    queryFn:({signal})=>api(`/courses/${courseId}/documents?page=${page}&pageSize=20`,{signal,envelope:true}),retry:false});
  const all=documentIds===null;
  return <details className="chat-document-scope">
    <summary>Nguồn hỏi đáp: {all?'Tất cả PDF sẵn sàng':`${documentIds.length} PDF đã chọn`}</summary>
    <fieldset disabled={disabled}>
      <legend>Phạm vi tài liệu</legend>
      {!all&&<>
        {documents.isPending?<p role="status">Đang tải danh sách PDF…</p>:documents.isError?<p role="alert">{documents.error.message} <Button onClick={()=>documents.refetch()}>Thử lại</Button></p>:
          <ul>{documents.data.data.filter(d=>d.status==='ready').map(d=><li key={d.id}><label><input type="checkbox" checked={documentIds.includes(d.id)} onChange={e=>onChange(e.target.checked?[...documentIds,d.id]:documentIds.filter(id=>id!==d.id))}/> {d.fileName}</label></li>)}</ul>}
        {documents.data&&(documents.data.meta.total>20||page>1)&&<nav aria-label="Phân trang nguồn hỏi đáp"><Button disabled={page===1} onClick={()=>setPage(p=>p-1)}>Trang trước</Button><span>Trang {page}</span><Button disabled={page*20>=documents.data.meta.total} onClick={()=>setPage(p=>p+1)}>Trang sau</Button></nav>}
        {(documentIds.length>50)&&<p role="status">Chọn từ 1 đến 50 PDF để hỏi đáp.</p>}
      </>}
    </fieldset>
  </details>;
}
