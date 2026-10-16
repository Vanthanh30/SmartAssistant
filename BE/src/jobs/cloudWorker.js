import {randomUUID,createHash} from 'node:crypto';
import {cloudPublicId,cloudBuffer,uploadCloudBuffer,destroyCloudAsset} from '../integrations/cloudinary.js';
import {readPendingPdf,removePendingPdf} from './pendingPdf.js';
import {log} from '../config/logger.js';
export async function deleteDocumentCloud(pool,config,id){
 const [rows]=await pool.execute("SELECT * FROM tai_lieu WHERE ma=?",[id]);const d=rows[0];
 if(d?.ma_tep_dam_may)await destroyCloudAsset(config,{public_id:d.cloud_public_id,resource_type:d.cloud_resource_type,cloud_name:config.CLOUDINARY_CLOUD_NAME});
 await removePendingPdf(config,d.storage_key);
}
export async function processCloudQueue(pool,config){
 const db=await pool.getConnection();let job;let lost=false;let renewing=false;let heartbeat;
 try{
  await db.beginTransaction();
  const [rows]=await db.query("SELECT * FROM tac_vu_pdf WHERE loai_tac_vu='upload_pdf' AND ((trang_thai='queued' AND luc_chay_tiep<=UTC_TIMESTAMP(3)) OR (trang_thai='running' AND khoa_den_luc<=UTC_TIMESTAMP(3))) ORDER BY ma LIMIT 1 FOR UPDATE SKIP LOCKED");
  if(!rows.length){await db.commit();return false;}job=rows[0];
  const [docs]=await db.execute("SELECT * FROM tai_lieu WHERE ma=? FOR UPDATE",[job.document_id]);const d=docs[0];
  if(d.deleted_at||['deleting','deleted'].includes(d.status)){await db.execute("UPDATE tac_vu_pdf SET trang_thai='completed',ma_tien_trinh_khoa=NULL,khoa_den_luc=NULL WHERE ma=?",[job.id]);await db.commit();return true;}
  if(job.attempts>=config.JOB_MAX_ATTEMPTS){await db.execute("UPDATE tac_vu_pdf SET trang_thai='failed',loi_gan_nhat='UPLOAD_ATTEMPTS_EXHAUSTED' WHERE ma=?",[job.id]);await db.execute("UPDATE tai_lieu SET trang_thai='failed',ma_loi='UPLOAD_ATTEMPTS_EXHAUSTED',thong_bao_loi='Tải PDF hết số lần thử.' WHERE ma=?",[d.id]);await db.commit();return true;}
  job.locked_by=randomUUID();job.attempts++;
  await db.execute("UPDATE tac_vu_pdf SET trang_thai='running',so_lan_thu=?,ma_tien_trinh_khoa=?,khoa_den_luc=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE ma=?",[job.attempts,job.locked_by,config.JOB_LEASE_SECONDS,job.id]);await db.commit();
  heartbeat=setInterval(async()=>{if(renewing)return;renewing=true;try{const [r]=await pool.execute("UPDATE tac_vu_pdf SET khoa_den_luc=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE ma=? AND trang_thai='running' AND ma_tien_trinh_khoa=? AND khoa_den_luc>UTC_TIMESTAMP(3)",[config.JOB_LEASE_SECONDS,job.id,job.locked_by]);if(!r.affectedRows)lost=true;}catch{lost=true;}finally{renewing=false;}},config.JOB_LEASE_SECONDS*1000/3);
  const asset={public_id:cloudPublicId(config,d.storage_key,'documents'),cloud_name:config.CLOUDINARY_CLOUD_NAME,resource_type:'raw',size_bytes:d.size_bytes,sha256:d.sha256,state:'uploaded'};
  try{await cloudBuffer(config,asset);}catch{const bytes=await readPendingPdf(config,d.storage_key);if(createHash('sha256').update(bytes).digest('hex')!==d.sha256)throw Error('UPLOAD_INTEGRITY_FAILED');await uploadCloudBuffer(config,asset,bytes);}
  if(lost)throw Error('UPLOAD_LEASE_LOST');
  await db.beginTransaction();
  const [live]=await db.execute("SELECT ma FROM tac_vu_pdf WHERE ma=? AND ma_tien_trinh_khoa=? AND trang_thai='running' AND khoa_den_luc>UTC_TIMESTAMP(3) FOR UPDATE",[job.id,job.locked_by]);
  const [current]=await db.execute("SELECT * FROM tai_lieu WHERE ma=? FOR UPDATE",[d.id]);
  if(!live.length)throw Error('UPLOAD_LEASE_LOST');
  if(current[0].deleted_at||['deleting','deleted'].includes(current[0].status)){await db.rollback();await destroyCloudAsset(config,asset);return true;}
  await db.execute("UPDATE tai_lieu SET ma_tep_dam_may=?,loai_tep_dam_may=? WHERE ma=?",[asset.public_id,'raw',d.id]);
  await db.execute("UPDATE tac_vu_pdf SET trang_thai='completed',ma_tien_trinh_khoa=NULL,khoa_den_luc=NULL,loi_gan_nhat=NULL WHERE ma=?",[job.id]);
  await db.execute("INSERT INTO tac_vu_pdf(ma_tai_lieu,loai_tac_vu) VALUES(?,'extract_pdf') ON DUPLICATE KEY UPDATE ma_tai_lieu=VALUES(ma_tai_lieu)",[d.id]);await db.commit();await removePendingPdf(config,d.storage_key);return true;
 }catch(error){await db.rollback();if(job?.locked_by){const retry=job.attempts<config.JOB_MAX_ATTEMPTS;await db.execute("UPDATE tac_vu_pdf SET trang_thai=?,loi_gan_nhat='CLOUD_UPLOAD_FAILED',ma_tien_trinh_khoa=NULL,khoa_den_luc=NULL,luc_chay_tiep=TIMESTAMPADD(SECOND,30,UTC_TIMESTAMP(3)) WHERE ma=? AND ma_tien_trinh_khoa=? AND trang_thai='running'",[retry?'queued':'failed',job.id,job.locked_by]);if(!retry)await db.execute("UPDATE tai_lieu SET trang_thai='failed',ma_loi='CLOUD_UPLOAD_FAILED',thong_bao_loi='Không tải được PDF lên Cloudinary.' WHERE ma=? AND luc_xoa IS NULL AND trang_thai='queued'",[job.document_id]);}log('worker','upload-failed',{code:error.code||'UPLOAD_FAILED'});return true;
 }finally{clearInterval(heartbeat);db.release();}
}
