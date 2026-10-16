import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDocument, GlobalWorkerOptions, OPS, Util } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { api } from '../../lib/api.js';
import { pdfContent } from '../documents/api.js';
import { useAuth } from '../auth/useAuth.js';
import { Button } from '../../components/ui/Button.jsx';
import { locateFormulaRegion, pdfImageBoxes, locateBlockRegion } from './formulaRegion.js';

GlobalWorkerOptions.workerSrc = workerUrl;
const assets = `${import.meta.env.BASE_URL}pdfjs/`;

export function FormulaImage({ citation, question, onOpen, onImageReady, block, onRegion, duplicate = false, mergedRegion, cropKey, onCropReady }) {
  const { data: auth } = useAuth();
  const host = useRef(null);
  const renderedImage = useRef(null);
  const [visible, setVisible] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [failedUrl, setFailedUrl] = useState(null);
  const imageKey = block?.id || `${citation.documentId}:${citation.chunkId}`;
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '150px' });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const image = useQuery({
    queryKey: ['formula-image', auth?.user.id, citation.documentId, citation.chunkId, imageKey, block?.source, question, mergedRegion],
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
        if (block?.source && citation.pageTo > from + 3) return null;
        const to = Math.min(pdf.numPages, citation.pageTo, from + 3);
        for (let pageNumber = from; pageNumber <= to; pageNumber++) {
          signal.throwIfAborted();
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1 });
          const content = await page.getTextContent();
          const illustration = /hình ảnh|hình minh họa|sơ đồ|biểu đồ|đồ thị/i.test(question);
          const imageBoxes = illustration ? pdfImageBoxes(await page.getOperatorList(), viewport, OPS, Util) : [];
          const region = block?.source ? locateBlockRegion(content.items, viewport, block.source) : locateFormulaRegion(content.items, viewport, question, imageBoxes);
          if (region && block?.source && best) return null;
          if (region && (!best || region.score > best.region.score)) best = { page, pageNumber, region };
        }
        if (!best) return null;
        signal.throwIfAborted();
        const { page, pageNumber, region: originalRegion } = best;
        // The union comes only from regions located in this same private PDF.
        const viewport = page.getViewport({ scale: 1 });
        const validUnion = mergedRegion && mergedRegion.documentId === citation.documentId
          && mergedRegion.page === pageNumber && mergedRegion.left >= 0 && mergedRegion.top >= 0
          && mergedRegion.width > 0 && mergedRegion.height > 0
          && mergedRegion.left + mergedRegion.width <= viewport.width
          && mergedRegion.top + mergedRegion.height <= viewport.height;
        const region = validUnion ? mergedRegion : originalRegion;
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
        return { url: canvas.toDataURL('image/png'), page: pageNumber, region: originalRegion, displayRegion: region, merged: !!validUnion };
      } finally { await task.destroy(); }
    },
  });
  useEffect(() => {
    const data=image.data;
    if(data?.region)onRegion?.(imageKey,{documentId:citation.documentId,page:data.page,...data.region});
  },[image.data,imageKey,citation.documentId,onRegion]);
  const imageUrl = !citation.sourceDeleted && !image.isError ? image.data?.url : undefined;
  useEffect(() => {
    return () => { if (cropKey) onCropReady?.(cropKey, false); };
  }, [cropKey, onCropReady]);
  useEffect(() => {
    // A cropped data URL alone is not proof that the browser displayed the image.
    const node = renderedImage.current;
    const ready = !!imageUrl && node?.src === imageUrl && node.complete && node.naturalWidth > 0 && node.naturalHeight > 0;
    onImageReady?.(imageKey, ready);
    if (cropKey) onCropReady?.(cropKey, ready && !!image.data?.merged);
    return () => onImageReady?.(imageKey, false);
  }, [imageUrl, imageKey, onImageReady, cropKey, onCropReady, image.data?.merged]);
  let preview;
  if (citation.sourceDeleted) preview = <p className="hint">Không thể mở ảnh vùng tài liệu: nguồn đã bị xóa.</p>;
  else if (!visible || image.isPending) preview = <p role="status" className="hint">Đang lấy ảnh vùng tài liệu từ PDF…</p>;
  else if (image.isError) preview = <p className="hint">Không tải được vùng ảnh. <Button onClick={() => image.refetch()}>Thử lại</Button> Nguồn đối chiếu nằm cuối câu trả lời.</p>;
  else if (!image.data) preview = <p className="hint">Chưa xác định được vùng ảnh phù hợp; nguồn đối chiếu nằm cuối câu trả lời.</p>;
  else if (failedUrl === image.data.url) preview = <p className="hint">Không hiển thị được ảnh vùng tài liệu. <Button onClick={() => { setFailedUrl(null); void image.refetch(); }}>Thử lại</Button> <Button onClick={() => onOpen({ ...citation, pageFrom: image.data.page, pageTo: image.data.page })}>Mở trang PDF {image.data.page}</Button></p>;
  else preview = <figure className="formula-image"><figcaption>{block?.relatedTheory ? 'Đoạn lý thuyết liên quan' : 'Vùng nguồn công thức'} · trang {image.data.page}</figcaption>
    <button type="button" style={{ width: zoomed ? undefined : `${image.data.displayRegion.width * 4 / 3}px`, maxWidth: '100%' }} className={`formula-image-open ${zoomed ? 'is-zoomed' : ''}`} onClick={() => onOpen({ ...citation, pageFrom: image.data.page, pageTo: image.data.page })} aria-label={`Mở vùng tài liệu gốc trang ${image.data.page}`}>
      <img ref={renderedImage} src={image.data.url} alt={`Vùng công thức/hình ảnh trong ${citation.fileName}, trang ${image.data.page}`} loading="lazy"
        onLoad={event => {
          const ready = event.currentTarget.naturalWidth > 0 && event.currentTarget.naturalHeight > 0;
          onImageReady?.(imageKey, ready);
          if (cropKey) onCropReady?.(cropKey, ready && image.data.merged);
        }}
        onError={() => { setFailedUrl(image.data.url); onImageReady?.(imageKey, false); if (cropKey) onCropReady?.(cropKey, false); }}/>
    </button><div className="actions"><Button onClick={() => setZoomed(value => !value)} aria-pressed={zoomed}>{zoomed ? 'Thu nhỏ' : 'Phóng to'}</Button><span className="hint">Nhấn ảnh để mở trang gốc.</span></div></figure>;
  return <div ref={host} className="formula-preview" hidden={duplicate}>{preview}</div>;
}
