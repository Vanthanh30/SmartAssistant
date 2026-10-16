import { resolve, join } from 'node:path';
import { unlink, readFile, mkdir, writeFile } from 'node:fs/promises';
import { log } from '../../config/logger.js';
export function pdfPath(config, key) {
  if (!/^[a-f0-9-]{36}\.pdf$/.test(key)) throw new Error('INVALID_STORAGE_KEY');
  return join(config.UPLOAD_DIR, key);
}
export function extractionPath(config, key) {
  pdfPath(config, key);
  return resolve(config.UPLOAD_DIR, 'extracted', key + '.json');
}
export async function prepareStorage(config) {
  // Only the bounded pending-upload spool needs local media storage in schema v1.
  const owner=JSON.stringify({host:config.DB_HOST,port:config.DB_PORT,database:config.DB_NAME});
  const binding=join(config.UPLOAD_DIR,'.storage-owner.json');
  await mkdir(join(config.UPLOAD_DIR,'pending'),{recursive:true});
  try { await writeFile(binding,owner,{flag:'wx',mode:0o600}); }
  catch(error) { if(error.code!=='EEXIST')throw error; }
  if(await readFile(binding,'utf8')!==owner)throw new Error('STORAGE_DATABASE_MISMATCH');
}
export async function removeUpload(path) {
  try { await unlink(path); }
  catch (error) { if (error.code !== 'ENOENT') log('api', 'upload-cleanup-failed', { code: error.code }); }
}
