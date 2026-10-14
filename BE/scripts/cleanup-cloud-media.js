import {readFile,lstat,unlink} from 'node:fs/promises';
import {join,resolve,sep,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {loadConfig} from '../src/config/env.js';
import {createPool} from '../src/config/db.js';
import {cloudBuffer} from '../src/integrations/cloudinary.js';
const config=loadConfig(),pool=createPool(config);const apply=process.argv.includes('--apply');
if(apply&&!process.argv.includes('--maintenance'))throw new Error('Stop old API/worker first, then pass --maintenance.');
const safe=async(root,name)=>{const path=resolve(root,name);if(!path.startsWith(resolve(root)+sep))throw Error('OUTSIDE_MEDIA_ROOT');const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink())throw Error('NOT_REGULAR_FILE');return {path,size:info.size};};
try{
 if(apply){const [jobs]=await pool.query("SELECT COUNT(*) total FROM processing_jobs WHERE status='running'");if(Number(jobs[0].total))throw Error('ACTIVE_WORKER_JOBS');}
 const [assets]=await pool.query("SELECT a.*,d.status document_status,d.extraction_key FROM cloud_assets a LEFT JOIN documents d ON d.id=a.document_id WHERE a.state='uploaded'");
 const targets=[];
 for(const asset of assets){
  if(!/^[a-f0-9-]{36}\.(pdf|webp)$/.test(asset.storage_key))throw Error('INVALID_KEY');
  await cloudBuffer(config,asset); // Confirm current private original before touching local copies.
  const root=asset.document_id?config.UPLOAD_DIR:config.AVATAR_DIR;
  try{const file=await safe(root,asset.storage_key);const bytes=await readFile(file.path);if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error('LOCAL_HASH_MISMATCH');targets.push(file);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(asset.document_status==='ready'&&/^[a-f0-9-]{36}\.pdf\.json\.[a-f0-9-]{36}$/.test(asset.extraction_key||''))try{const file=await safe(join(root,'extracted'),asset.extraction_key);const value=JSON.parse(await readFile(file.path,'utf8'));if(value.sourceSha256!==asset.sha256)throw Error('EXTRACTION_HASH_MISMATCH');targets.push(file);}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 console.log(JSON.stringify({mode:apply?'apply':'preview',files:targets.length,bytes:targets.reduce((sum,x)=>sum+x.size,0),paths:targets.map(x=>relative(config.UPLOAD_DIR,x.path))}));
 if(apply){for(const file of targets)await unlink(file.path);console.log('Removed verified obsolete media copies; FAISS/vector/backups untouched.');}

}finally{await pool.end();}
