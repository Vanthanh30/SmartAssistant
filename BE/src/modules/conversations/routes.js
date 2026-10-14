import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, requireOrigin, requireCsrf } from '../../middlewares/auth.js';
import { validate } from '../../shared/validation.js';
import { sendData } from '../../shared/AppError.js';
import { courseIdSchema } from '../courses/schema.js';
import { conversationService } from './service.js';
import { historyQuerySchema, transcriptQuerySchema } from './schema.js';
const id = courseIdSchema.shape.courseId;
export function conversationRoutes(pool, auth, config) {
  const courses = Router({ mergeParams: true }); const conversations = Router(); const service = conversationService(pool, config);
  for (const router of [courses, conversations]) router.use(requireAuth(auth, config), requireRole('student'), (req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  const mutate = [requireOrigin(config), requireCsrf];
  const list = async(req,res) => { const result=await service.list(req.auth.user.id,{...req.filters,...(req.ids?.courseId ? {courseId:req.ids.courseId} : {})}); res.json({...result,requestId:req.requestId}); };
  conversations.get('/',validate(historyQuerySchema,'query','filters'),list);
  courses.get('/',validate(courseIdSchema,'params','ids'),validate(historyQuerySchema.omit({courseId:true}),'query','filters'),list);
  courses.post('/', ...mutate, validate(courseIdSchema, 'params', 'ids'), validate(z.object({ title: z.string().trim().min(1).max(150).optional() }).strict()),
    async (req,res) => sendData(req,res,await service.create(req.auth.user.id,req.ids.courseId,req.input),201));
  const ids = validate(z.object({ conversationId: id }), 'params','ids');
  conversations.get('/:conversationId', ids, validate(transcriptQuerySchema,'query','filters'), async (req,res) => sendData(req,res,await service.get(req.auth.user.id,req.ids.conversationId,req.filters)));
  conversations.delete('/:conversationId',...mutate,ids,async(req,res) => sendData(req,res,await service.remove(req.auth.user.id,req.ids.conversationId)));
  conversations.post('/:conversationId/questions', ...mutate, ids, validate(z.object({
    question: z.string().transform(v => v.trim().normalize('NFC')).refine(v => [...v].length > 0 && [...v].length <= config.ASK_MAX_QUESTION_CHARS, `Câu hỏi cần 1–${config.ASK_MAX_QUESTION_CHARS} ký tự.`),
    requestId: z.uuid().transform(v => v.toLowerCase()), documentIds: z.array(id).min(1).max(50).refine(v => new Set(v).size === v.length, 'Tài liệu không được trùng.').optional(),
    answerMode: z.enum(['documents','auto','general']).default('auto'),
  }).strict()), async (req,res) => sendData(req,res,await service.ask(req.auth,req.ids.conversationId,req.input)));
  return { courses, conversations };
}
