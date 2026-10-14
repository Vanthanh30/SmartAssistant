import { randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import { cloudEnabled, uploadCloudAsset, destroyCloudAsset,cloudBuffer } from '../integrations/cloudinary.js';
import { queueDocumentMail } from '../integrations/email.js';
import { log } from '../config/logger.js';
const lockKey=id=>'cloud-'+createHash('sha256').update(id).digest('hex').slice(0,40);
async function live(db,asset){
  if(asset.document_id)return (await db.execute("SELECT id FROM documents WHERE id=? AND user_id=? AND deleted_at IS NULL AND status NOT IN ('deleting','deleted')",[asset.document_id,asset.user_id]))[0].length>0;
  return (await db.execute('SELECT id FROM users WHERE id=? AND avatar_key=?',[asset.user_id,asset.storage_key]))[0].length>0;
}
export async function deleteDocumentCloud(pool,config,documentId){
  const db=await pool.getConnection();let lock;
  try{
    const [rows]=await db.execute('SELECT * FROM cloud_assets WHERE document_id=?',[documentId]);if(!rows.length)return;
    const asset=rows[0];lock=lockKey(asset.public_id);
    if(Number((await db.execute('SELECT GET_LOCK(?,1) owned',[lock]))[0][0].owned)!==1){lock=null;throw new Error('CLOUD_ASSET_BUSY');}
    await db.execute("UPDATE cloud_assets SET state='deleting',locked_by=NULL,locked_until=NULL,attempts=0 WHERE public_id=?",[asset.public_id]);
    await destroyCloudAsset(config,asset);
    await db.execute("UPDATE cloud_assets SET state='deleted',error_code=NULL,next_run_at=TIMESTAMPADD(MINUTE,10,UTC_TIMESTAMP(3)) WHERE public_id=?",[asset.public_id]);
  }finally{try{if(lock)await db.execute('SELECT RELEASE_LOCK(?)',[lock]);}finally{db.release();}}
}
export async function processCloudQueue(pool,config){
  if(!cloudEnabled(config))return false;
  const db=await pool.getConnection();let asset;let lock;
  try{
    await db.beginTransaction();
    const [rows]=await db.query(`SELECT * FROM cloud_assets WHERE next_run_at<=UTC_TIMESTAMP(3) AND
      (state IN ('queued','deleting','deleted') OR (state='uploading' AND locked_until<=UTC_TIMESTAMP(3)))
      AND (locked_until IS NULL OR locked_until<=UTC_TIMESTAMP(3)) ORDER BY next_run_at,public_id LIMIT 1 FOR UPDATE SKIP LOCKED`);
    if(!rows.length){await db.commit();return false;}
    asset=rows[0];asset.locked_by=randomUUID();
    await db.execute("UPDATE cloud_assets SET locked_by=?,locked_until=TIMESTAMPADD(SECOND,120,UTC_TIMESTAMP(3)),attempts=attempts+1,state=IF(state='queued','uploading',state) WHERE public_id=?",[asset.locked_by,asset.public_id]);
    await db.commit();lock=lockKey(asset.public_id);
    if(Number((await db.execute('SELECT GET_LOCK(?,1) owned',[lock]))[0][0].owned)!==1){lock=null;return true;}
    const [current]=await db.execute('SELECT * FROM cloud_assets WHERE public_id=? AND locked_by=?',[asset.public_id,asset.locked_by]);
    if(!current.length)return true;asset={...current[0]};
    const remove=['deleting','deleted'].includes(asset.state)||!await live(db,asset);
    if(remove){
      await destroyCloudAsset(config,asset);
      await db.execute("UPDATE cloud_assets SET state='deleted',locked_by=NULL,locked_until=NULL,error_code=NULL,next_run_at=? WHERE public_id=? AND locked_by=?",
        [asset.state==='deleted'?null:new Date(Date.now()+600000),asset.public_id,asset.locked_by]);
    }else{
      const path=join(asset.document_id?config.UPLOAD_DIR:config.AVATAR_DIR,asset.storage_key);
      try{await cloudBuffer(config,{...asset,state:'uploaded'});}
      catch{await uploadCloudAsset(config,asset,path);await cloudBuffer(config,{...asset,state:'uploaded'});}
      if(!await live(db,asset)){
        await destroyCloudAsset(config,asset);
        await db.execute("UPDATE cloud_assets SET state='deleted',locked_by=NULL,locked_until=NULL,next_run_at=TIMESTAMPADD(MINUTE,10,UTC_TIMESTAMP(3)) WHERE public_id=? AND locked_by=?",[asset.public_id,asset.locked_by]);
      }else await db.execute("UPDATE cloud_assets SET state=IF(state='deleting','deleting','uploaded'),uploaded_at=UTC_TIMESTAMP(3),locked_by=NULL,locked_until=NULL,error_code=NULL WHERE public_id=? AND locked_by=?",[asset.public_id,asset.locked_by]);
    }
    log('worker','cloud-asset-processed',{kind:asset.document_id?'document':'avatar'});return true;
  }catch(error){
    await db.rollback().catch(()=>{});
    if(asset?.locked_by){
      const retry=asset.attempts<3;
      // Cancellation/deletion may have superseded the upload while the provider was in flight.
      await db.execute("UPDATE cloud_assets SET state=IF(state IN ('deleting','deleted'),state,?),error_code=?,locked_by=NULL,locked_until=NULL,next_run_at=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE public_id=? AND locked_by=?",
        [retry?'queued':'failed',error.code||'CLOUDINARY_UNAVAILABLE',Math.min(300,30*2**asset.attempts),asset.public_id,asset.locked_by]);
      if(!retry&&asset.document_id){
        await db.beginTransaction();
        await db.execute("UPDATE processing_jobs SET status='failed',last_error='CLOUDINARY_UPLOAD_FAILED' WHERE document_id=? AND type='extract_pdf' AND status='queued'",[asset.document_id]);
        await db.execute("UPDATE documents SET status='failed',error_code='CLOUDINARY_UPLOAD_FAILED',error_message='Không thể lưu PDF lên Cloudinary. Hãy kiểm tra cấu hình hoặc tải lại.' WHERE id=? AND status='queued' AND deleted_at IS NULL",[asset.document_id]);
        await queueDocumentMail(db,asset.document_id,'failed',config);await db.commit();
      }
    }
    log('worker','cloud-asset-failed',{code:error.code||'CLOUDINARY_UNAVAILABLE'});return true;
  }finally{
    await db.rollback().catch(()=>{});
    try{if(lock)await db.execute('SELECT RELEASE_LOCK(?)',[lock]);}finally{db.release();}
  }
}
