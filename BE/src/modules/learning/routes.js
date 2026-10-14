import { Router } from 'express';
import { requireAuth, requireRole, requireOrigin, requireCsrf } from '../../middlewares/auth.js';
import { validate } from '../../shared/validation.js';
import { sendData } from '../../shared/AppError.js';
import { learningService } from './service.js';
import { courseParams, setParams, attemptParams, generationInput, pageInput, startInput, answersInput } from './schema.js';
export function learningRoutes(pool, auth, config) {
  const service = learningService(pool,config);
  const courses = Router({ mergeParams: true }); const sets = Router(); const attempts = Router();
  for (const router of [courses,sets,attempts]) router.use(requireAuth(auth,config),requireRole('student'),(req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  const mutate = [requireOrigin(config),requireCsrf];
  courses.get('/',validate(courseParams,'params','ids'),validate(pageInput,'query','filters'),async (req,res) => {
    const result = await service.list(req.auth.user.id,req.ids.courseId,req.filters); res.json({ ...result, requestId: req.requestId });
  });
  courses.post('/',...mutate,validate(courseParams,'params','ids'),validate(generationInput),async (req,res) => sendData(req,res,await service.create(req.auth,req.ids.courseId,req.input),201));
  sets.get('/:setId',validate(setParams,'params','ids'),async (req,res) => sendData(req,res,await service.detail(req.auth.user.id,req.ids.setId)));
  sets.delete('/:setId',...mutate,validate(setParams,'params','ids'),async (req,res) => sendData(req,res,await service.remove(req.auth,req.ids.setId)));
  sets.get('/:setId/attempts',validate(setParams,'params','ids'),async (req,res) => sendData(req,res,await service.attempts(req.auth.user.id,req.ids.setId)));
  sets.post('/:setId/attempts',...mutate,validate(setParams,'params','ids'),validate(startInput),async (req,res) => sendData(req,res,await service.start(req.auth,req.ids.setId,req.input),201));
  attempts.get('/:attemptId',validate(attemptParams,'params','ids'),async (req,res) => sendData(req,res,await service.attemptDetail(req.auth.user.id,req.ids.attemptId)));
  attempts.post('/:attemptId/submit',...mutate,validate(attemptParams,'params','ids'),validate(answersInput),async (req,res) => sendData(req,res,await service.submit(req.auth,req.ids.attemptId,req.input)));
  return { courses, sets, attempts };
}
