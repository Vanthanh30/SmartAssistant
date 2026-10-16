import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { pdfContent } from './api.js';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/ui/Button.jsx';
GlobalWorkerOptions.workerSrc = workerUrl;
const assets = `${import.meta.env.BASE_URL}pdfjs/`;
export function PdfViewer({ document, initialPage = 1, loadContent = pdfContent, compact = false }) {
  const canvas = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [pdf, setPdf] = useState(null);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); let task; let disposed = false;
    (async () => {
      try {
        const response = await loadContent(document.id, abort.signal);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (disposed) return;
        task = getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true,
          standardFontDataUrl: assets + 'standard_fonts/', cMapUrl: assets + 'cmaps/', cMapPacked: true, wasmUrl: assets + 'wasm/' });
        const loaded = await task.promise; if (!disposed) { setPage(Math.max(1, Math.min(initialPage, loaded.numPages))); setPdf(loaded); }
      } catch (failure) { if (!disposed) { setError(failure.message); setLoading(false); } }
    })();
    return () => { disposed = true; abort.abort(); void task?.destroy(); };
  }, [document.id, initialPage, retry, loadContent]);
  useEffect(() => {
    if (!pdf) return;
    let disposed = false; let render;
    (async () => {
      try {
        const source = await pdf.getPage(page); if (disposed || !canvas.current) return;
        const base = source.getViewport({ scale: 1 });
        if (![base.width, base.height].every(value => Number.isFinite(value) && value > 0)) throw new Error('INVALID_PAGE_SIZE');
        const available = Math.max(100, Math.min(canvas.current.parentElement.clientWidth - 24, 1000));
        // Bound canvas memory for PDFs with extreme page dimensions (max8M device pixels).
        const scale = Math.min(2, available / base.width, 2000 / base.height);
        const viewport = source.getViewport({ scale });
        const element = canvas.current; const ratio = Math.min(window.devicePixelRatio || 1, 2);
        element.width = Math.floor(viewport.width * ratio); element.height = Math.floor(viewport.height * ratio);
        element.style.width = `${viewport.width}px`; element.style.height = `${viewport.height}px`;
        render = source.render({ canvasContext: element.getContext('2d'), viewport, transform: ratio !== 1 ? [ratio,0,0,ratio,0,0] : null });
        await render.promise; if (!disposed) setLoading(false);
      } catch (failure) { if (!disposed && failure.name !== 'RenderingCancelledException') { setError('Không thể hiển thị trang PDF này.'); setLoading(false); } }
    })();
    return () => { disposed = true; render?.cancel(); };
  }, [pdf, page, expanded]);
  const navigate = next => { setLoading(true); setPage(next); setError(''); };
  const content = <>
    {error ? <p role="alert" className="field-error">{error} <Button onClick={() => { setPdf(null); setPage(1); setError(''); setLoading(true); setRetry(value => value + 1); }}>Thử lại</Button></p> : <>
      <div className="pdf-controls"><Button disabled={!pdf || page <= 1 || loading} onClick={() => navigate(page - 1)}>Trang trước</Button><span>Trang {page}/{pdf?.numPages ?? '…'}</span><Button disabled={!pdf || page >= pdf.numPages || loading} onClick={() => navigate(page + 1)}>Trang sau</Button></div>
      {loading && <p role="status">Đang mở PDF…</p>}<div className="pdf-canvas"><canvas ref={canvas} role="img" aria-label={`Nội dung PDF trang ${page}`}/></div>
      {!compact && <p className="hint">Viewer hiển thị trang PDF; hình, bảng và công thức có thể khác nội dung văn bản trích xuất.</p>}</>}
  </>;
  return <section className="pdf-viewer" aria-label={`Xem PDF ${document.fileName}`}>
    {!compact && <h3>{document.fileName}</h3>}
    <Button onClick={() => { setLoading(true); setExpanded(true); }}>Phóng lớn PDF</Button>
    {!expanded && content}
    <Modal open={expanded} onOpenChange={value => { setLoading(true); setExpanded(value); }}
      title={document.fileName} description="Xem tài liệu PDF ở khung lớn. Nhấn Escape hoặc Đóng để trở lại."
      className="pdf-expanded-modal">
      <div className="actions"><Button onClick={() => { setLoading(true); setExpanded(false); }}>Đóng</Button></div>
      {expanded && content}
    </Modal>
  </section>;
}
