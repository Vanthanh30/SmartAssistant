import { parentPort, workerData } from 'node:worker_threads';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { locateBlockRegion } from '../../../FE/src/features/chat/pdfFormulaRegion.js';
let task;
try {
  if (
    !workerData.sha256 ||
    createHash('sha256').update(Buffer.from(workerData.bytes)).digest('hex') !== workerData.sha256
  )
    throw Error('PDF_INTEGRITY_FAILED');
  const root = dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));
  task = getDocument({
    data: new Uint8Array(workerData.bytes),
    isEvalSupported: false,
    useSystemFonts: true,
    standardFontDataUrl: root + '/standard_fonts/',
    cMapUrl: root + '/cmaps/',
    cMapPacked: true,
    wasmUrl: root + '/wasm/',
  });
  const pdf = await task.promise,
    source = workerData.source;
  let best;
  if (
    !Number.isSafeInteger(source.pageFrom) ||
    !Number.isSafeInteger(source.pageTo) ||
    source.pageFrom < 1 ||
    source.pageTo > pdf.numPages ||
    source.pageTo < source.pageFrom ||
    source.pageTo - source.pageFrom > 3
  )
    throw Error('AMBIGUOUS_FORMULA');
  for (let number = source.pageFrom; number <= Math.min(source.pageTo, pdf.numPages); number++) {
    const page = await pdf.getPage(number),
      viewport = page.getViewport({ scale: 1 }),
      content = await page.getTextContent(),
      region = locateBlockRegion(content.items, viewport, source);
    if (region) {
      if (best) throw Error('AMBIGUOUS_FORMULA');
      best = { page, region, number };
    }
  }
  if (!best) throw Error('FORMULA_REGION_NOT_FOUND');
  const { page, region, number } = best,
    scale = Math.min(2.5, Math.sqrt(4000000 / (region.width * region.height)));
  const canvas = createCanvas(Math.ceil(region.width * scale), Math.ceil(region.height * scale));
  await page.render({
    canvas,
    canvasContext: canvas.getContext('2d'),
    viewport: page.getViewport({ scale }),
    transform: [1, 0, 0, 1, -region.left * scale, -region.top * scale],
    background: 'white',
  }).promise;
  const png = canvas.toBuffer('image/png');
  if (png.length > 2 * 1024 ** 2) throw Error('FORMULA_IMAGE_TOO_LARGE');
  parentPort.postMessage({ ok: true, bytes: png, region, page: number });
} catch (e) {
  parentPort.postMessage({ ok: false, code: e.message });
} finally {
  await task?.destroy();
}
