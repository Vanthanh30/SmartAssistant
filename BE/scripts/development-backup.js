import {spawn} from 'node:child_process';
import {existsSync,createReadStream} from 'node:fs';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import mysql from 'mysql2/promise';
export function localDevelopment(config){
 if(config.NODE_ENV!=='development'||!['localhost','127.0.0.1','::1'].includes(config.DB_HOST))throw Error('LOCAL_DEVELOPMENT_REQUIRED');
}
export async function backupDevelopment(config){
 localDevelopment(config);if(!['smart_assistant','tro_ly_hoc_tap'].includes(config.DB_NAME))throw Error('PROJECT_DATABASE_REQUIRED');
 const directory=resolve(import.meta.dirname,'../storage/backups',config.DB_NAME+'-'+Date.now());await mkdir(directory,{recursive:true});
 const dump=directory+'/database.sql';
 function binary(name){const windows='C:/Program Files/MySQL/MySQL Server 8.0/bin/'+name+'.exe';return process.platform==='win32'&&existsSync(windows)?windows:name;}
 const args=['--host='+config.DB_HOST,'--port='+config.DB_PORT,'--user='+config.DB_USER,'--default-character-set=utf8mb4'];
 function run(name,extra,input){return new Promise((resolveRun,reject)=>{const child=spawn(binary(name),[...args,...extra],{env:{...process.env,MYSQL_PWD:config.DB_PASSWORD},windowsHide:true,stdio:['pipe','ignore','pipe']});child.stderr.resume();child.on('error',reject);child.on('exit',code=>code===0?resolveRun():reject(Error('DATABASE_BACKUP_COMMAND_FAILED')));if(input)createReadStream(input).pipe(child.stdin);else child.stdin.end();});}
 await run('mysqldump',['--single-transaction','--routines','--events','--triggers','--hex-blob','--set-gtid-purged=OFF','--result-file='+dump,config.DB_NAME]);
 if((await stat(dump)).size<1000)throw Error('EMPTY_BACKUP');
 const db=await mysql.createConnection({host:config.DB_HOST,port:config.DB_PORT,user:config.DB_USER,password:config.DB_PASSWORD,database:config.DB_NAME});
 const scratch='study_restore_check_'+Date.now();
 try{
  const [tables]=await db.query('SHOW TABLES');const names=tables.map(row=>Object.values(row)[0]);const counts={};
  for(const name of names)counts[name]=Number((await db.query('SELECT COUNT(*) n FROM `'+name+'`'))[0][0].n);
  await db.query('CREATE DATABASE `'+scratch+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');await run('mysql',['--database='+scratch],dump);
  for(const name of names)if(Number((await db.query('SELECT COUNT(*) n FROM `'+scratch+'`.`'+name+'`'))[0][0].n)!==counts[name])throw Error('RESTORE_CHECK_FAILED');
  const manifest={database:config.DB_NAME,dump,sha256:createHash('sha256').update(await readFile(dump)).digest('hex'),counts,restoreVerified:true};
  await writeFile(directory+'/manifest.json',JSON.stringify(manifest,null,2),{mode:0o600});await db.query('DROP DATABASE `'+scratch+'`');return manifest;
 }finally{await db.end();}
}
