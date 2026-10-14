import { useState, useEffect, lazy, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth.js';
import { listDocuments, getDocument } from './api.js';
import { DocumentStatus } from './DocumentStatus.jsx';
import { pollInterval } from './status.js';
import { UploadDialog } from './UploadDialog.jsx';
import { DeleteDocumentDialog } from './DeleteDocumentDialog.jsx';
const PdfViewer = lazy(() => import('./PdfViewer.jsx').then(module => ({ default: module.PdfViewer })));
import { StatusPanel } from '../../components/StatusPanel.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Files, FileText, Eye } from 'lucide-react';
export function DocumentsPanel({ courseId }) {
  const { data: auth } = useAuth();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState('');
  const documents = useQuery({ queryKey: ['documents','list',auth.user.id,courseId,page], queryFn: ({ signal }) => listDocuments(courseId, page, signal), retry: false, refetchInterval: pollInterval });
  const selected = useQuery({ queryKey: ['documents','detail',auth.user.id,selectedId], enabled: Boolean(selectedId), queryFn: ({ signal }) => getDocument(selectedId, signal), retry: false, refetchInterval: pollInterval });
  const readyIds = documents.data?.data.filter(document => document.status === 'ready').map(document => document.id).join(',');
  useEffect(() => {
    if (readyIds !== undefined) void client.invalidateQueries({ queryKey: ['courses'] });
    if (selected.data?.status === 'deleted') void client.invalidateQueries({ queryKey: ['documents','list',auth.user.id,courseId] });
  }, [readyIds, selected.data?.status, client, auth.user.id, courseId]);
  const deleting = (id, status) => { setSelectedId(id); setNotice(status === 'deleted' ? 'Tài liệu đã được xóa.' : 'Đã tiếp nhận yêu cầu. Tài liệu đang được xóa; theo dõi kết quả bên dưới.'); };
  const uploaded = result => { setPage(1); setSelectedId(result.documentId); setNotice('Đã tải PDF lên. Theo dõi trạng thái xử lý bên dưới.'); };
  return <section className="documents-panel"><div className="page-heading documents-heading"><h2 className="panel-title"><Files size={22} aria-hidden="true"/>Nguồn tài liệu</h2><UploadDialog courseId={courseId} limits={documents.data?.meta.limits} onUploaded={uploaded}/></div>
    {documents.data?.data.some(document => document.status === 'ready') && <p role="status" className="documents-ready-note">Nguồn đã sẵn sàng để hỏi đáp và ôn tập.</p>}
    {notice && <p role="status" className="success-text">{selected.data?.status === 'deleted' ? 'Tài liệu đã được xóa.' : notice}</p>}
    <p className="hint">Tập hợp PDF cho môn học. Chọn một tài liệu để xem bản gốc và trạng thái xử lý.</p>
    {documents.isPending ? <StatusPanel title="Đang tải tài liệu…"/> : documents.isError ? <StatusPanel title="Không thể tải tài liệu" retry={() => documents.refetch()}><p>{documents.error.message}</p></StatusPanel> : <>
      {!documents.data.data.length ? <p className="document-empty"><FileText size={28} aria-hidden="true"/>Chưa có tài liệu. Chọn Tải PDF để thêm nguồn văn bản.</p> : <ul className="document-list">{documents.data.data.map(document => <li className={`document-card${selectedId===document.id?' document-card--selected':''}`} key={document.id}><div className="document-card-heading"><span className="document-file-icon"><FileText size={22} aria-hidden="true"/></span><strong title={document.fileName}>{document.fileName}</strong></div><div className="document-card-meta"><DocumentStatus document={document}/><p>{(document.sizeBytes / 1024 ** 2).toFixed(2)} MB{document.pageCount ? ` · ${document.pageCount} trang` : ''}</p>{document.errorMessage && <p className="field-error">{document.errorMessage}</p>}</div><div className="actions"><Button className="document-open-button" onClick={() => setSelectedId(document.id)}><Eye size={15} aria-hidden="true"/>{document.status === 'deleting' ? 'Xem trạng thái' : document.extractionCompleted ? 'Xem PDF' : 'Xem trạng thái'}</Button><DeleteDocumentDialog document={document} courseId={courseId} onAccepted={deleting}/></div></li>)}</ul>}
      <nav className="pagination" aria-label="Phân trang tài liệu"><Button disabled={page === 1} onClick={() => setPage(value => value - 1)}>Trang trước</Button><span>Trang {page} · {documents.data.meta.total} tài liệu</span><Button disabled={page * 20 >= documents.data.meta.total} onClick={() => setPage(value => value + 1)}>Trang sau</Button></nav>
    </>}
    {selectedId && <div className="document-detail"><Button onClick={() => setSelectedId(null)}>Đóng nguồn</Button>
      {selected.isPending ? <p role="status">Đang tải trạng thái…</p> : selected.isError ? <StatusPanel title="Không thể mở nguồn" retry={() => selected.refetch()}><p>{selected.error.message}</p></StatusPanel> : <><DocumentStatus document={selected.data}/>
        {selected.data.errorMessage && <p role="alert" className="field-error">{selected.data.errorMessage}</p>}{selected.data.deletionRetryable && <DeleteDocumentDialog document={selected.data} courseId={courseId} onAccepted={deleting}/>}
        {selected.data.extractionCompleted && !['failed','unsupported','deleting','deleted'].includes(selected.data.status) ? <Suspense fallback={<p role="status">Đang tải viewer…</p>}><PdfViewer key={selectedId} document={selected.data}/></Suspense> : <p>{selected.data.status === 'deleted' ? 'Tài liệu đã được xóa.' : selected.data.status === 'deleting' ? 'Tài liệu đang được xóa và không thể mở.' : 'PDF chưa thể mở. Theo dõi trạng thái xử lý hoặc tải lại file hợp lệ nếu có lỗi.'}</p>}</>}
    </div>}
  </section>;
}
