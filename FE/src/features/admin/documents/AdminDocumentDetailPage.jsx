import { lazy,Suspense,useState } from 'react';
import { Link,useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/useAuth.js';
import { StatusPanel } from '../../../components/StatusPanel.jsx';
import { DocumentStatus } from '../../documents/DocumentStatus.jsx';
import { DeleteDocumentDialog } from '../../documents/DeleteDocumentDialog.jsx';
import { getAdminDocument,adminPdfContent,deleteAdminDocument,shouldPoll } from './api.js';
const PdfViewer=lazy(()=>import('../../documents/PdfViewer.jsx').then(module=>({default:module.PdfViewer})));
export function AdminDocumentDetailPage(){const {documentId}=useParams();return <DocumentDetail key={documentId} documentId={documentId}/>;}
function DocumentDetail({documentId}){
 const {data:auth}=useAuth();const [showPdf,setShowPdf]=useState(false);const [notice,setNotice]=useState('');const valid=/^[1-9][0-9]{0,19}$/.test(documentId);
 const detail=useQuery({queryKey:['admin','documents','detail',auth.user.id,documentId],enabled:valid,retry:false,queryFn:({signal})=>getAdminDocument(documentId,signal),refetchInterval:query=>showPdf && query.state.data?.extractionCompleted && !['failed','unsupported','deleting','deleted'].includes(query.state.data.status) ? 3000 : shouldPoll(query.state.data) ? Math.min(30000,3000*2**Math.min(query.state.dataUpdateCount,3)) : false});
 if(!valid)return <StatusPanel title="ID tài liệu không hợp lệ"><Link to="/admin/documents">Về tài liệu</Link></StatusPanel>;
 if(detail.isPending)return <StatusPanel title="Đang tải tài liệu…"/>;
 if(detail.isError)return <StatusPanel title={detail.error.status===404 ? 'Không tìm thấy tài liệu' : 'Không thể tải tài liệu'} retry={detail.error.status===404 ? undefined : ()=>detail.refetch()}><p>{detail.error.message}</p><Link to="/admin/documents">Về tài liệu</Link></StatusPanel>;
 const document=detail.data;const viewable=document.extractionCompleted && !['failed','unsupported','deleting','deleted'].includes(document.status);
 return <section className="admin-users-page"><Link to="/admin/documents">← Tài liệu</Link><h1>{document.fileName}</h1><DocumentStatus document={document}/>
  <dl className="admin-user-info"><dt>Người tải</dt><dd><Link to={`/admin/users/${document.uploadedBy.id}`}>{document.uploadedBy.fullName}</Link> · {document.uploadedBy.email}</dd><dt>Môn học</dt><dd>{document.courseName}</dd><dt>Dung lượng</dt><dd>{(document.sizeBytes/1024**2).toFixed(2)} MB</dd><dt>Số trang</dt><dd>{document.pageCount ?? 'Chưa trích xuất'}</dd><dt>Tải lên</dt><dd>{new Date(document.createdAt).toLocaleString('vi-VN')}</dd><dt>Cập nhật</dt><dd>{new Date(document.updatedAt).toLocaleString('vi-VN')}</dd></dl>
  {document.errorMessage && <p role="alert" className="field-error">{document.errorMessage} ({document.errorCode})</p>}
  {document.status==='deleting' && <p role="status">{document.deletionRetryable ? 'Cleanup chưa hoàn tất. Có thể thử xóa lại.' : 'Đang cleanup index, chunk, vector và file. Chưa xóa xong.'}</p>}
  {document.status==='deleted' && <p role="status">Cleanup đã hoàn tất. Nguồn không còn mở được; citation lịch sử giữ snapshot.</p>}
  {notice && document.status!=='deleted' && <p role="status">{notice}</p>}
  <div className="actions"><button disabled={!viewable} onClick={()=>setShowPdf(value=>!value)}>{showPdf && viewable ? 'Đóng PDF' : 'Xem PDF'}</button><DeleteDocumentDialog document={document} queryScope="admin" removeDocument={deleteAdminDocument} onAccepted={()=>{setShowPdf(false);setNotice('Đã tiếp nhận yêu cầu. Theo dõi trạng thái cleanup tại đây.');}}/></div>
  {showPdf && viewable && <Suspense fallback={<p>Đang tải viewer…</p>}><PdfViewer document={document} loadContent={adminPdfContent}/></Suspense>}
 </section>;
}
