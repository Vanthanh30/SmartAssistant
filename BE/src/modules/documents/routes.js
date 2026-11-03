import { requireOrigin, requireCsrf } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { pdfUpload } from '../../middlewares/upload.js';
import { studentRateLimit } from '../../middlewares/rateLimit.js';
import { idParams } from '../shared/idSchema.js';
import { pageInput } from '../shared/paginationSchema.js';
import { documentsRequestSchemas } from './requestSchema.js';
import { sourceService } from './sourceService.js';
import { documentService } from './service.js';
import { documentController } from './controller.js';
import { studentRouter } from '../shared/studentRouter.js';

export function documentRoutes(pool, auth, config, services = {}) {
  const router = studentRouter(auth, config, ['/documents', '/courses']);
  const schemas = documentsRequestSchemas();
  const service = documentService(pool, config);
  const controller = documentController(service, sourceService(pool, config));
  const params = (key) => validate(idParams(key), 'params', 'ids');
  const mutate = [requireOrigin(config), requireCsrf];
  const limit = services.studentLimit || studentRateLimit();
  const upload = pdfUpload(config);
  router.get(
    '/courses/:courseId/documents',
    params('courseId'),
    validate(pageInput, 'query', 'filters'),
    controller.list,
  );
  router.post(
    '/courses/:courseId/documents',
    ...mutate,
    limit,
    params('courseId'),
    upload,
    controller.upload,
  );
  router.post(
    '/courses/:courseId/documents/restore-index',
    ...mutate,
    params('courseId'),
    controller.restoreIndex,
  );
  router.get('/documents/:documentId', params('documentId'), controller.get);
  router.post(
    '/documents/:documentId/process',
    ...mutate,
    params('documentId'),
    controller.process,
  );
  router.get('/documents/:documentId/content', params('documentId'), controller.content);
  router.delete('/documents/:documentId', ...mutate, params('documentId'), controller.remove);
  router.get(
    '/documents/:documentId/chunks/:chunkId',
    validate(schemas.chunkParams, 'params', 'ids'),
    controller.chunk,
  );
  return router;
}
