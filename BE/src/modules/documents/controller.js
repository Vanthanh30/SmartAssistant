import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AppError, sendData } from '../../shared/AppError.js';
export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new AppError(416, 'INVALID_RANGE', 'Khoảng byte không hợp lệ.');
  let start, end;
  if (!match[1]) { const suffix = Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix < 1) throw new AppError(416, 'INVALID_RANGE', 'Khoảng byte không hợp lệ.'); start = Math.max(0, size - suffix); end = size - 1; }
  else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1; }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw new AppError(416, 'INVALID_RANGE', 'Khoảng byte không hợp lệ.');
  return { start, end };
}
export async function sendPdfContent(req,res,file) {
      let range;
      try { range = parseRange(req.headers.range, file.size); }
      catch (error) { res.set('Content-Range', `bytes */${file.size}`); throw error; }
      res.set({ 'Content-Type': 'application/pdf', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `inline; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, '%27')}`,
        'Content-Security-Policy': "sandbox; default-src 'none'" });
      if (range) res.status(206).set('Content-Range', `bytes ${range.start}-${range.end}/${file.size}`);
      res.set('Content-Length', String(range ? range.end - range.start + 1 : file.size));
      if (req.method === 'HEAD') return res.end();
      try { await pipeline(Readable.from(range?file.buffer.subarray(range.start,range.end+1):file.buffer), res); }
      catch { if (!res.destroyed && !res.headersSent) throw new AppError(404, 'PDF_FILE_UNAVAILABLE', 'Không thể đọc file PDF.'); }
}
export function documentController(service, deleteDocument) {
  return {
    remove: async (req, res) => sendData(req, res, await deleteDocument(req.auth.user, req.ids.documentId), 202),
    checkCourse: async (req, res, next) => { await service.course(req.auth.user.id, req.ids.courseId); next(); },
    get: async (req, res) => sendData(req, res, await service.get(req.auth.user.id, req.ids.documentId)),
    list: async (req, res) => res.json({ ...await service.list(req.auth.user.id, req.ids.courseId, req.filters), requestId: req.requestId }),
    upload: async (req, res) => sendData(req, res, await service.upload(req.auth.user.id, req.ids.courseId, req.file), 202),
    async content(req, res) {
      // Authentication and ownership are checked before Range parsing or filesystem access.
      const file = await service.content(req.auth.user.id, req.ids.documentId);
      return sendPdfContent(req,res,file);
    },
  };
}
