import { queueDocumentMail } from '../../integrations/email.js';
import { enqueueCloudAsset } from '../../integrations/cloudinary.js';
import { AppError } from '../../shared/AppError.js';
export function documentRepository(pool) {
  return {
    async cloudUploaded(id){await pool.execute("UPDATE cloud_assets SET state=IF(state='uploading','uploaded',state),uploaded_at=UTC_TIMESTAMP(3),locked_until=NULL WHERE document_id=?",[id]);},
    async cloudFailed(id,config){const db=await pool.getConnection();try{await db.beginTransaction();await db.execute("UPDATE cloud_assets SET state='deleting',locked_until=NULL,next_run_at=UTC_TIMESTAMP(3) WHERE document_id=?",[id]);await db.execute("UPDATE documents SET status='failed',error_code='CLOUDINARY_UPLOAD_FAILED',error_message='Không lưu được PDF lên Cloudinary; hãy tải lại.' WHERE id=? AND status='queued'",[id]);await db.execute("UPDATE processing_jobs SET status='failed',last_error='CLOUDINARY_UPLOAD_FAILED' WHERE document_id=? AND type='extract_pdf' AND status='queued'",[id]);await queueDocumentMail(db,id,'failed',config);await db.commit();}catch(error){await db.rollback();throw error;}finally{db.release();}},
    async course(owner, courseId) { return (await pool.execute('SELECT id FROM courses WHERE id=? AND user_id=?', [courseId, owner]))[0][0]; },
    async get(owner, id) { return (await pool.execute("SELECT d.*,(SELECT public_id FROM cloud_assets WHERE document_id=d.id) cloud_public_id,(SELECT cloud_name FROM cloud_assets WHERE document_id=d.id) cloud_name,(SELECT state FROM cloud_assets WHERE document_id=d.id) cloud_storage_status,(SELECT j.status FROM processing_jobs j WHERE j.document_id=d.id AND j.type='delete_pdf') AS deletion_job_status FROM documents d WHERE d.id=? AND d.user_id=?", [id, owner]))[0][0]; },
    async list(owner, courseId, { page, pageSize }) {
      const connection = await pool.getConnection();
      try {
        await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); await connection.beginTransaction();
        const [count] = await connection.execute('SELECT COUNT(*) AS total FROM documents WHERE user_id=? AND course_id=? AND deleted_at IS NULL', [owner, courseId]);
        const [rows] = await connection.query("SELECT d.*,(SELECT public_id FROM cloud_assets WHERE document_id=d.id) cloud_public_id,(SELECT cloud_name FROM cloud_assets WHERE document_id=d.id) cloud_name,(SELECT state FROM cloud_assets WHERE document_id=d.id) cloud_storage_status,(SELECT j.status FROM processing_jobs j WHERE j.document_id=d.id AND j.type='delete_pdf') AS deletion_job_status FROM documents d WHERE d.user_id=? AND d.course_id=? AND d.deleted_at IS NULL ORDER BY d.created_at DESC,d.id DESC LIMIT ? OFFSET ?", [owner, courseId, pageSize, (page - 1) * pageSize]);
        await connection.commit(); return { rows, total: Number(count[0].total) };
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async create(owner, courseId, input, config) {
      const connection = await pool.getConnection();
      let committing = false;
      try {
        await connection.beginTransaction();
        // Serialize quota checks per owner, including concurrent uploads to different courses.
        const [users] = await connection.execute('SELECT id,status FROM users WHERE id=? FOR UPDATE', [owner]);
        if (!users.length || users[0].status !== 'active') throw new AppError(403, 'ACCOUNT_BLOCKED', 'Tài khoản không còn quyền tải tài liệu.');
        const [courses] = await connection.execute('SELECT id FROM courses WHERE id=? AND user_id=?', [courseId, owner]);
        if (!courses.length) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy môn học.');
        const [usage] = await connection.execute("SELECT COALESCE(SUM(size_bytes),0) AS user_bytes,COALESCE(SUM(IF(course_id=?,size_bytes,0)),0) AS course_bytes,SUM(course_id=?) AS course_count FROM documents WHERE user_id=? AND deleted_at IS NULL", [courseId, courseId, owner]);
        const row = usage[0];
        if (Number(row.course_count) >= config.MAX_DOCUMENTS_PER_COURSE || Number(row.user_bytes) + input.size > config.MAX_USER_STORAGE_MB * 1024 ** 2 || Number(row.course_bytes) + input.size > config.MAX_COURSE_STORAGE_MB * 1024 ** 2) throw new AppError(429, 'DOCUMENT_QUOTA_EXCEEDED', 'Đã vượt số tài liệu hoặc dung lượng lưu trữ cho phép.');
        const [result] = await connection.execute('INSERT INTO documents(course_id,user_id,original_name,storage_key,size_bytes,sha256) VALUES (?,?,?,?,?,?)', [courseId, owner, input.name, input.key, input.size, input.sha256]);
        const id = String(result.insertId);
        await connection.execute("INSERT INTO processing_jobs(document_id,type) VALUES (?,'extract_pdf')", [id]);
        await enqueueCloudAsset(connection,config,{key:input.key,owner,documentId:id,size:input.size,sha256:input.sha256});
        committing = true; await connection.commit(); return { documentId: id, status: 'queued' };
      } catch (error) {
        error.commitOutcomeUnknown = committing;
        try { await connection.rollback(); } catch { /* preserve the original failure and uncertainty */ }
        throw error;
      }
      finally { connection.release(); }
    },
  };
}
