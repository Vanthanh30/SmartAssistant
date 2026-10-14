import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../auth/useAuth.js';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/Modal.jsx';
import { listSets, createSet, deleteSet } from './api.js';
import { StudyContent } from './StudyPage.jsx';
import { Layers } from 'lucide-react';

export function StudyPanel({ courseId }) {
  const { data: auth } = useAuth(); const client = useQueryClient(); const [params,setParams] = useSearchParams();
  const openedSet = params.get('studySet');
  function openSet(id) {setParams(previous=>{const next=new URLSearchParams(previous);next.delete('studyAttempt');next.set('studySet',id);return next;}); }
  const [page,setPage] = useState(1); const [documentPage,setDocumentPage] = useState(1);
  const [selected,setSelected] = useState([]); const [kind,setKind] = useState('quiz'); const [title,setTitle] = useState(''); const [count,setCount] = useState(5);
  const [deleting,setDeleting] = useState(null); const request = useRef(null);
  const key = ['learning','list',auth.user.id,courseId];
  const sets = useQuery({queryKey:[...key,page],queryFn:({signal}) => listSets(courseId,page,signal),retry:false});
  const documents = useQuery({queryKey:['learning','documents',auth.user.id,courseId,documentPage],queryFn:({signal}) => api(`/courses/${courseId}/documents?page=${documentPage}&pageSize=100`,{signal,envelope:true}),retry:false,refetchInterval:5000});
  const create = useMutation({mutationFn:body => createSet(courseId,body,auth.csrfToken),retry:false,onSuccess:set => {
    request.current = null; client.invalidateQueries({queryKey:key}); openSet(set.id);
  }});
  const remove = useMutation({mutationFn:id => deleteSet(id,auth.csrfToken),retry:false,onSuccess:() => {setDeleting(null);client.invalidateQueries({queryKey:key});}});
  function submit(event) {
    event.preventDefault();
    const payload = {kind,title:title.trim().normalize('NFC'),count:Number(count),documentIds:[...selected].sort()};
    const signature = JSON.stringify(payload);
    if (!request.current || request.current.signature !== signature) request.current = {signature,body:{...payload,requestId:crypto.randomUUID()}};
    create.mutate(request.current.body);
  }
  if(openedSet) return <div className="study-dock-player"><Button className="study-dock-back" onClick={()=>{setParams(previous=>{const next=new URLSearchParams(previous);next.delete('studyAttempt');next.delete('studySet');return next;});}}>← Bộ học của môn</Button><StudyContent key={openedSet} setId={openedSet} embedded/></div>;
  return <section className="study-panel" aria-labelledby="study-title"><h2 className="panel-title" id="study-title"><Layers size={23} aria-hidden="true"/>Quiz & flashcard từ tài liệu</h2>
    <p>Tạo trực tiếp từ PDF, không cần API key và không gửi nội dung tới OpenAI. Quiz chọn từ còn thiếu trong câu nguyên văn; flashcard giúp nhớ từ và xem lại câu đầy đủ. Lấy mẫu theo vị trí/trang trên từng PDF (tối đa32 đoạn/PDF), luân phiên tài liệu và phần khi chọn câu; xử lý tối đa32000 ký tự và128 câu phù hợp/PDF. Không bảo đảm bao phủ mọi trang; bỏ qua công thức lỗi. Nếu không đủ câu phù hợp, hãy giảm số mục hoặc chọn thêm tài liệu.</p>
    <form onSubmit={submit} aria-busy={create.isPending}><fieldset disabled={create.isPending}>
      <legend>Tạo bộ học</legend><div className="study-form-grid"><label>Loại bộ học<select value={kind} onChange={e=>setKind(e.target.value)}><option value="quiz">Quiz trắc nghiệm</option><option value="flashcards">Flashcard</option></select></label>
        <label>Tiêu đề<input required maxLength={150} value={title} onChange={e=>setTitle(e.target.value)}/></label>
        <label>Số câu/thẻ (1–10)<input type="number" required min={1} max={10} value={count} onChange={e=>setCount(e.target.value)}/></label></div>
      <p>Đã chọn {selected.length}/10 tài liệu. Chỉ tài liệu “Sẵn sàng” được chọn.</p>
      {documents.isPending ? <p role="status">Đang tải tài liệu…</p> : documents.isError ? <p role="alert">{documents.error.message} <Button onClick={()=>documents.refetch()}>Thử lại</Button></p> : <>
        <div className="study-document-options">{documents.data.data.length === 0 ? <p>Chưa có tài liệu. Hãy tải PDF ở phần nguồn phía trên.</p> : documents.data.data.map(doc => <label key={doc.id}>
          <input type="checkbox" checked={selected.includes(doc.id)} disabled={!selected.includes(doc.id) && (doc.status !== 'ready' || selected.length >= 10)} onChange={e => setSelected(ids => e.target.checked ? [...ids,doc.id] : ids.filter(id=>id!==doc.id))}/>
          {doc.fileName} <small>({doc.status === 'ready' ? 'Sẵn sàng' : doc.status})</small></label>)}</div>
        <div className="study-actions"><Button disabled={documentPage<=1} onClick={()=>setDocumentPage(p=>p-1)}>Nguồn trước</Button><span>Trang {documentPage}</span><Button disabled={documentPage*100>=documents.data.meta.total} onClick={()=>setDocumentPage(p=>p+1)}>Nguồn sau</Button><Button onClick={()=>setSelected([])}>Bỏ chọn tất cả</Button></div></>}
      <Button type="submit" variant="primary" disabled={!title.trim() || !selected.length || create.isPending}>{create.isPending ? 'Đang tạo bộ học…' : 'Tạo bộ học'}</Button>
    </fieldset></form>
    {create.isError && <div role="alert"><p>{create.error.message}</p><p>Nếu mất kết nối, gửi lại giữ cùng mã yêu cầu để lấy kết quả đã lưu. Kiểm tra danh sách trước khi tạo lượt mới.</p><Button onClick={()=>sets.refetch()}>Kiểm tra danh sách</Button> <Button onClick={()=>{request.current=null;create.reset();}}>Tạo lượt mới</Button></div>}
    <h3>Bộ học đã lưu</h3>{sets.isPending ? <p role="status">Đang tải bộ học…</p> : sets.isError ? <p role="alert">{sets.error.message} <Button onClick={()=>sets.refetch()}>Thử lại</Button></p> : <>
      {sets.data.data.length === 0 ? <p>Chưa có bộ học. Tạo quiz hoặc flashcard từ PDF của bạn.</p> : <ul className="study-set-list">{sets.data.data.map(set => <li key={set.id}><div><Button className="study-set-open" onClick={()=>openSet(set.id)}>{set.title}</Button><Link className="study-fullscreen-link" to={`/app/learning/${set.id}`}>Mở trang riêng</Link><p>{set.kind === 'quiz' ? 'Quiz' : 'Flashcard'} · {set.itemCount} mục · {set.sourceCount} trích đoạn</p></div><Button onClick={()=>{remove.reset();setDeleting(set);}}>Xóa</Button></li>)}</ul>}
      <div className="study-actions"><Button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Trước</Button><span>Trang {page}</span><Button disabled={page*20>=sets.data.meta.total} onClick={()=>setPage(p=>p+1)}>Sau</Button></div></>}
    <Modal title="Xóa bộ học?" description="Xóa bộ học và các lần làm quiz của bộ này. PDF và các bộ học khác được giữ." open={!!deleting} onOpenChange={open=>{if(!open&&!remove.isPending)setDeleting(null);}}>
      <p>{deleting?.title}</p>{remove.isError&&<p role="alert">{remove.error.message}</p>}<div className="study-actions"><Button disabled={remove.isPending} onClick={()=>setDeleting(null)}>Hủy</Button><Button disabled={remove.isPending} onClick={()=>remove.mutate(deleting.id)}>{remove.isPending?'Đang xóa…':'Xác nhận xóa'}</Button></div>
    </Modal>
  </section>;
}
