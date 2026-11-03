import { useEffect,useState } from 'react';
import { z } from 'zod';
import { localNow } from './dates.js';
const prefix='study-calendar:';
const lessonShape=z.object({difficulty:z.string(),objectives:z.array(z.string()),topics:z.array(z.object({title:z.string(),content:z.string()})),activities:z.array(z.object({kind:z.string(),minutes:z.number(),instruction:z.string()})),resources:z.array(z.object({documentId:z.string(),pageFrom:z.number(),pageTo:z.number(),chunkIds:z.array(z.string()),fileName:z.string()})),quizCount:z.number(),flashcardCount:z.number()});
const documentScope={lesson:lessonShape.optional(),documentIds:z.array(z.string()).optional(),documentId:z.string().optional(),pageFrom:z.number().optional(),pageTo:z.number().optional()};
const windowShape=z.object({day:z.number(),start:z.string(),end:z.string()});
const planShape=z.object({week:z.string(),studyFrom:z.string().optional(),studyTo:z.string().optional(),goals:z.array(z.object({courseId:z.string().nullable(),goal:z.string(),sessions:z.number(),duration:z.number(),priority:z.string(),...documentScope})).max(10),
 free:z.array(windowShape).max(42),busy:z.array(windowShape).max(42),exceptions:z.array(z.object({date:z.string(),allDay:z.boolean(),start:z.string().optional(),end:z.string().optional()})).max(30),
 breakMinutes:z.number(),maxSessionsPerDay:z.number(),maxMinutesPerDay:z.number(),preferred:z.string(),alternate:z.boolean(),reminderMinutes:z.number().nullable(),googleSync:z.boolean(),locked:z.array(z.unknown()).max(60)});
const slotShape=z.object({requestId:z.uuid(),courseId:z.string().nullable(),title:z.string(),goal:z.string(),start:z.iso.datetime({offset:true}),end:z.iso.datetime({offset:true}),reminderMinutes:z.number().nullable(),googleSync:z.boolean(),locked:z.boolean(),exceptionConfirmed:z.boolean().optional(),reason:z.string().optional(),...documentScope});
const draftShape=z.object({schemaVersion:z.literal(1),userId:z.string(),plan:planShape,slots:z.array(slotShape).max(60),dirty:z.boolean()});
export function initialPlan() {return {week:localNow().startOf('week').toISODate(),goals:[{courseId:null,goal:'',sessions:3,duration:60,priority:'normal'}],
 free:[],busy:[],exceptions:[],breakMinutes:10,maxSessionsPerDay:3,maxMinutesPerDay:180,preferred:'none',alternate:true,reminderMinutes:10,googleSync:false,locked:[]};}
export function usePlanDraft(userId,databaseVersion=3) {
 const key=`${prefix}${userId}:draft:v1:db${databaseVersion}`;
 const [draft,setDraft]=useState(()=>{
  try{const value=JSON.parse(sessionStorage.getItem(key));const parsed=draftShape.safeParse(value);if(parsed.success&&parsed.data.userId===userId&&JSON.stringify(value).length<=256000)return parsed.data;}catch{/* invalid private draft ignored */}
  return {schemaVersion:1,userId,plan:initialPlan(),slots:[],dirty:false};
 });
 useEffect(()=>{try{if(draft.dirty)sessionStorage.setItem(key,JSON.stringify(draft));else sessionStorage.removeItem(key);}catch{/* saving disabled/full; in-memory draft still works */}},[draft,key]);
 useEffect(()=>{
  if(!draft.dirty)return;
  const unload=event=>{event.preventDefault();event.returnValue='';};
  const leave=event=>{const link=event.target.closest?.('a[href]');if(link&&new URL(link.href).pathname!==location.pathname&&!window.confirm('Có bản nháp chưa lưu. Rời trang? Bản nháp vẫn được giữ trong phiên này.'))event.preventDefault();};
  window.addEventListener('beforeunload',unload);document.addEventListener('click',leave,true);
  return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',leave,true);};
 },[draft.dirty]);
 return {draft,setDraft,clear:()=>setDraft({schemaVersion:1,userId,plan:initialPlan(),slots:[],dirty:false})};
}
