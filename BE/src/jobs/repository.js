import { queueDocumentMail } from '../integrations/email.js';
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
    const [rows] = await connection.execute("SELECT id FROM processing_jobs WHERE id=? AND status='running' AND locked_by=? AND locked_until>UTC_TIMESTAMP(3) FOR UPDATE", [job.id, job.locked_by]);
    return rows.length > 0;
  };
  return {
    async cloudAsset(documentId) { return (await pool.execute('SELECT * FROM cloud_assets WHERE document_id=?',[documentId]))[0][0]; },
    async claim() {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.query("SELECT j.* FROM processing_jobs j WHERE j.type='extract_pdf' AND (NOT EXISTS(SELECT 1 FROM cloud_assets WHERE document_id=j.document_id) OR EXISTS(SELECT 1 FROM cloud_assets WHERE document_id=j.document_id AND state='uploaded')) AND ((j.status='queued' AND j.next_run_at<=UTC_TIMESTAMP(3)) OR (j.status='running' AND j.locked_until<=UTC_TIMESTAMP(3))) ORDER BY j.next_run_at,j.id LIMIT 1 FOR UPDATE SKIP LOCKED");
        if (!rows.length) { await connection.commit(); return null; }
        const job = rows[0]; const [documents] = await connection.execute('SELECT * FROM documents WHERE id=? FOR UPDATE', [job.document_id]);
        const document = documents[0];
        if (document.extraction_completed_at || document.deleted_at || ['failed','unsupported','deleting','deleted'].includes(document.status)) {
          await connection.execute("UPDATE processing_jobs SET status='completed',locked_by=NULL,locked_until=NULL WHERE id=?", [job.id]);
          await connection.commit(); return null;
        }
        if (job.attempts >= config.JOB_MAX_ATTEMPTS) {
          await connection.execute("UPDATE processing_jobs SET status='failed',last_error='JOB_ATTEMPTS_EXHAUSTED',locked_by=NULL,locked_until=NULL WHERE id=?", [job.id]);
          await connection.execute("UPDATE documents SET status='failed',error_code='JOB_ATTEMPTS_EXHAUSTED',error_message=? WHERE id=?", [messages.JOB_ATTEMPTS_EXHAUSTED, document.id]);
          await queueDocumentMail(connection,document.id,'failed',config);
          await connection.commit(); return null;
        }
        job.locked_by = randomUUID(); job.attempts++;
        await connection.execute("UPDATE processing_jobs SET status='running',attempts=?,locked_by=?,locked_until=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE id=?", [job.attempts, job.locked_by, config.JOB_LEASE_SECONDS, job.id]);
        await connection.execute("UPDATE documents SET status='extracting',error_code=NULL,error_message=NULL WHERE id=?", [document.id]);
        await connection.commit(); return { job, document };
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async renew(job) {
      const [result] = await pool.execute("UPDATE processing_jobs SET locked_until=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE id=? AND status='running' AND locked_by=? AND locked_until>UTC_TIMESTAMP(3)", [config.JOB_LEASE_SECONDS, job.id, job.locked_by]);
      return result.affectedRows === 1;
    },
    async finish(job, pageCount, code = null, extractionKey = null, extractionResult = null) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        if (!await owns(connection, job)) { await connection.rollback(); return false; }
        const retry = code === 'PDF_STORAGE_UNAVAILABLE' && job.attempts < config.JOB_MAX_ATTEMPTS;
        if (code) {
          await connection.execute('UPDATE documents SET status=?,error_code=?,error_message=? WHERE id=? AND extraction_completed_at IS NULL AND deleted_at IS NULL', [retry ? 'queued' : code === 'PDF_NO_TEXT' ? 'unsupported' : 'failed', code, messages[code] ?? 'Không thể xử lý PDF.', job.document_id]);
          await connection.execute('UPDATE processing_jobs SET status=?,last_error=?,locked_by=NULL,locked_until=NULL,next_run_at=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE id=?', [retry ? 'queued' : 'failed', code, Math.min(60, 2 ** job.attempts), job.id]);
        } else {
          if(extractionResult)await connection.execute('INSERT INTO document_extractions(document_id,payload) VALUES(?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload)',[job.document_id,JSON.stringify(extractionResult)]);
          // Extraction complete is not index-ready; leave the pipeline at extracting for Sprint05.
          await connection.execute("UPDATE documents SET status='extracting',page_count=?,extraction_key=?,extraction_completed_at=UTC_TIMESTAMP(3),error_code=NULL,error_message=NULL WHERE id=? AND deleted_at IS NULL", [pageCount, extractionKey, job.document_id]);
          await connection.execute("UPDATE processing_jobs SET status='completed',last_error=NULL,locked_by=NULL,locked_until=NULL WHERE id=?", [job.id]);
          await connection.execute("INSERT INTO processing_jobs(document_id,type) VALUES (?,'prepare_source') ON DUPLICATE KEY UPDATE document_id=VALUES(document_id)", [job.document_id]);
        }
        if(code && !retry)await queueDocumentMail(connection,job.document_id,code==='PDF_NO_TEXT'?'unsupported':'failed',config);
        await connection.commit(); return true;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async release(job) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        if (await owns(connection, job)) {
          await connection.execute("UPDATE processing_jobs SET status='queued',attempts=GREATEST(attempts-1,0),locked_by=NULL,locked_until=NULL,next_run_at=UTC_TIMESTAMP(3) WHERE id=?", [job.id]);
          await connection.execute("UPDATE documents SET status='queued' WHERE id=? AND extraction_completed_at IS NULL AND deleted_at IS NULL", [job.document_id]);
        }
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
  };
}
