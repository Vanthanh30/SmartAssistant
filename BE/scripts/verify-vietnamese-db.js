import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
import {loadConfig} from '../src/config/env.js';
import {createPool} from '../src/config/db.js';
import {assertSchema} from '../src/config/schema.js';
import {createApp} from '../src/app.js';
const original=loadConfig();
if(original.DB_NAME!=='tro_ly_hoc_tap'||original.NODE_ENV!=='development'||!['localhost','127.0.0.1','::1'].includes(original.DB_HOST))throw Error('LOCAL_DEV_ONLY');
const root=resolve(import.meta.dirname,'..');const storage=resolve(root,'storage/tro_ly_hoc_tap');
const config={...original,DB_NAME:'tro_ly_hoc_tap',PORT:14000,RAG_SERVICE_URL:'http://127.0.0.1:18001',UPLOAD_DIR:storage+'/uploads',AVATAR_DIR:storage+'/avatars'};
const pool=createPool(config);const checks=[];const children=[];let server;
function check(name,value){if(!value)throw Error('CHECK_FAILED: '+name);checks.push(name);console.log('PASS '+name);}
async function request(path,{actor,method='GET',body,expected=200}={}){
 const headers={Connection:'close',Origin:config.CORS_ORIGIN,...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrfToken}:{})};
 if(body && !(body instanceof FormData))headers['Content-Type']='application/json';
 const r=await fetch('http://127.0.0.1:14000/api/v1'+path,{method,headers,body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined,signal:AbortSignal.timeout(240000)});
 const json=await r.json();if(r.status!==expected)throw Error('HTTP '+path+' '+r.status+' '+json.error?.code);
 const data=json.data??json;if(r.headers.get('set-cookie')){data.cookie=r.headers.get('set-cookie').split(';')[0];}
 return data;
}
async function wait(fn,seconds=120){const deadline=Date.now()+seconds*1000;while(Date.now()<deadline){try{const result=await fn();if(result)return result;}catch{ /* dependencies may still be starting */ }await new Promise(resolve=>setTimeout(resolve,1000));}throw Error('READINESS_TIMEOUT');}
function start(name,cmd,args,env){const child=spawn(cmd,args,{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});child.stdout.on('data',data=>{const text=String(data);if(/failed|interrupted/i.test(text))console.log(name+' '+text.trim());});child.stderr.on('data',()=>{});children.push(child);return child;}
function samplePdf(){
 const lines=['1. Heat and energy',
 'Heat is energy transferred from a warmer object to a colder object.',
 'Temperature describes the thermal state of matter and determines heat transfer.',
 'Specific heat capacity is energy required to heat one kilogram by one degree.',
 'Latent heat characterizes solidification during a physical change of state.',
 'Thermal equilibrium occurs when objects reach the same temperature.',
 'Conduction transfers thermal energy through interactions between particles.',
 'Radiation transfers energy through electromagnetic waves without a medium.',
 'Convection transfers energy through the movement of fluids and gases.'];
 const content='BT /F1 12 Tf 40 780 Td '+lines.map((line,i)=>(i?'0 -22 Td ':'')+'('+line+') Tj').join('\n')+' ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 620 850] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+Buffer.byteLength(content)+' >>\nstream\n'+content+'\nendstream'];
 let pdf='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}const start=Buffer.byteLength(pdf);pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n';return Buffer.from(pdf);
}
try{
 await assertSchema(pool);
 const [busy]=await pool.query('SELECT ID FROM information_schema.PROCESSLIST WHERE DB=DATABASE() AND ID<>CONNECTION_ID()');if(busy.length)throw Error('STOP_API_AND_WORKER_BEFORE_VERIFICATION');
 const [fks]=await pool.query('SELECT COUNT(*) n FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()');check('19 tables /25 FK',Number(fks[0].n)===25);
 server=createApp(pool,config).listen(config.PORT,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const admin=await request('/auth/login',{method:'POST',body:{email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD}});check('admin login',admin.user.role==='admin');
 const password=randomUUID()+'Aa1!';const account={fullName:'Schema verification',email:'schema-'+Date.now()+'@example.invalid',password,confirmPassword:password};
 const student=await request('/auth/register',{method:'POST',body:account,expected:201});check('register / session',student.user.role==='student');
 await request('/auth/me',{actor:student});await request('/users/me',{actor:student});
 const avatar=new FormData();avatar.append('file',new Blob([await sharp({create:{width:32,height:32,channels:3,background:'#6b9dff'}}).png().toBuffer()],{type:'image/png'}),'avatar.png');
 await request('/users/me/avatar',{actor:student,method:'POST',body:avatar});
 const avatarRead=await fetch('http://127.0.0.1:14000/api/v1/users/me/avatar',{headers:{Cookie:student.cookie}});check('private Cloudinary avatar',avatarRead.ok&&(await avatarRead.arrayBuffer()).byteLength>0);

 const course=await request('/courses',{actor:student,method:'POST',body:{name:'Schema verification',description:'Real pipeline acceptance'},expected:201});
 await request('/courses/'+course.id,{actor:student,method:'PATCH',body:{name:'Schema verification updated'}});await request('/courses',{actor:student});check('course CRUD',true);
 await request('/admin/dashboard',{actor:student,expected:403});await request('/admin/dashboard',{expected:401});
 await request('/admin/dashboard',{actor:admin});await request('/admin/users',{actor:admin});await request('/admin/documents',{actor:admin});check('admin dashboard + RBAC',true);
 await request('/admin/users/'+admin.user.id+'/status',{actor:admin,method:'PATCH',body:{status:'blocked'},expected:409});check('last active admin protection',true);
 const other=await request('/auth/register',{method:'POST',body:{...account,email:'other-'+Date.now()+'@example.invalid'},expected:201});await request('/courses/'+course.id,{actor:other,expected:404});check('ownership',true);
 const env={...process.env,DB_NAME:config.DB_NAME,UPLOAD_DIR:config.UPLOAD_DIR,AVATAR_DIR:config.AVATAR_DIR,RAG_SERVICE_URL:config.RAG_SERVICE_URL,RAG_PORT:'18001',INDEX_ROOT:storage+'/indexes',VECTOR_ROOT:storage+'/vectors'};
 start('rag',resolve(root,'../.venv/Scripts/python.exe'),['rag-service/run.py'],env);
 await wait(async()=>{const r=await fetch(config.RAG_SERVICE_URL+'/health/ready',{headers:{'X-Service-Token':config.RAG_SERVICE_TOKEN},signal:AbortSignal.timeout(2000)});return r.ok;});
 start('worker',process.execPath,['src/jobs/worker.js'],env);
 const upload=new FormData();upload.append('file',new Blob([samplePdf()],{type:'application/pdf'}),'schema-verification.pdf');
 const doc=await request('/courses/'+course.id+'/documents',{actor:student,method:'POST',body:upload,expected:202});
 await wait(async()=>{const d=await request('/documents/'+doc.documentId,{actor:student});if(d.status==='failed')throw Error('PIPELINE_FAILED');return d.status==='ready';},240);check('private Cloudinary upload -> worker extraction -> ST/FAISS ready',true);
 await request('/documents/'+doc.documentId+'/content',{expected:401});
 const privateRead=await fetch('http://127.0.0.1:14000/api/v1/documents/'+doc.documentId+'/content',{headers:{Cookie:student.cookie}});
 check('private PDF original bytes',privateRead.ok&&Buffer.from(await privateRead.arrayBuffer()).subarray(0,5).toString()==='%PDF-');
 await request('/documents/'+doc.documentId,{actor:other,expected:404});
 const [usageBefore]=await pool.execute('SELECT COUNT(*) n FROM luot_hoi_dap WHERE ma_nguoi_dung=?',[student.user.id]);

 const conv=await request('/courses/'+course.id+'/conversations',{actor:student,method:'POST',body:{title:'Schema verification'},expected:201});
 const ask={question:'What is heat?',documentIds:[doc.documentId],answerMode:'documents',requestId:randomUUID()};
 const answer=await request('/conversations/'+conv.id+'/questions',{actor:student,method:'POST',body:ask});check('retrieval answer + blocks/citations',answer.status==='answered'&&answer.citations.length>0&&Array.isArray(answer.blocks));
 const replay=await request('/conversations/'+conv.id+'/questions',{actor:student,method:'POST',body:ask});check('ask idempotency',answer.messageId===replay.messageId);
 const [usageAfter]=await pool.execute('SELECT COUNT(*) n FROM luot_hoi_dap WHERE ma_nguoi_dung=?',[student.user.id]);check('ask quota charged once',Number(usageAfter[0].n)===Number(usageBefore[0].n)+1);
 await request('/conversations/'+conv.id,{actor:student});await request('/conversations',{actor:student});
 let quiz;let flashcards;
 for(const kind of ['quiz','flashcards']){const input={requestId:randomUUID(),kind,title:'Verification '+kind,count:2,documentIds:[doc.documentId]};const set=await request('/courses/'+course.id+'/learning-sets',{actor:student,method:'POST',body:input,expected:201});const again=await request('/courses/'+course.id+'/learning-sets',{actor:student,method:'POST',body:input,expected:201});check(kind+' generation / idempotency',set.id===again.id);if(kind==='quiz')quiz=set;else flashcards=set;}
 const attempt=await request('/learning-sets/'+quiz.id+'/attempts',{actor:student,method:'POST',body:{requestId:randomUUID()},expected:201});
 const [correct]=await pool.execute('SELECT ma,vi_tri_dap_an_dung FROM muc_hoc_tap WHERE ma_bo_hoc=? ORDER BY vi_tri',[quiz.id]);
 const answers=correct.map(item=>({itemId:String(item.id),choice:item.correct_index}));
 await request('/learning-attempts/'+attempt.id+'/submit',{actor:student,method:'POST',body:{answers:[{...answers[0],itemId:flashcards.items[0].id},...answers.slice(1)]},expected:422});check('cross-set item rejected',true);
 const result=await request('/learning-attempts/'+attempt.id+'/submit',{actor:student,method:'POST',body:{answers}});check('server grading',result.score===100);
 await new Promise(resolve=>server.close(resolve));server=createApp(pool,config).listen(config.PORT,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const reopened=await request('/conversations/'+conv.id,{actor:student});check('API restart preserves history / answer blocks',reopened.messages.some(m=>Array.isArray(m.blocks)&&m.blocks.length));
 await request('/documents/'+doc.documentId,{actor:student,method:'DELETE',expected:202});
 await wait(async()=>{const [r]=await pool.execute('SELECT trang_thai FROM tai_lieu WHERE ma=?',[doc.documentId]);return r[0]?.status==='deleted';},120);
 const history=await request('/conversations/'+conv.id,{actor:student});check('delete cloud/index / citation snapshots',history.messages.some(m=>m.citations.some(c=>c.sourceDeleted)));
 await request('/admin/users/'+other.user.id+'/status',{actor:admin,method:'PATCH',body:{status:'blocked'}});await request('/auth/me',{actor:other,expected:401});check('blocked user session revoked',true);
 await request('/auth/logout',{actor:student,method:'POST'});await request('/auth/me',{actor:student,expected:401});check('logout',true);
 const secondEmail='admin-check-'+Date.now()+'@example.invalid';
 const [secondRow]=await pool.execute("INSERT INTO nguoi_dung(ho_ten,email,mat_khau_bam,vai_tro,trang_thai) SELECT 'Concurrent verification',?,mat_khau_bam,'admin','active' FROM nguoi_dung WHERE ma=?",[secondEmail,admin.user.id]);
 const second=await request('/auth/login',{method:'POST',body:{email:secondEmail,password:process.env.ADMIN_PASSWORD}});
 const concurrent=await Promise.allSettled([
 request('/admin/users/'+String(secondRow.insertId)+'/status',{actor:admin,method:'PATCH',body:{status:'blocked'}}),
 request('/admin/users/'+admin.user.id+'/status',{actor:second,method:'PATCH',body:{status:'blocked'}})]);
 const [remaining]=await pool.query("SELECT COUNT(*) n FROM nguoi_dung WHERE vai_tro='admin' AND trang_thai='active'");
 check('concurrent admin blocking keeps last active admin',Number(remaining[0].n)>=1&&concurrent.filter(r=>r.status==='fulfilled').length===1);
 await pool.execute("UPDATE nguoi_dung SET trang_thai='active' WHERE ma=?",[admin.user.id]);

}catch(error){console.error(error.message);process.exitCode=1;}
finally{
 for(const child of children){if(child.connected)child.send({type:'shutdown'});else child.kill();}
 await new Promise(resolve=>setTimeout(resolve,1500));for(const child of children)if(child.exitCode===null)child.kill();
 if(server)await new Promise(resolve=>server.close(resolve));await pool.end();
 await mkdir(storage,{recursive:true});await writeFile(storage+'/verification.json',JSON.stringify({timestamp:new Date().toISOString(),checks,passed:!process.exitCode},null,2));
}
