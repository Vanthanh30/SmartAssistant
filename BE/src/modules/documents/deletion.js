import { AppError } from '../../shared/AppError.js';
import { writeAudit } from '../admin/audit.js';
// Actor is supplied by authenticated middleware; admin context includes the current session CSRF token.
export function deletionService(pool) {
  return async (actor, id, context = {}) => {
    if (!['student', 'admin'].includes(actor.role)) throw new AppError(403, 'FORBIDDEN', 'Không có quyền xóa tài liệu.');
    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      if (actor.role === 'admin') {
        const [admins] = await db.execute("SELECT vai_tro,trang_thai FROM nguoi_dung WHERE ma=? FOR UPDATE",[actor.id]);
        if (admins[0]?.role !== 'admin' || admins[0]?.status !== 'active') throw new AppError(403,'ACCOUNT_BLOCKED','Phiên quản trị không còn hợp lệ.');
        const [sessions] = await db.execute("SELECT ma FROM phien_dang_nhap WHERE ma_nguoi_dung=? AND token_chong_csrf=? AND luc_thu_hoi IS NULL AND luc_het_han>UTC_TIMESTAMP(3) FOR UPDATE",[actor.id,context.csrfToken ?? '']);
        if (!sessions.length) throw new AppError(401,'SESSION_EXPIRED','Phiên quản trị đã hết hạn.');
      }
      const [allowed] = await db.execute("SELECT ma FROM tai_lieu WHERE ma=? AND (?='admin' OR ma_nguoi_dung=?)", [id, actor.role, actor.id]);
      if (!allowed.length) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy tài liệu.');
      // Match worker lock order: job rows before document, so deletion cannot race stage commits.
      const [jobs] = await db.execute("SELECT ma,loai_tac_vu,trang_thai FROM tac_vu_pdf WHERE ma_tai_lieu=? ORDER BY ma FOR UPDATE", [id]);
      const document = (await db.execute("SELECT * FROM tai_lieu WHERE ma=? FOR UPDATE", [id]))[0][0];
      if (document.status === 'deleted') { await db.commit(); return { documentId: String(id), status: 'deleted' }; }
      const deletionJob=jobs.find(job=>job.type==='delete_pdf');
      if(document.status==='deleting' && ['queued','running'].includes(deletionJob?.status)){await db.commit();return {documentId:String(id),status:'deleting'};}
      await db.execute("UPDATE tai_lieu SET trang_thai='deleting',ma_loi=NULL,thong_bao_loi=NULL WHERE ma=?", [id]);
      await db.execute("UPDATE tac_vu_pdf SET trang_thai='completed',ma_tien_trinh_khoa=NULL,khoa_den_luc=NULL WHERE ma_tai_lieu=? AND loai_tac_vu<>'delete_pdf' AND trang_thai IN ('queued','running')", [id]);
      await db.execute("INSERT INTO tac_vu_pdf(ma_tai_lieu,loai_tac_vu) VALUES (?,'delete_pdf') ON DUPLICATE KEY UPDATE so_lan_thu=IF(trang_thai IN ('failed','completed'),0,so_lan_thu),luc_chay_tiep=IF(trang_thai IN ('failed','completed'),UTC_TIMESTAMP(3),luc_chay_tiep),loi_gan_nhat=IF(trang_thai IN ('failed','completed'),NULL,loi_gan_nhat),trang_thai=IF(trang_thai IN ('failed','completed'),'queued',trang_thai)", [id]);
      if(actor.role==='admin') await writeAudit(db,{actorId:actor.id,action:document.status==='deleting' ? 'document.delete_retry' : 'document.delete_requested',entityType:'document',entityId:id,
        metadata:{ownerId:String(document.user_id),courseId:String(document.course_id),previousStatus:document.status,status:'deleting'}});
      await db.commit(); return { documentId: String(id), status: 'deleting' };
    } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
  };
}
