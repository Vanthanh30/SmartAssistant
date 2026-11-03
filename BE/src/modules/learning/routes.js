import { requireOrigin, requireCsrf } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { studentRateLimit } from '../../middlewares/rateLimit.js';
import { idParams } from '../shared/idSchema.js';
import { studentRouter } from '../shared/studentRouter.js';
import { learningRequestSchemas } from './requestSchema.js';
import { pageInput } from '../shared/paginationSchema.js';
import { startInput } from './schema.js';
import { learningService } from './service.js';
import { learningController } from './controller.js';

export function learningRoutes(pool, auth, config, services = {}) {
  const router = studentRouter(auth, config, ['/learning-sets', '/learning-attempts', '/courses']);
  const schemas = learningRequestSchemas();
  const controller = learningController(learningService(pool, config));
  const params = (key) => validate(idParams(key), 'params', 'ids');
  const mutate = [requireOrigin(config), requireCsrf];
  const limit = services.studentLimit || studentRateLimit();
  router.get(
    '/courses/:courseId/learning-sets',
    params('courseId'),
    validate(pageInput, 'query', 'filters'),
    controller.list,
  );
  router.post(
    '/courses/:courseId/learning-sets',
    ...mutate,
    limit,
    params('courseId'),
    validate(schemas.createInput),
    controller.create,
  );
  router.get('/learning-sets/:setId', params('setId'), controller.get);
  router.delete('/learning-sets/:setId', ...mutate, params('setId'), controller.remove);
  router.get('/learning-sets/:setId/attempts', params('setId'), controller.attempts);
  router.post(
    '/learning-sets/:setId/attempts',
    ...mutate,
    params('setId'),
    validate(startInput),
    controller.start,
  );
  router.get('/learning-attempts/:attemptId', params('attemptId'), controller.attempt);
  router.post(
    '/learning-attempts/:attemptId/confirm-answer',
    ...mutate,
    params('attemptId'),
    validate(schemas.confirmAnswer),
    controller.confirm,
  );
  router.post(
    '/learning-attempts/:attemptId/submit',
    ...mutate,
    params('attemptId'),
    validate(schemas.submitAnswers),
    controller.submit,
  );
  return router;
}
