import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {loadConfig} from '../src/config/env.js';
import {createPool} from '../src/config/db.js';
import {destroyCloudAsset} from '../src/integrations/cloudinary.js';
import {ragClient} from '../src/rag/client.js';
const config=loadConfig();
if(!process.argv.includes('--apply')||!process.argv.includes('--database='+config.DB_NAME))throw Error('Requires --apply --database='+config.DB_NAME);
const pool=createPool(config);let child,db;const locks=[];
const tables=['learning_answers','learning_attempts','learning_citations','learning_items','learning_generation_requests','learning_sets','citations','qa_messages','conversations','document_extractions','processing_jobs','chunks','course_indexes','documents','courses','ask_usage','audit_logs','mail_outbox'];
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
try{
 let ragConfig=config;
 const ready=async c=>{try{return (await fetch(c.RAG_SERVICE_URL+'/health/ready',{headers:{'X-Service-Token':c.RAG_SERVICE_TOKEN},signal:AbortSignal.timeout(3000)})).ok;}catch{return false;}};
 if(!await ready(config)){
  const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  child=spawn(resolve('../.venv/Scripts/python.exe'),['-m','uvicorn','app:create_app','--factory','--host','127.0.0.1','--port',String(port)],{cwd:resolve('rag-service'),windowsHide:true,stdio:'ignore',env:{...process.env,RAG_SERVICE_TOKEN:config.RAG_SERVICE_TOKEN}});
  ragConfig={...config,RAG_SERVICE_URL:'http://127.0.0.1:'+port};let online=false;
  for(let i=0;i<600;i++){if(await ready(ragConfig)){online=true;break;}if(child.exitCode!==null)throw Error('TEMP_RAG_EXITED');await new Promise(resolve=>setTimeout(resolve,200));}
  if(!online)throw Error('RAG_UNAVAILABLE_NO_RESET');
 }
 db=await pool.getConnection();
 const [courses]=await db.query('SELECT id FROM courses ORDER BY id');
 for(const row of courses){const key='rag-course-'+row.id;const [r]=await db.execute('SELECT GET_LOCK(?,10) acquired',[key]);if(Number(r[0].acquired)!==1)throw Error('COURSE_BUSY_NO_RESET');locks.push(key);}
 await db.beginTransaction();const [users]=await db.query('SELECT * FROM users ORDER BY id FOR UPDATE');const userHash=digest(users);
 const [sessions]=await db.query('SELECT * FROM auth_sessions ORDER BY id FOR UPDATE');const sessionHash=digest(sessions);
 const backup={database:config.DB_NAME,createdAt:new Date().toISOString(),accountCount:users.length,tables:{}};
 for(const table of tables)backup.tables[table]=(await db.query('SELECT * FROM ?? FOR UPDATE',[table]))[0];
 const [assets]=await db.query('SELECT * FROM cloud_assets FOR UPDATE');backup.tables.cloud_assets=assets.filter(a=>a.document_id!==null||!users.some(u=>String(u.id)===String(a.user_id)&&u.avatar_key===a.storage_key));
 for(const asset of backup.tables.cloud_assets)if(asset.cloud_name!==config.CLOUDINARY_CLOUD_NAME)throw Error('CLOUD_ACCOUNT_MISMATCH_NO_RESET');
 await mkdir(resolve('storage/backups'),{recursive:true});const path=resolve('storage/backups/manual-reset-business-2026-10-13-'+Date.now()+'.json');await writeFile(path,JSON.stringify(backup),{mode:0o600,flag:'wx'});console.log(JSON.stringify({event:'backup',path,counts:Object.fromEntries(Object.entries(backup.tables).map(([k,v])=>[k,v.length]))}));
 const call=ragClient(ragConfig);
 for(const document of backup.tables.documents)await call('/documents/purge',{owner:String(document.user_id),course:String(document.course_id),document:String(document.id),keepIndexKey:null});
 for(const asset of backup.tables.cloud_assets)await destroyCloudAsset(config,asset);
 for(const asset of backup.tables.cloud_assets)await db.execute('DELETE FROM cloud_assets WHERE public_id=?',[asset.public_id]);
 for(const table of tables)await db.query('DELETE FROM ??',[table]);
 if(digest((await db.query('SELECT * FROM users ORDER BY id'))[0])!==userHash)throw Error('ACCOUNTS_CHANGED');
 if(digest((await db.query('SELECT * FROM auth_sessions ORDER BY id'))[0])!==sessionHash)throw Error('SESSIONS_CHANGED');
 await db.commit();
 const remaining={};for(const table of tables)remaining[table]=Number((await db.query('SELECT COUNT(*) total FROM ??',[table]))[0][0].total);
 console.log(JSON.stringify({event:'reset-verified',database:config.DB_NAME,accounts:users.map(u=>({role:u.role,status:u.status})),accountsUnchanged:digest((await db.query('SELECT * FROM users ORDER BY id'))[0])===userHash,sessionsUnchanged:digest((await db.query('SELECT * FROM auth_sessions ORDER BY id'))[0])===sessionHash,remaining,cloudMediaRemoved:backup.tables.cloud_assets.length,ragDocumentsPurged:backup.tables.documents.length,schemaPreserved:true}));
}catch(error){await db?.rollback().catch(()=>{});console.error('RESET_FAILED',error.code||error.message);process.exitCode=1;}
finally{if(db){for(const key of locks)await db.execute('SELECT RELEASE_LOCK(?)',[key]).catch(()=>{});db.release();}child?.kill();await pool.end();}
