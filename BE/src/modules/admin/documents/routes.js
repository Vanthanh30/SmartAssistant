import { Router } from 'express';
import { requireOrigin,requireCsrf } from '../../../middlewares/auth.js';
import { validate } from '../../../shared/validation.js';
import { sendData } from '../../../shared/AppError.js';
import { documentIdSchema } from '../../documents/schema.js';
import { sendPdfContent } from '../../documents/controller.js';
import { deletionService } from '../../documents/deletion.js';
import { adminDocumentQuerySchema,courseFilterQuerySchema } from './schema.js';
import { adminDocumentRepository } from './repository.js';
import { adminDocumentService } from './service.js';
// App mounts this router exclusively after requireAuth/requireRole('admin').
export function adminDocumentRoutes(pool,config){
 const router=Router();const service=adminDocumentService(adminDocumentRepository(pool),config,deletionService(pool));
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
 router.get('/',validate(adminDocumentQuerySchema,'query','filters'),async(req,res)=>res.json({...await service.list(req.filters),requestId:req.requestId}));
 router.get('/courses',validate(courseFilterQuerySchema,'query','filters'),async(req,res)=>res.json({...await service.courses(req.filters),requestId:req.requestId}));
 const ids=validate(documentIdSchema,'params','ids');
 router.get('/:documentId',ids,async(req,res)=>sendData(req,res,await service.get(req.ids.documentId)));
 router.get('/:documentId/content',ids,async(req,res)=>sendPdfContent(req,res,await service.content(req.ids.documentId)));
 router.delete('/:documentId',requireOrigin(config),requireCsrf,ids,async(req,res)=>sendData(req,res,await service.remove(req.auth,req.ids.documentId),202));
 return router;
}
