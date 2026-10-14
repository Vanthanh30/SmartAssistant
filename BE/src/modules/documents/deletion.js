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
        const [admins] = await db.execute('SELECT role,status FROM users WHERE id=? FOR UPDATE',[actor.id]);
        if (admins[0]?.role !== 'admin' || admins[0]?.status !== 'active') throw new AppError(403,'ACCOUNT_BLOCKED','Phiên quản trị không còn hợp lệ.');
        const [sessions] = await db.execute('SELECT id FROM auth_sessions WHERE user_id=? AND csrf_token=? AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE',[actor.id,context.csrfToken ?? '']);
        if (!sessions.length) throw new AppError(401,'SESSION_EXPIRED','Phiên quản trị đã hết hạn.');
      }
      const [allowed] = await db.execute("SELECT id FROM documents WHERE id=? AND (?='admin' OR user_id=?)", [id, actor.role, actor.id]);
      if (!allowed.length) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy tài liệu.');
      // Match worker lock order: job rows before document, so deletion cannot race stage commits.
      const [jobs] = await db.execute('SELECT id,type,status FROM processing_jobs WHERE document_id=? ORDER BY id FOR UPDATE', [id]);
      const document = (await db.execute('SELECT * FROM documents WHERE id=? FOR UPDATE', [id]))[0][0];
      if (document.status === 'deleted') { await db.commit(); return { documentId: String(id), status: 'deleted' }; }
      const deletionJob=jobs.find(job=>job.type==='delete_pdf');
      if(document.status==='deleting' && ['queued','running'].includes(deletionJob?.status)){await db.commit();return {documentId:String(id),status:'deleting'};}
      await db.execute("UPDATE documents SET status='deleting',error_code=NULL,error_message=NULL WHERE id=?", [id]);
      await db.execute("UPDATE processing_jobs SET status='completed',locked_by=NULL,locked_until=NULL WHERE document_id=? AND type<>'delete_pdf' AND status IN ('queued','running')", [id]);
      await db.execute("INSERT INTO processing_jobs(document_id,type) VALUES (?,'delete_pdf') ON DUPLICATE KEY UPDATE attempts=IF(status IN ('failed','completed'),0,attempts),next_run_at=IF(status IN ('failed','completed'),UTC_TIMESTAMP(3),next_run_at),last_error=IF(status IN ('failed','completed'),NULL,last_error),status=IF(status IN ('failed','completed'),'queued',status)", [id]);
      if(actor.role==='admin') await writeAudit(db,{actorId:actor.id,action:document.status==='deleting' ? 'document.delete_retry' : 'document.delete_requested',entityType:'document',entityId:id,
        metadata:{ownerId:String(document.user_id),courseId:String(document.course_id),previousStatus:document.status,status:'deleting'}});
      await db.commit(); return { documentId: String(id), status: 'deleting' };
    } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
  };
}
