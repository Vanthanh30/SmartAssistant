import { AppError } from '../../shared/AppError.js';
export function documentRepository(pool) {
  return {
    async course(owner, courseId) { return (await pool.execute("SELECT ma FROM mon_hoc WHERE ma=? AND ma_nguoi_dung=?", [courseId, owner]))[0][0]; },
    async get(owner, id) { return (await pool.execute("SELECT d.*,d.ma_tep_dam_may ma_tep_dam_may,IF(d.ma_tep_dam_may IS NOT NULL,'uploaded',IF(d.trang_thai='failed','failed','queued')) cloud_storage_status,(SELECT j.trang_thai FROM tac_vu_pdf j WHERE j.ma_tai_lieu=d.ma AND j.loai_tac_vu='delete_pdf') AS deletion_job_status FROM tai_lieu d WHERE d.ma=? AND d.ma_nguoi_dung=?", [id, owner]))[0][0]; },
    async list(owner, courseId, { page, pageSize }) {
      const connection = await pool.getConnection();
      try {
        await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); await connection.beginTransaction();
        const [count] = await connection.execute("SELECT COUNT(*) AS total FROM tai_lieu WHERE ma_nguoi_dung=? AND ma_mon_hoc=? AND luc_xoa IS NULL", [owner, courseId]);
        const [rows] = await connection.query("SELECT d.*,d.ma_tep_dam_may ma_tep_dam_may,IF(d.ma_tep_dam_may IS NOT NULL,'uploaded',IF(d.trang_thai='failed','failed','queued')) cloud_storage_status,(SELECT j.trang_thai FROM tac_vu_pdf j WHERE j.ma_tai_lieu=d.ma AND j.loai_tac_vu='delete_pdf') AS deletion_job_status FROM tai_lieu d WHERE d.ma_nguoi_dung=? AND d.ma_mon_hoc=? AND d.luc_xoa IS NULL ORDER BY d.ngay_tao DESC,d.ma DESC LIMIT ? OFFSET ?", [owner, courseId, pageSize, (page - 1) * pageSize]);
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
        const [users] = await connection.execute("SELECT ma,trang_thai FROM nguoi_dung WHERE ma=? FOR UPDATE", [owner]);
        if (!users.length || users[0].status !== 'active') throw new AppError(403, 'ACCOUNT_BLOCKED', 'Tài khoản không còn quyền tải tài liệu.');
        const [courses] = await connection.execute("SELECT ma FROM mon_hoc WHERE ma=? AND ma_nguoi_dung=?", [courseId, owner]);
        if (!courses.length) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy môn học.');
        const [usage] = await connection.execute("SELECT COALESCE(SUM(kich_thuoc_byte),0) AS user_bytes,COALESCE(SUM(IF(ma_mon_hoc=?,kich_thuoc_byte,0)),0) AS course_bytes,SUM(ma_mon_hoc=?) AS course_count FROM tai_lieu WHERE ma_nguoi_dung=? AND luc_xoa IS NULL", [courseId, courseId, owner]);
        const row = usage[0];
        if (Number(row.course_count) >= config.MAX_DOCUMENTS_PER_COURSE || Number(row.user_bytes) + input.size > config.MAX_USER_STORAGE_MB * 1024 ** 2 || Number(row.course_bytes) + input.size > config.MAX_COURSE_STORAGE_MB * 1024 ** 2) throw new AppError(429, 'DOCUMENT_QUOTA_EXCEEDED', 'Đã vượt số tài liệu hoặc dung lượng lưu trữ cho phép.');
        const [result] = await connection.execute("INSERT INTO tai_lieu(ma_mon_hoc,ma_nguoi_dung,ten_tep_goc,khoa_luu_tru,kich_thuoc_byte,ma_bam_sha256) VALUES (?,?,?,?,?,?)", [courseId, owner, input.name, input.key, input.size, input.sha256]);
        const id = String(result.insertId);
        await connection.execute("INSERT INTO tac_vu_pdf(ma_tai_lieu,loai_tac_vu) VALUES (?,'upload_pdf')", [id]);

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
