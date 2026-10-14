import { Router } from 'express';
import { requireOrigin,requireCsrf } from '../../../middlewares/auth.js';
import { validate } from '../../../shared/validation.js';
import { sendData } from '../../../shared/AppError.js';
import { adminUserRepository } from './repository.js';
import { adminUserService } from './service.js';
import { userIdSchema,userQuerySchema,statusSchema } from './schema.js';
// Mounted only behind app-level requireAuth + requireRole('admin').
export function adminUserRoutes(pool,config){
 const router=Router();const service=adminUserService(pool,adminUserRepository(pool));
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
 router.get('/',validate(userQuerySchema,'query','filters'),async(req,res)=>res.json({...await service.list(req.filters),requestId:req.requestId}));
 router.get('/:userId',validate(userIdSchema,'params','ids'),async(req,res)=>sendData(req,res,await service.get(req.ids.userId)));
 router.patch('/:userId/status',requireOrigin(config),requireCsrf,validate(userIdSchema,'params','ids'),validate(statusSchema),async(req,res)=>sendData(req,res,await service.setStatus(req.auth,req.ids.userId,req.input)));
 return router;
}
