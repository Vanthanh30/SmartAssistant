import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { api } from '../../lib/api.js';
import { pdfContent } from '../documents/api.js';
import { useAuth } from '../auth/useAuth.js';
import { Button } from '../../components/ui/Button.jsx';
import { locateFormulaRegion } from './formulaRegion.js';

GlobalWorkerOptions.workerSrc = workerUrl;
const assets = `${import.meta.env.BASE_URL}pdfjs/`;

export function FormulaImage({ citation, question, onOpen, onImageReady }) {
  const { data: auth } = useAuth();
  const host = useRef(null);
  const renderedImage = useRef(null);
  const [visible, setVisible] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [failedUrl, setFailedUrl] = useState(null);
  const imageKey = `${citation.documentId}:${citation.chunkId}`;
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '150px' });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const image = useQuery({
    queryKey: ['formula-image', auth?.user.id, citation.documentId, citation.chunkId, question],
    enabled: visible && !!auth && !citation.sourceDeleted && !!citation.documentId && !!citation.chunkId,
    retry: false, staleTime: 30000, gcTime: 60000,
    queryFn: async ({ signal }) => {
      // Reuse the private chunk/content endpoints; no public URL or new credentials.
      await api(`/documents/${citation.documentId}/chunks/${citation.chunkId}`, { signal });
      const response = await pdfContent(citation.documentId, signal);
      const task = getDocument({ data: new Uint8Array(await response.arrayBuffer()), isEvalSupported: false,
        useSystemFonts: true, standardFontDataUrl: assets + 'standard_fonts/',
        cMapUrl: assets + 'cmaps/', cMapPacked: true, wasmUrl: assets + 'wasm/' });
      try {
        const pdf = await task.promise;
        let best;
        const from = Math.max(1, citation.pageFrom);
        const to = Math.min(pdf.numPages, citation.pageTo, from + 3);
        for (let pageNumber = from; pageNumber <= to; pageNumber++) {
          signal.throwIfAborted();
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1 });
          const content = await page.getTextContent();
          const region = locateFormulaRegion(content.items, viewport, question);
          if (region && (!best || region.score > best.region.score)) best = { page, pageNumber, region };
        }
        if (!best) return null;
        signal.throwIfAborted();
        const { page, pageNumber, region } = best;
        // Render only the cropped canvas; cap at 4M pixels for memory safety.
        const scale = Math.min(2.5, Math.sqrt(4000000 / (region.width * region.height)));
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(region.width * scale); canvas.height = Math.ceil(region.height * scale);
        const render = page.render({ canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale }),
          transform: [1, 0, 0, 1, -region.left * scale, -region.top * scale], background: 'white' });
        const cancel = () => render.cancel();
        signal.addEventListener('abort', cancel, { once: true });
        try { await render.promise; signal.throwIfAborted(); }
        finally { signal.removeEventListener('abort', cancel); }
        return { url: canvas.toDataURL('image/png'), page: pageNumber };
      } finally { await task.destroy(); }
    },
  });
  const imageUrl = !citation.sourceDeleted && !image.isError ? image.data?.url : undefined;
  useEffect(() => {
    // A cropped data URL alone is not proof that the browser displayed the image.
    const node = renderedImage.current;
    onImageReady?.(imageKey, !!imageUrl && node?.src === imageUrl && node.complete && node.naturalWidth > 0 && node.naturalHeight > 0);
    return () => onImageReady?.(imageKey, false);
  }, [imageUrl, imageKey, onImageReady]);
  let preview;
  if (citation.sourceDeleted) preview = <p className="hint">Không thể mở ảnh công thức: nguồn đã bị xóa.</p>;
  else if (!visible || image.isPending) preview = <p role="status" className="hint">Đang lấy ảnh công thức từ PDF…</p>;
  else if (image.isError) preview = <p className="hint">Không thể tải ảnh công thức. <Button onClick={() => image.refetch()}>Thử lại</Button> <Button onClick={() => onOpen(citation)}>Mở trang PDF</Button></p>;
  else if (!image.data) preview = <p className="hint">Chưa xác định được vùng công thức phù hợp. <Button onClick={() => onOpen(citation)}>Mở trang PDF</Button></p>;
  else if (failedUrl === image.data.url) preview = <p className="hint">Không hiển thị được ảnh công thức. <Button onClick={() => { setFailedUrl(null); void image.refetch(); }}>Thử lại</Button> <Button onClick={() => onOpen({ ...citation, pageFrom: image.data.page, pageTo: image.data.page })}>Mở trang PDF {image.data.page}</Button></p>;
  else preview = <figure className="formula-image"><figcaption>Công thức trong tài liệu · trang {image.data.page}</figcaption>
    <button type="button" className={`formula-image-open ${zoomed ? 'is-zoomed' : ''}`} onClick={() => onOpen({ ...citation, pageFrom: image.data.page, pageTo: image.data.page })} aria-label={`Mở công thức gốc trang ${image.data.page}`}>
      <img ref={renderedImage} src={image.data.url} alt={`Vùng công thức trong ${citation.fileName}, trang ${image.data.page}`} loading="lazy"
        onLoad={event => onImageReady?.(imageKey, event.currentTarget.naturalWidth > 0 && event.currentTarget.naturalHeight > 0)}
        onError={() => { setFailedUrl(image.data.url); onImageReady?.(imageKey, false); }}/>
    </button><div className="actions"><Button onClick={() => setZoomed(value => !value)} aria-pressed={zoomed}>{zoomed ? 'Thu nhỏ' : 'Phóng to'}</Button><span className="hint">Nhấn ảnh để mở trang gốc.</span></div></figure>;
  return <div ref={host} className="formula-preview">{preview}</div>;
}
