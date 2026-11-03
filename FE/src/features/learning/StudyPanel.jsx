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
  const { data: auth } = useAuth(); const supportsScopedStudy=(auth.schemaVersion===16); const [pageFrom,setPageFrom]=useState(1),[pageTo,setPageTo]=useState(1); const client = useQueryClient(); const [params,setParams] = useSearchParams();
  const openedSet = params.get('studySet');
  function openSet(id) {setParams(previous=>{const next=new URLSearchParams(previous);next.delete('studyAttempt');next.set('studySet',id);return next;}); }
  const [page,setPage] = useState(1); const [documentPage,setDocumentPage] = useState(1);
  const [selected,setSelected] = useState([]); const [kind,setKind] = useState('quiz'); const [title,setTitle] = useState(''); const [count,setCount] = useState(5);
  const [scopeMode,setScopeMode]=useState('all');
  const [forceNew,setForceNew]=useState(false);
  const [deleting,setDeleting] = useState(null); const request = useRef(null);
  const key = ['learning','list',auth.user.id,courseId];
  const sets = useQuery({queryKey:[...key,page],queryFn:({signal}) => listSets(courseId,page,signal),retry:false});
  const documents = useQuery({queryKey:['learning','documents',auth.user.id,courseId,documentPage],queryFn:({signal}) => api(`/courses/${courseId}/documents?page=${documentPage}&pageSize=100`,{signal,envelope:true}),retry:false,refetchInterval:5000});
  const selectedDocument = documents.data?.data.find(doc => selected.includes(doc.id));
  const create = useMutation({mutationFn:body => createSet(courseId,body,auth.csrfToken),retry:false,onSuccess:set => {
    request.current = null; client.invalidateQueries({queryKey:key}); openSet(set.id);
  }});
  const remove = useMutation({mutationFn:id => deleteSet(id,auth.csrfToken),retry:false,onSuccess:() => {setDeleting(null);client.invalidateQueries({queryKey:key});}});
  function submit(event) {
    event.preventDefault();
    const payload = {kind,title:title.trim().normalize('NFC'),count:Number(count),documentIds:[...selected].sort(),...(auth.schemaVersion===16?{generationMode:'ai',forceNew}:{}),...(supportsScopedStudy&&scopeMode==='range'?{pageFrom:Number(pageFrom),pageTo:Number(pageTo)}:{})};
    const signature = JSON.stringify(payload);
    if (!request.current || request.current.signature !== signature) request.current = {signature,body:{...payload,requestId:crypto.randomUUID()}};
    create.mutate(request.current.body);
  }
  if(openedSet) return <div className="study-dock-player"><Button className="study-dock-back" onClick={()=>{setParams(previous=>{const next=new URLSearchParams(previous);next.delete('studyAttempt');next.delete('studySet');return next;});}}>← Bộ học của môn</Button><StudyContent key={openedSet} setId={openedSet} embedded/></div>;
  return <section className="study-panel" aria-labelledby="study-title"><h2 className="panel-title" id="study-title"><Layers size={23} aria-hidden="true"/>Quiz & flashcard từ tài liệu</h2>
    <p>Tạo quiz và flashcard từ tài liệu, kèm nguồn để đối chiếu.</p>
    <form onSubmit={submit} aria-busy={create.isPending}><fieldset disabled={create.isPending}>
      <legend>Tạo bộ học</legend>
      <div className="study-form-grid study-main-fields">
        <label className="study-title-field">Tiêu đề (không bắt buộc)<input placeholder="Tự đặt tên nếu để trống" maxLength={150} value={title} onChange={e=>setTitle(e.target.value)}/></label>
        <label>Loại bộ học<select value={kind} onChange={e=>setKind(e.target.value)}><option value="quiz">Quiz trắc nghiệm</option><option value="flashcards">Flashcard</option></select></label>
        <label>Số câu / thẻ<input type="number" required min={1} max={29} aria-describedby="study-count-hint" value={count} onChange={e=>setCount(e.target.value)}/><small id="study-count-hint">Từ 1 đến 29</small></label>
      </div>
      <p>Đã chọn {selected.length}/{supportsScopedStudy?1:10} tài liệu. Chỉ tài liệu “Sẵn sàng” được chọn.</p>
      {documents.isPending ? <p role="status">Đang tải tài liệu…</p> : documents.isError ? <p role="alert">{documents.error.message} <Button onClick={()=>documents.refetch()}>Thử lại</Button></p> : <>
        <div className="study-document-options">{documents.data.data.length === 0 ? <p>Chưa có tài liệu. Hãy tải PDF ở phần nguồn phía trên.</p> : documents.data.data.map(doc => <label key={doc.id}>
          <input type={supportsScopedStudy?"radio":"checkbox"} name={supportsScopedStudy?"study-document":undefined} checked={selected.includes(doc.id)} disabled={!selected.includes(doc.id) && (doc.status !== 'ready' || (!supportsScopedStudy && selected.length >= 10))} onChange={e => setSelected(ids => e.target.checked ? (supportsScopedStudy?[doc.id]:[...ids,doc.id]) : ids.filter(id=>id!==doc.id))}/>
          {doc.fileName} <small>({doc.status === 'ready' ? 'Sẵn sàng' : doc.status})</small></label>)}</div>
        <div className="study-actions"><Button disabled={documentPage<=1} onClick={()=>setDocumentPage(p=>p-1)}>Nguồn trước</Button><span>Trang {documentPage}</span><Button disabled={documentPage*100>=documents.data.meta.total} onClick={()=>setDocumentPage(p=>p+1)}>Nguồn sau</Button><Button onClick={()=>setSelected([])}>Bỏ chọn tất cả</Button></div></>}
      {supportsScopedStudy&&<fieldset className="study-scope"><legend>Phạm vi luyện tập</legend>
        <div className="study-scope-options">
          <label className={scopeMode==='all'?'is-selected':''}><input type="radio" name="study-scope" value="all" checked={scopeMode==='all'} onChange={()=>setScopeMode('all')}/><span><strong>Toàn bộ tài liệu</strong></span></label>
          <label className={scopeMode==='range'?'is-selected':''}><input type="radio" name="study-scope" value="range" checked={scopeMode==='range'} onChange={()=>{setScopeMode('range');if(selectedDocument?.pageCount)setPageTo(selectedDocument.pageCount);}}/><span><strong>Khoảng trang</strong></span></label>
        </div>
        {scopeMode==='range'&&<div className="study-range-grid"><label>Từ trang<input type="number" min={1} max={selectedDocument?.pageCount||undefined} required value={pageFrom} onChange={e=>setPageFrom(e.target.value)}/></label><label>Đến trang<input type="number" min={Number(pageFrom)||1} max={selectedDocument?.pageCount||undefined} required value={pageTo} onChange={e=>setPageTo(e.target.value)}/></label></div>}
      </fieldset>}<label className="study-new-set-option"><input type="checkbox" checked={forceNew} onChange={e=>setForceNew(e.target.checked)}/>Tạo bộ mới thay vì mở lại bộ đã có</label><Button type="submit" variant="primary" disabled={!selected.length || create.isPending}>{create.isPending ? 'Đang tạo bộ học…' : 'Tạo bộ học'}</Button>
    </fieldset></form>
    {create.isError && <div role="alert"><p>{create.error.message}</p>{create.error.fields && <ul>{Object.entries(create.error.fields).map(([field,message])=><li key={field}>{field}: {message}</li>)}</ul>}<p>Nếu mất kết nối, gửi lại giữ cùng mã yêu cầu để lấy kết quả đã lưu. Kiểm tra danh sách trước khi tạo lượt mới.</p><Button onClick={()=>sets.refetch()}>Kiểm tra danh sách</Button> <Button onClick={()=>{request.current=null;create.reset();}}>Tạo lượt mới</Button></div>}
    <h3>Bộ học đã lưu</h3>{sets.isPending ? <p role="status">Đang tải bộ học…</p> : sets.isError ? <p role="alert">{sets.error.message} <Button onClick={()=>sets.refetch()}>Thử lại</Button></p> : <>
      {sets.data.data.length === 0 ? <p>Chưa có bộ học. Tạo quiz hoặc flashcard từ PDF của bạn.</p> : <ul className="study-set-list">{sets.data.data.map(set => <li key={set.id}><div><Button className="study-set-open" onClick={()=>openSet(set.id)}>{set.title}</Button><Link className="study-fullscreen-link" to={`/app/learning/${set.id}`}>Mở trang riêng</Link><p>{set.kind === 'quiz' ? 'Quiz' : 'Flashcard'} · {set.itemCount} mục · {set.sourceCount} trích đoạn</p></div><Button onClick={()=>{remove.reset();setDeleting(set);}}>Xóa</Button></li>)}</ul>}
      <div className="study-actions"><Button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Trước</Button><span>Trang {page}</span><Button disabled={page*20>=sets.data.meta.total} onClick={()=>setPage(p=>p+1)}>Sau</Button></div></>}
    <Modal title="Xóa bộ học?" description="Bộ học, các câu hỏi/thẻ và toàn bộ lịch sử làm bài liên quan sẽ bị xóa vĩnh viễn." open={!!deleting} onOpenChange={open=>{if(!open&&!remove.isPending)setDeleting(null);}}>
      <p>{deleting?.title}</p>{remove.isError&&<p role="alert">{remove.error.message}</p>}<div className="study-actions"><Button disabled={remove.isPending} onClick={()=>setDeleting(null)}>Hủy</Button><Button disabled={remove.isPending} onClick={()=>remove.mutate(deleting.id)}>{remove.isPending?'Đang xóa…':'Xác nhận xóa'}</Button></div>
    </Modal>
  </section>;
}
