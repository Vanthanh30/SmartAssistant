import { Router } from 'express';
import { sendData } from '../../../shared/AppError.js';
import { dashboardRange,dashboardData } from './service.js';
export function dashboardRoutes(pool,config){const router=Router();router.get('/',async(req,res)=>{res.set('Cache-Control','no-store');sendData(req,res,await dashboardData(pool,config,dashboardRange(req.query)));});return router;}
