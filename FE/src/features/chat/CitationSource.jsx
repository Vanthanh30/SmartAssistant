import { lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../auth/useAuth.js';
import { Button } from '../../components/ui/Button.jsx';
import { getDocument } from '../documents/api.js';
const PdfViewer = lazy(() => import('../documents/PdfViewer.jsx').then(module => ({ default: module.PdfViewer })));

export function CitationSource({ citation, close, inline = false }) {
  const { data: auth } = useAuth();
  const source = useQuery({ queryKey: ['chat','source',auth?.user.id,citation.documentId,citation.chunkId], retry: false, refetchInterval: 3000,
    enabled: !citation.sourceDeleted && !!citation.documentId && !!citation.chunkId,
    queryFn: async ({ signal }) => {
      await api(`/documents/${citation.documentId}/chunks/${citation.chunkId}`, { signal });
      const document = await getDocument(citation.documentId, signal);
      if (document.status !== 'ready') throw new Error('Nguồn không còn khả dụng.');
      return document;
    } });
  return <aside className={`chat-source${inline ? ' chat-source--inline' : ''}`} aria-label="Nguồn trích dẫn"><div className="chat-heading"><h3>{inline && <span className="citation-source-file">{citation.fileName}</span>}Trang {citation.pageFrom}{citation.pageTo !== citation.pageFrom ? `–${citation.pageTo}` : ''}</h3><Button onClick={close}>Đóng nguồn</Button></div>
    {citation.sourceDeleted ? <p role="status">Tài liệu đã bị xóa hoặc không còn sẵn sàng. Không thể mở trang gốc.</p>
      : source.isPending ? <p role="status">Đang kiểm tra và mở nguồn…</p> : source.isError ? <p role="alert">{source.error.message} <Button onClick={() => source.refetch()}>Kiểm tra lại</Button></p>
        : <Suspense fallback={<p>Đang tải viewer…</p>}><PdfViewer key={`${citation.documentId}:${citation.pageFrom}`} document={source.data} initialPage={citation.pageFrom} compact/></Suspense>}
  </aside>;
}

