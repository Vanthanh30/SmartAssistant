import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { startPdfExtraction } from '../src/rag/pdfExtractor.js';

// Local, read-only inspection. No DB, Cloudinary, Gemini, embedding or FAISS.
const path = process.argv.find((arg) => arg.startsWith('--pdf='))?.slice(6);
if (!path) throw Error('Usage: node scripts/inspect-pdf-layout.js --pdf="C:/path/document.pdf"');
if ((await stat(path)).size > 50 * 1024 ** 2)
  throw Error('PDF exceeds the 50 MiB inspection limit');
const bytes = await readFile(path),
  sha256 = createHash('sha256').update(bytes).digest('hex');
const task = startPdfExtraction(
  bytes,
  { sha256 },
  { PDF_MAX_PAGES: 1000, PDF_MAX_TEXT_CHARS: 5000000, PDF_EXTRACTION_TIMEOUT_MS: 60000 },
);
try {
  const result = await task.promise;
  console.log(
    JSON.stringify(
      {
        sha256,
        layoutVersion: result.layoutVersion,
        pageCount: result.pageCount,
        warnings: result.layout.warnings,
        capabilities: result.layout.capabilities,
        detailsOmitted: result.layout.detailsOmitted === true,
        pages: result.layout.pages.map((p) => ({
          pageNumber: p.pageNumber,
          columns: p.columns,
          warnings: p.warnings,
          blocks: p.blockCount ?? p.blocks.length,
          tables: p.blocks.filter((b) => b.kind === 'table').length,
          formulaBlocks: p.blocks.filter((b) => b.kind === 'formula').length,
          continuedTables: p.blocks.filter((b) => b.continuationOf).length,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await task.cancel();
}
