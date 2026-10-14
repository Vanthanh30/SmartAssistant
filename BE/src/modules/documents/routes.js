import { Router } from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { requireAuth, requireRole, requireOrigin, requireCsrf } from '../../middlewares/auth.js';
import { AppError } from '../../shared/AppError.js';
import { validate } from '../../shared/validation.js';
import { courseIdSchema } from '../courses/schema.js';
import { documentIdSchema, documentQuerySchema } from './schema.js';
import { documentRepository } from './repository.js';
import { documentService } from './service.js';
import { documentController } from './controller.js';
import { removeUpload } from './storage.js';
import { deletionService } from './deletion.js';
import { z } from 'zod';
import { sendData } from '../../shared/AppError.js';
let activePdfUploads=0;
export function documentRoutes(pool, auth, config) {
  const courseDocuments = Router({ mergeParams: true });
  const documents = Router();
  const deleteDocument = deletionService(pool);
  const controller = documentController(documentService(documentRepository(pool), config), deleteDocument);
  for (const router of [courseDocuments, documents]) router.use(requireAuth(auth, config), requireRole('student'), (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const upload = multer({ storage: multer.memoryStorage(),
    limits: { fileSize: config.MAX_UPLOAD_MB * 1024 ** 2, files: 1, fields: 0, parts: 1 },
    fileFilter: (req, file, callback) => callback(file.mimetype === 'application/pdf' && /\.pdf$/i.test(file.originalname) ? null : new AppError(422, 'INVALID_PDF_TYPE', 'Chỉ nhận file .pdf với MIME application/pdf.'), true) }).single('file');
  const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, keyGenerator: req => req.auth.user.id,
    standardHeaders: 'draft-8', legacyHeaders: false, handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', 'Quá nhiều lần tải PDF. Vui lòng thử lại sau.')) });
  courseDocuments.get('/', validate(courseIdSchema, 'params', 'ids'), validate(documentQuerySchema, 'query', 'filters'), controller.list);
  courseDocuments.post('/', requireOrigin(config), requireCsrf, validate(courseIdSchema, 'params', 'ids'), controller.checkCourse, limit,
    (req, res, next) => {
      if(activePdfUploads>=3)return next(new AppError(503,'UPLOAD_BUSY','Hệ thống đang xử lý nhiều file; vui lòng thử lại.'));
      activePdfUploads++;req.uploadKind='pdf';
      upload(req,res,async error=>{try{if(error)return next(error);await controller.upload(req,res);}catch(failure){next(failure);}finally{activePdfUploads--;}});
    });
  documents.get('/:documentId', validate(documentIdSchema, 'params', 'ids'), controller.get);
  documents.get('/:documentId/chunks/:chunkId', validate(z.object({ documentId: courseIdSchema.shape.courseId, chunkId: z.string().regex(/^[a-f0-9]{64}$/) }), 'params', 'ids'), async (req,res) => {
    const [rows] = await pool.execute("SELECT ch.* FROM chunks ch JOIN documents d ON d.id=ch.document_id WHERE ch.id=? AND d.id=? AND d.user_id=? AND d.status='ready' AND d.deleted_at IS NULL", [req.ids.chunkId, req.ids.documentId, req.auth.user.id]);
    if (!rows.length) throw new AppError(404,'SOURCE_NOT_FOUND','Nguồn không còn khả dụng.');
    const ch = rows[0]; sendData(req,res,{ chunkId: ch.id, documentId: String(ch.document_id), content: ch.content, pageFrom: ch.page_from, pageTo: ch.page_to });
  });
  documents.delete('/:documentId', requireOrigin(config), requireCsrf, validate(documentIdSchema, 'params', 'ids'),
    controller.remove);
  documents.get('/:documentId/content', validate(documentIdSchema, 'params', 'ids'), controller.content);
  for (const router of [courseDocuments, documents]) router.use(async (error, req, res, next) => { if (req.file?.path) await removeUpload(req.file.path); next(error); });
  return { courseDocuments, documents };
}
