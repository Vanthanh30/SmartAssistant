import { randomUUID } from 'node:crypto';
const messages = {
  PDF_NO_TEXT: 'PDF không có lớp văn bản hữu dụng. Hãy chọn PDF văn bản; hệ thống không hỗ trợ OCR.',
  PDF_PASSWORD_PROTECTED: 'PDF có mật khẩu. Hãy tải bản PDF không mã hóa.',
  PDF_INVALID: 'PDF hỏng hoặc không hợp lệ. Hãy tải một file PDF khác.',
  PDF_FILE_MISSING: 'File PDF không còn khả dụng.', PDF_INTEGRITY_FAILED: 'File PDF không khớp dữ liệu đã tải lên.',
  PDF_TOO_MANY_PAGES: 'PDF vượt giới hạn số trang cho phép.', PDF_TOO_MUCH_TEXT: 'PDF vượt giới hạn lượng văn bản cho phép.',
  PDF_TOO_COMPLEX: 'PDF quá phức tạp để xử lý an toàn.', PDF_EXTRACTION_TIMEOUT: 'Trích xuất PDF vượt thời gian cho phép.',
  PDF_STORAGE_UNAVAILABLE: 'Kho lưu trữ tạm thời chưa sẵn sàng.', JOB_ATTEMPTS_EXHAUSTED: 'Xử lý bị gián đoạn nhiều lần và đã hết số lần thử.',
};
export function jobRepository(pool, config) {
  const owns = async (connection, job) => {
    const [rows] = await connection.execute("SELECT ma FROM tac_vu_pdf WHERE ma=? AND trang_thai='running' AND ma_tien_trinh_khoa=? AND khoa_den_luc>UTC_TIMESTAMP(3) FOR UPDATE", [job.id, job.locked_by]);
    return rows.length > 0;
  };
  return {
    async cloudAsset(documentId) { const d=(await pool.execute("SELECT * FROM tai_lieu WHERE ma=?",[documentId]))[0][0];return {public_id:d.cloud_public_id,cloud_name:config.CLOUDINARY_CLOUD_NAME,resource_type:d.cloud_resource_type,state:'uploaded',sha256:d.sha256,size_bytes:d.size_bytes}; },
    async claim() {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.query("SELECT j.* FROM tac_vu_pdf j WHERE j.loai_tac_vu='extract_pdf' AND EXISTS(SELECT 1 FROM tai_lieu WHERE ma=j.ma_tai_lieu AND ma_tep_dam_may IS NOT NULL) AND ((j.trang_thai='queued' AND j.luc_chay_tiep<=UTC_TIMESTAMP(3)) OR (j.trang_thai='running' AND j.khoa_den_luc<=UTC_TIMESTAMP(3))) ORDER BY j.luc_chay_tiep,j.ma LIMIT 1 FOR UPDATE SKIP LOCKED");
        if (!rows.length) { await connection.commit(); return null; }
        const job = rows[0]; const [documents] = await connection.execute("SELECT * FROM tai_lieu WHERE ma=? FOR UPDATE", [job.document_id]);
        const document = documents[0];
        if (document.extraction_completed_at || document.deleted_at || ['failed','unsupported','deleting','deleted'].includes(document.status)) {
          await connection.execute("UPDATE tac_vu_pdf SET trang_thai='completed',ma_tien_trinh_khoa=NULL,khoa_den_luc=NULL WHERE ma=?", [job.id]);
          await connection.commit(); return null;
        }
        if (job.attempts >= config.JOB_MAX_ATTEMPTS) {
          await connection.execute("UPDATE tac_vu_pdf SET trang_thai='failed',loi_gan_nhat='JOB_ATTEMPTS_EXHAUSTED',ma_tien_trinh_khoa=NULL,khoa_den_luc=NULL WHERE ma=?", [job.id]);
          await connection.execute("UPDATE tai_lieu SET trang_thai='failed',ma_loi='JOB_ATTEMPTS_EXHAUSTED',thong_bao_loi=? WHERE ma=?", [messages.JOB_ATTEMPTS_EXHAUSTED, document.id]);

          await connection.commit(); return null;
        }
        job.locked_by = randomUUID(); job.attempts++;
        await connection.execute("UPDATE tac_vu_pdf SET trang_thai='running',so_lan_thu=?,ma_tien_trinh_khoa=?,khoa_den_luc=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE ma=?", [job.attempts, job.locked_by, config.JOB_LEASE_SECONDS, job.id]);
        await connection.execute("UPDATE tai_lieu SET trang_thai='extracting',ma_loi=NULL,thong_bao_loi=NULL WHERE ma=?", [document.id]);
        await connection.commit(); return { job, document };
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async renew(job) {
      const [result] = await pool.execute("UPDATE tac_vu_pdf SET khoa_den_luc=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE ma=? AND trang_thai='running' AND ma_tien_trinh_khoa=? AND khoa_den_luc>UTC_TIMESTAMP(3)", [config.JOB_LEASE_SECONDS, job.id, job.locked_by]);
      return result.affectedRows === 1;
    },
    async finish(job, pageCount, code = null, extractionKey = null, extractionResult = null) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        if (!await owns(connection, job)) { await connection.rollback(); return false; }
        const retry = code === 'PDF_STORAGE_UNAVAILABLE' && job.attempts < config.JOB_MAX_ATTEMPTS;
        if (code) {
          await connection.execute("UPDATE tai_lieu SET trang_thai=?,ma_loi=?,thong_bao_loi=? WHERE ma=? AND luc_trich_xuat_xong IS NULL AND luc_xoa IS NULL", [retry ? 'queued' : code === 'PDF_NO_TEXT' ? 'unsupported' : 'failed', code, messages[code] ?? 'Không thể xử lý PDF.', job.document_id]);
          await connection.execute("UPDATE tac_vu_pdf SET trang_thai=?,loi_gan_nhat=?,ma_tien_trinh_khoa=NULL,khoa_den_luc=NULL,luc_chay_tiep=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE ma=?", [retry ? 'queued' : 'failed', code, Math.min(60, 2 ** job.attempts), job.id]);
        } else {
          if(extractionResult)await connection.execute("INSERT INTO van_ban_pdf(ma_tai_lieu,du_lieu_trich_xuat) VALUES(?,?) ON DUPLICATE KEY UPDATE du_lieu_trich_xuat=VALUES(du_lieu_trich_xuat)",[job.document_id,JSON.stringify(extractionResult)]);
          // Extraction complete is not index-ready; leave the pipeline at extracting for Sprint05.
          await connection.execute("UPDATE tai_lieu SET trang_thai='extracting',so_trang=?,khoa_trich_xuat=?,luc_trich_xuat_xong=UTC_TIMESTAMP(3),ma_loi=NULL,thong_bao_loi=NULL WHERE ma=? AND luc_xoa IS NULL", [pageCount, extractionKey, job.document_id]);
          await connection.execute("UPDATE tac_vu_pdf SET trang_thai='completed',loi_gan_nhat=NULL,ma_tien_trinh_khoa=NULL,khoa_den_luc=NULL WHERE ma=?", [job.id]);
          await connection.execute("INSERT INTO tac_vu_pdf(ma_tai_lieu,loai_tac_vu) VALUES (?,'prepare_source') ON DUPLICATE KEY UPDATE ma_tai_lieu=VALUES(ma_tai_lieu)", [job.document_id]);
        }

        await connection.commit(); return true;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async release(job) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        if (await owns(connection, job)) {
          await connection.execute("UPDATE tac_vu_pdf SET trang_thai='queued',so_lan_thu=GREATEST(so_lan_thu-1,0),ma_tien_trinh_khoa=NULL,khoa_den_luc=NULL,luc_chay_tiep=UTC_TIMESTAMP(3) WHERE ma=?", [job.id]);
          await connection.execute("UPDATE tai_lieu SET trang_thai='queued' WHERE ma=? AND luc_trich_xuat_xong IS NULL AND luc_xoa IS NULL", [job.document_id]);
        }
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
  };
}
