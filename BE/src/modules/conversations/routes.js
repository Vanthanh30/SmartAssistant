import { requireOrigin, requireCsrf } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { studentRateLimit } from '../../middlewares/rateLimit.js';
import { idParams } from '../shared/idSchema.js';
import { studentRouter } from '../shared/studentRouter.js';
import { conversationsRequestSchemas } from './requestSchema.js';
import { historyQuerySchema, transcriptQuerySchema } from './schema.js';
import { sourceService } from '../documents/sourceService.js';
import { conversationService } from './service.js';
import { conversationController } from './controller.js';

export function conversationRoutes(pool, auth, config, services = {}) {
  const router = studentRouter(auth, config, ['/conversations', '/courses']);
  const schemas = conversationsRequestSchemas(config);
  const service = conversationService(pool, config);
  const controller = conversationController(service, sourceService(pool, config));
  const params = (key) => validate(idParams(key), 'params', 'ids');
  const mutate = [requireOrigin(config), requireCsrf];
  const limit = services.studentLimit || studentRateLimit();
  router.get('/conversations', validate(historyQuerySchema, 'query', 'filters'), controller.list);
  router.get(
    '/courses/:courseId/conversations',
    params('courseId'),
    validate(historyQuerySchema.omit({ courseId: true }), 'query', 'filters'),
    controller.listForCourse,
  );
  router.post(
    '/courses/:courseId/conversations',
    ...mutate,
    params('courseId'),
    validate(schemas.createConversation),
    controller.create,
  );
  router.get(
    '/conversations/:conversationId',
    params('conversationId'),
    validate(transcriptQuerySchema, 'query', 'filters'),
    controller.get,
  );
  router.get(
    '/conversations/:conversationId/formulas/:turnId/:blockId',
    validate(schemas.formulaParams, 'params', 'ids'),
    controller.formula,
  );
  router.delete(
    '/conversations/:conversationId',
    ...mutate,
    params('conversationId'),
    controller.remove,
  );
  router.post(
    '/conversations/:conversationId/questions',
    ...mutate,
    limit,
    params('conversationId'),
    validate(schemas.askQuestion),
    controller.ask,
  );
  return router;
}
