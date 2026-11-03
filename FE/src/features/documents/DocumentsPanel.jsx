import { api } from '../../lib/api.js';
import { useState, useEffect, lazy, Suspense } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth.js';
import { listDocuments, getDocument } from './api.js';
import { isDocumentSelected, toggleDocumentSelection } from './documentSelection.js';
import { DocumentStatus } from './DocumentStatus.jsx';
import { pollInterval } from './status.js';
import { UploadDialog } from './UploadDialog.jsx';
import { DeleteDocumentDialog } from './DeleteDocumentDialog.jsx';
const PdfViewer = lazy(() => import('./PdfViewer.jsx').then(module => ({ default: module.PdfViewer })));
import { StatusPanel } from '../../components/StatusPanel.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/Modal.jsx';
import { Files, FileText } from 'lucide-react';
export function DocumentsPanel({ courseId, documentIds = null, onScopeChange, scopeDisabled = false }) {
  const { data: auth } = useAuth();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState('');
  const documents = useQuery({ queryKey: ['documents','list',auth.user.id,courseId,page], queryFn: ({ signal }) => listDocuments(courseId, page, signal), retry: false, refetchInterval: pollInterval });
  const readySelection = useQuery({queryKey:['documents','ready-selection',auth.user.id,courseId],enabled:!!onScopeChange,retry:false,queryFn:async({signal})=>{
    const ready=[]; let total=0;
    for(let current=1;current===1||(current-1)*100<total;current++) {
      const result=await api(`/courses/${courseId}/documents?page=${current}&pageSize=100`,{signal,envelope:true});
      total=result.meta.total;
      ready.push(...result.data.filter(document=>document.status==='ready').map(document=>document.id));
    }
    return [...new Set(ready)];
  }});
  const selected = useQuery({ queryKey: ['documents','detail',auth.user.id,selectedId], enabled: Boolean(selectedId), queryFn: ({ signal }) => getDocument(selectedId, signal), retry: false, refetchInterval: pollInterval });
  const process=useMutation({mutationFn:id=>api(`/documents/${id}/process`,{method:'POST',body:{},csrfToken:auth.csrfToken,timeoutMs:240000}),onSettled:()=>client.invalidateQueries({queryKey:['documents']})});
  const readyIds = documents.data?.data.filter(document => document.status === 'ready').map(document => document.id).join(',');
  useEffect(() => {
    if (readyIds !== undefined) void client.invalidateQueries({ queryKey: ['courses'] });
    if (readyIds !== undefined) void client.invalidateQueries({ queryKey: ['documents','ready-selection',auth.user.id,courseId] });
    if (selected.data?.status === 'deleted') void client.invalidateQueries({ queryKey: ['documents','list',auth.user.id,courseId] });
  }, [readyIds, selected.data?.status, client, auth.user.id, courseId]);
  const deleting = (id, status) => { if(documentIds?.includes(id)){const next=documentIds.filter(value=>value!==id);onScopeChange?.(next);} setSelectedId(id); setNotice(status === 'deleted' ? 'Tài liệu đã được xóa.' : 'Đã tiếp nhận yêu cầu. Tài liệu đang được xóa; theo dõi kết quả bên dưới.'); };
  const uploaded = result => { setPage(1); setSelectedId(result.documentId||result.id); setNotice(result.duplicate?'Tài liệu đã có trong môn học.':'Đã tải PDF lên. Theo dõi trạng thái xử lý bên dưới.');if(result.processRequired)process.mutate(result.documentId||result.id); };
  return <section className="documents-panel compact-source-panel"><div className="page-heading documents-heading"><h2 className="panel-title"><Files size={22} aria-hidden="true"/>Nguồn tài liệu{documents.data && <span className="document-count">{documents.data.meta.total}</span>}</h2><UploadDialog courseId={courseId} limits={documents.data?.meta.limits} onUploaded={uploaded}/></div>
    {onScopeChange&&<p className="hint" role="status">{documentIds===null?'Đang chọn tất cả tài liệu sẵn sàng':documentIds.length?`Đang hỏi ${documentIds.length} tài liệu đã chọn`:'Chưa chọn tài liệu để hỏi đáp'}</p>}
    {onScopeChange&&<label className="document-select-all"><input type="checkbox" aria-label="Chọn tất cả tài liệu sẵn sàng" checked={documentIds===null||(!!readySelection.data?.length&&readySelection.data.every(id=>documentIds.includes(id)))} ref={node=>{if(node)node.indeterminate=documentIds!==null&&documentIds.length>0&&!readySelection.data?.every(id=>documentIds.includes(id));}} disabled={scopeDisabled||readySelection.isPending||readySelection.isError} onChange={e=>onScopeChange(e.target.checked?null:[])}/>Chọn tất cả</label>}
    {onScopeChange&&readySelection.isError&&<p role="alert">{readySelection.error.message} <Button onClick={()=>readySelection.refetch()}>Thử lại</Button></p>}
    {process.isPending&&<p role="status">Đang xử lý PDF trong thời gian cho phép…</p>}{process.isError&&<p role="alert" className="field-error">{process.error.message}</p>}
    {notice && <p role="status" className="success-text">{selected.data?.status === 'deleted' ? 'Tài liệu đã được xóa.' : notice}</p>}
    {documents.isPending ? <StatusPanel title="Đang tải tài liệu…"/> : documents.isError ? <StatusPanel title="Không thể tải tài liệu" retry={() => documents.refetch()}><p>{documents.error.message}</p></StatusPanel> : <>
      {!documents.data.data.length ? <p className="document-empty"><FileText size={28} aria-hidden="true"/>Chưa có tài liệu. Chọn Tải PDF để thêm nguồn văn bản.</p> : <ul className="document-list" aria-label="Danh sách tài liệu">{documents.data.data.map(document => <li className={`document-card${selectedId===document.id?' document-card--selected':''}`} key={document.id}>
        <span className="document-file-icon">{onScopeChange ? <input className="document-scope-checkbox" type="checkbox" aria-label={`Hỏi tài liệu ${document.fileName}`} checked={isDocumentSelected(documentIds,document)} disabled={scopeDisabled || (documentIds===null&&(readySelection.isPending||readySelection.isError)) || document.status!=='ready' || (!documentIds?.includes(document.id) && (documentIds?.length || 0)>=50)} onChange={e=>{onScopeChange(toggleDocumentSelection(documentIds,readySelection.data || [],document.id,e.target.checked));}}/> : <FileText size={19} aria-hidden="true"/>}</span>
        <div className="document-row-body"><button type="button" className="document-name-button" title={document.fileName} aria-label={`Mở tài liệu ${document.fileName}`} onClick={() => setSelectedId(document.id)}>{document.fileName}</button>
          <p className="document-file-size">{(document.sizeBytes / 1024 ** 2).toFixed(2)} MB{document.pageCount ? ` · ${document.pageCount} trang` : ''}</p>
          <DocumentStatus document={document}/>
          {document.errorMessage && <p className="field-error">{document.errorMessage}</p>}
          {document.processRetryable&&<Button disabled={process.isPending} onClick={()=>process.mutate(document.id)}>{document.status==='uploaded'?'Tiếp tục xử lý':'Thử xử lý lại'}</Button>}
        </div>
        <DeleteDocumentDialog compact document={document} courseId={courseId} onAccepted={deleting}/>
      </li>)}</ul>}
      {(documents.data.meta.total > 20 || page > 1) && <nav className="pagination" aria-label="Phân trang tài liệu"><Button disabled={page === 1} onClick={() => setPage(value => value - 1)}>Trang trước</Button><span>Trang {page}</span><Button disabled={page * 20 >= documents.data.meta.total} onClick={() => setPage(value => value + 1)}>Trang sau</Button></nav>}
    </>}
    {selectedId && <Modal open onOpenChange={open => { if (!open) setSelectedId(null); }} title="Xem tài liệu" description={selected.data?.fileName || 'Chi tiết tài liệu PDF'} className="document-preview-modal"><Button onClick={() => setSelectedId(null)}>Đóng</Button>
      {selected.isPending ? <p role="status">Đang tải trạng thái…</p> : selected.isError ? <StatusPanel title="Không thể mở nguồn" retry={() => selected.refetch()}><p>{selected.error.message}</p></StatusPanel> : <><DocumentStatus document={selected.data}/>
        {selected.data.errorMessage && <p role="alert" className="field-error">{selected.data.errorMessage}</p>}{selected.data.deletionRetryable && <DeleteDocumentDialog document={selected.data} courseId={courseId} onAccepted={deleting}/>}
        {selected.data.extractionCompleted && !['failed','unsupported','deleting','deleted'].includes(selected.data.status) ? <Suspense fallback={<p role="status">Đang tải viewer…</p>}><PdfViewer key={selectedId} document={selected.data}/></Suspense> : <p>{selected.data.status === 'deleted' ? 'Tài liệu đã được xóa.' : selected.data.status === 'deleting' ? 'Tài liệu đang được xóa và không thể mở.' : 'PDF chưa thể mở. Theo dõi trạng thái xử lý hoặc tải lại file hợp lệ nếu có lỗi.'}</p>}</>}
    </Modal>}
  </section>;
}
