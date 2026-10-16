import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
export const pendingPath=(config,key)=>{if(!/^[a-f0-9-]{36}\.pdf$/.test(key))throw new Error('INVALID_UPLOAD_KEY');return join(config.UPLOAD_DIR,'pending',key);};
export async function writePendingPdf(config,key,bytes){await mkdir(join(config.UPLOAD_DIR,'pending'),{recursive:true});await writeFile(pendingPath(config,key),bytes,{flag:'wx',mode:0o600});}
export const readPendingPdf=(config,key)=>readFile(pendingPath(config,key));
export async function removePendingPdf(config,key){try{await unlink(pendingPath(config,key));}catch(error){if(error.code!=='ENOENT')throw error;}}
