import mysql from 'mysql2/promise';
import {readFile,writeFile} from 'node:fs/promises';
import {loadConfig} from '../src/config/env.js';
import {backupDevelopment,localDevelopment} from './development-backup.js';
import {sqlStatements} from './sql-statements.js';
const c=loadConfig();localDevelopment(c);
if(c.DB_NAME!=='tro_ly_hoc_tap'||process.argv[2]!=='--confirm=tro_ly_hoc_tap')throw Error('Use db:reset -- --confirm=tro_ly_hoc_tap only while backend/worker are stopped');
const inspector=await mysql.createConnection({host:c.DB_HOST,port:c.DB_PORT,user:c.DB_USER,password:c.DB_PASSWORD});
try{
 const [busy]=await inspector.execute('SELECT ID FROM information_schema.PROCESSLIST WHERE DB=?',[c.DB_NAME]);if(busy.length)throw Error('STOP_API_AND_WORKER_FIRST');
 const backup=await backupDevelopment(c);console.log('Verified private backup: '+backup.dump);
 await inspector.query('DROP DATABASE `tro_ly_hoc_tap`');await inspector.query('CREATE DATABASE `tro_ly_hoc_tap` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');await inspector.query('USE `tro_ly_hoc_tap`');
 for(const statement of sqlStatements(await readFile(new URL('../database/schema.sql',import.meta.url),'utf8')))await inspector.query(statement);
 const envPath=new URL('../.env',import.meta.url);let env=await readFile(envPath,'utf8');const scope='tro_ly_hoc_tap/reset-'+Date.now();
 for(const [key,value]of Object.entries({UPLOAD_DIR:'./storage/'+scope+'/uploads',AVATAR_DIR:'./storage/'+scope+'/avatars',INDEX_ROOT:'../storage/'+scope+'/indexes',VECTOR_ROOT:'../storage/'+scope+'/vectors'})){
  const pattern=new RegExp('^'+key+'=.*$','m');env=pattern.test(env)?env.replace(pattern,key+'='+value):env+'\n'+key+'='+value+'\n';
 }
 await writeFile(envPath,env);console.log('Schema recreated; isolated namespace updated. Old Cloudinary media untouched, scoped orphan reconciliation handles unreferenced assets after grace. Run npm run db:seed then npm run dev.');
}finally{await inspector.end();}
