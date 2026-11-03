import { sendData } from '../../shared/AppError.js';
import { sendPdfContent } from './pdfController.js';

export function documentController(documents, sources) {
  const owner = (req) => req.auth.user.id;
  return {
    list: async (req, res) =>
      res.json({
        ...(await documents.list(owner(req), req.ids.courseId, req.filters)),
        requestId: req.requestId,
      }),
    upload: async (req, res) =>
      sendData(req, res, await documents.upload(req.auth, req.ids.courseId, req.file), 202),
    restoreIndex: async (req, res) =>
      sendData(req, res, await documents.restoreIndex(req.auth, req.ids.courseId)),
    get: async (req, res) =>
      sendData(req, res, await documents.get(owner(req), req.ids.documentId)),
    process: async (req, res) =>
      sendData(req, res, await documents.process(req.auth, req.ids.documentId)),
    content: async (req, res) =>
      sendPdfContent(req, res, await documents.content(owner(req), req.ids.documentId)),
    remove: async (req, res) =>
      sendData(req, res, await documents.remove(req.auth, req.ids.documentId)),
    chunk: async (req, res) => {
      const chunk = await sources.chunk(owner(req), req.ids.documentId, req.ids.chunkId);
      if (!chunk)
        return res
          .status(404)
          .json({ error: { code: 'SOURCE_NOT_FOUND', message: 'Nguồn không còn khả dụng.' } });
      sendData(req, res, {
        chunkId: String(chunk.ma_doan_tai_lieu),
        documentId: req.ids.documentId,
        content: chunk.noi_dung,
        pageFrom: chunk.trang_bat_dau,
        pageTo: chunk.trang_ket_thuc,
      });
    },
  };
}
