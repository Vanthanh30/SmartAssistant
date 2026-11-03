import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AppError } from '../../shared/AppError.js';
import { parseRange } from './parseRange.js';
export async function sendPdfContent(req, res, file) {
  let range;
  try {
    range = parseRange(req.headers.range, file.size);
  } catch (error) {
    res.set('Content-Range', `bytes */${file.size}`);
    throw error;
  }
  res.set({
    'Content-Type': 'application/pdf',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `inline; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, '%27')}`,
    'Content-Security-Policy': "sandbox; default-src 'none'",
  });
  if (range) res.status(206).set('Content-Range', `bytes ${range.start}-${range.end}/${file.size}`);
  res.set('Content-Length', String(range ? range.end - range.start + 1 : file.size));
  if (req.method === 'HEAD') return res.end();
  try {
    await pipeline(
      Readable.from(range ? file.buffer.subarray(range.start, range.end + 1) : file.buffer),
      res,
    );
  } catch {
    if (!res.destroyed && !res.headersSent)
      throw new AppError(404, 'PDF_FILE_UNAVAILABLE', 'Không thể đọc file PDF.');
  }
}
