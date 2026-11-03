import { sendData } from '../../shared/AppError.js';
import { sendPdfContent } from '../documents/pdfController.js';
export function adminController(service) {
  return {
    listUsers: async (req, res) =>
      res.json({
        ...(await service.listUsers({ filters: req.filters })),
        requestId: req.requestId,
      }),
    userDetail: async (req, res) => sendData(req, res, await service.userDetail({ ids: req.ids })),
    updateUserStatus: async (req, res) =>
      sendData(
        req,
        res,
        await service.updateUserStatus({ ids: req.ids, auth: req.auth, input: req.input }),
      ),
    listDocuments: async (req, res) =>
      res.json({
        ...(await service.listDocuments({ filters: req.filters })),
        requestId: req.requestId,
      }),
    listCourses: async (req, res) =>
      res.json({
        ...(await service.listCourses({ filters: req.filters })),
        requestId: req.requestId,
      }),
    documentDetail: async (req, res) =>
      sendData(req, res, await service.documentDetail({ params: req.params })),
    documentContent: async (req, res) =>
      sendPdfContent(req, res, await service.documentContent({ params: req.params })),
    removeDocument: async (req, res) =>
      sendData(req, res, await service.removeDocument({ params: req.params, auth: req.auth })),
    dashboard: async (req, res) =>
      sendData(req, res, await service.dashboard({ query: req.query })),
  };
}
