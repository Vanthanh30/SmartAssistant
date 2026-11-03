import { api } from '../../lib/api.js';
export const calendarKey=owner=>['study-calendar',owner];
export const loadSessions=(params,signal)=>api('/lich-hoc?'+new URLSearchParams(params),{signal});
export const calendarWrite=(path,body,csrfToken,method='POST')=>api(path,{method,body,csrfToken,timeoutMs:path==='/lich-hoc/goi-y'?180000:30000});
export const toSession=value=>({requestId:value.requestId,courseId:value.courseId||null,title:value.title,goal:value.goal||'',
 start:new Date(value.start).toISOString(),end:new Date(value.end).toISOString(),reminderMinutes:value.reminderMinutes,googleSync:!!value.googleSync,...(value.lesson?{lesson:value.lesson}:{}),...(value.documentId?{documentId:value.documentId,pageFrom:value.pageFrom,pageTo:value.pageTo}:{})});
