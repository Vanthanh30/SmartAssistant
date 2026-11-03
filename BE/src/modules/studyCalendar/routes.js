import express from 'express';
import { pushSubscription, pushConfigured } from './push.js';
import { idParams } from '../shared/idSchema.js';
import { studyCalendarRequestSchemas } from './requestSchema.js';
import { requireOrigin, requireCsrf } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { studentRateLimit, calendarSyncRateLimit } from '../../middlewares/rateLimit.js';
import { studyCalendarService } from './service.js';
import { googleConnectionService } from './google/service.js';
import { calendarController } from './controller.js';
import * as schema from './schema.js';
import { studentRouter } from '../shared/studentRouter.js';

export function studyCalendarRoutes(pool, auth, config, services = {}) {
  const router = studentRouter(auth, config, ['/lich-hoc', '/ket-noi/google', '/thong-bao-hoc']);
  const schemas = studyCalendarRequestSchemas();
  const calendar = services.calendar || studyCalendarService(pool, config);
  const controller = calendarController(calendar, googleConnectionService(pool, config), config);
  const params = (key) => validate(idParams(key), 'params', 'ids');
  const body = (value) => validate(value);
  const mutate = [requireOrigin(config), requireCsrf];
  const limit = services.studentLimit || studentRateLimit();
  router.use(['/lich-hoc', '/ket-noi/google', '/thong-bao-hoc'], express.json({ limit: '256kb' }));
  router.get('/lich-hoc', validate(schema.listInput, 'query', 'filters'), controller.list);
  router.get('/lich-hoc/can-dong-bo', controller.syncCandidates);
  router.post('/lich-hoc/goi-y', ...mutate, body(schemas.plan), controller.propose);
  router.post('/lich-hoc/xac-nhan', ...mutate, body(schemas.confirmPlan), controller.confirm);
  router.post('/lich-hoc', ...mutate, body(schemas.session), controller.create);
  router.post(
    '/lich-hoc/:id/goi-y-doi-gio',
    ...mutate,
    params('id'),
    body(schemas.moveSession),
    controller.move,
  );
  router.get('/lich-hoc/:id', params('id'), controller.detail);
  router.post(
    '/lich-hoc/:id/hoi-thoai',
    ...mutate,
    limit,
    params('id'),
    body(schema.sessionConversationInput),
    controller.conversation,
  );
  router.delete('/lich-hoc/:id', ...mutate, params('id'), body(schema.revision), controller.remove);
  router.patch(
    '/lich-hoc/:id',
    ...mutate,
    params('id'),
    body(schemas.patchSession),
    controller.patch,
  );
  router.post(
    '/lich-hoc/:id/hoan-thanh',
    ...mutate,
    params('id'),
    body(schema.revision),
    controller.complete,
  );
  router.post(
    '/lich-hoc/:id/huy',
    ...mutate,
    params('id'),
    body(schema.revision),
    controller.cancel,
  );
  router.post(
    '/lich-hoc/:id/thu-dong-bo',
    ...mutate,
    calendarSyncRateLimit(),
    params('id'),
    body(schema.retryInput),
    controller.retry,
  );
  router.post(
    '/lich-hoc/:id/ngung-dong-bo',
    ...mutate,
    params('id'),
    body(schema.revision),
    controller.stopSync,
  );
  router.post('/lich-hoc/:id/mo-google', ...mutate, params('id'), controller.googleEvent);
  router.get('/ket-noi/google', controller.googleStatus);
  router.post('/ket-noi/google/bat-dau', ...mutate, limit, controller.googleBegin);
  router.get(
    '/ket-noi/google/callback',
    validate(schemas.googleCallback, 'query'),
    controller.googleCallback,
  );
  router.delete('/ket-noi/google', ...mutate, controller.googleDisconnect);
  router.get('/thong-bao-hoc/push', (req, res) =>
    res.json({
      data: { enabled: pushConfigured(config), publicKey: config.WEB_PUSH_PUBLIC_KEY || null },
    }),
  );
  router.post('/thong-bao-hoc/push', ...mutate, body(schema.pushInput), async (req, res) =>
    res.json({ data: await pushSubscription(pool, req.auth.user.id, req.input) }),
  );
  router.get(
    '/thong-bao-hoc',
    validate(schema.notificationQuery, 'query', 'filters'),
    controller.inbox,
  );
  router.post('/thong-bao-hoc/doc-tat-ca', ...mutate, controller.read);
  router.patch(
    '/thong-bao-hoc/:id/doc',
    ...mutate,
    validate(schema.notificationParams, 'params', 'ids'),
    controller.read,
  );
  return router;
}
