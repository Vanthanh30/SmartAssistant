import { resolve, join } from 'node:path';
import { unlink, readFile } from 'node:fs/promises';
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
  // Inspect legacy binding only; cloud-only runtime creates no media directories.
  const owner=JSON.stringify({host:config.DB_HOST,port:config.DB_PORT,database:config.DB_NAME});
  try{if(await readFile(join(config.UPLOAD_DIR,'.storage-owner.json'),'utf8')!==owner)throw new Error('STORAGE_DATABASE_MISMATCH');}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
export async function removeUpload(path) {
  try { await unlink(path); }
  catch (error) { if (error.code !== 'ENOENT') log('api', 'upload-cleanup-failed', { code: error.code }); }
}
