import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node extract-pdf.mjs input.pdf pages.json');
  process.exit(2);
}
const started = performance.now();
try {
  const bytes = await readFile(resolve(input));
  const pdfRoot = dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true,
    standardFontDataUrl: `${pdfRoot}/standard_fonts/`, cMapUrl: `${pdfRoot}/cmaps/`, cMapPacked: true });
  const pdf = await task.promise;
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.filter(item => 'str' in item)
        .map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('')
        .normalize('NFC').replace(/[\t ]+/g, ' ').trim();
      pages.push({ pageNumber, text });
      page.cleanup();
    }
  } finally { await task.destroy(); }
  if (!pages.some(page => page.text.trim())) throw new Error('UNSUPPORTED_NO_TEXT');
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(resolve(output), JSON.stringify({ schemaVersion: 1,
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    extractor: 'pdfjs-dist', extractorVersion: '6.4.299',
    pageCount: pages.length, pages, elapsedMs: performance.now() - started }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'passed', pages: pages.length, output: resolve(output) }));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', error: error.message }));
  process.exitCode = 1;
}
