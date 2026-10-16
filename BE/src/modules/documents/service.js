import { writePendingPdf, removePendingPdf } from '../../jobs/pendingPdf.js';
import { cloudBuffer,cloudEnabled } from '../../integrations/cloudinary.js';
import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../../shared/AppError.js';
export const documentDto = row => ({ id: String(row.id), courseId: String(row.course_id), fileName: row.original_name,
  status: row.status, storageProvider: 'cloudinary', cloudStorageStatus: row.cloud_storage_status ?? null, sizeBytes: Number(row.size_bytes), pageCount: row.page_count,
  extractionCompleted: Boolean(row.extraction_completed_at), errorCode: row.error_code, errorMessage: row.error_message,
  deletionRetryable: row.status === 'deleting' && row.deletion_job_status === 'failed',
  createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() });
export async function privatePdfContent(row,config) {
      // Never serve invalid/unvalidated PDFs as browser content.
      if (['deleting','deleted'].includes(row.status)) throw new AppError(404, 'NOT_FOUND', 'Tài liệu không còn khả dụng.');
      if (!row.extraction_completed_at || ['failed','unsupported'].includes(row.status)) throw new AppError(409, 'PDF_NOT_VIEWABLE', 'PDF đang chờ kiểm tra hoặc không thể xem.');
      const buffer=await cloudBuffer(config,{public_id:row.cloud_public_id,cloud_name:config.CLOUDINARY_CLOUD_NAME,state:row.cloud_storage_status,resource_type:'raw',sha256:row.sha256,size_bytes:row.size_bytes});
      return { buffer, size:Number(row.size_bytes),name:row.original_name };
}
export function documentService(repository, config) {
  const course = async (owner, id) => { if (!await repository.course(owner, id)) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy môn học.'); };
  const get = async (owner, id) => { const row = await repository.get(owner, id); if (!row) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy tài liệu.'); return row; };
  return {
    course,
    get: async (owner, id) => documentDto(await get(owner, id)),
    async list(owner, id, filters) { await course(owner, id); const result = await repository.list(owner, id, filters); return { data: result.rows.map(documentDto), meta: { ...filters, total: result.total,
      limits: { maxFileBytes: config.MAX_UPLOAD_MB * 1024 ** 2, maxDocumentsPerCourse: config.MAX_DOCUMENTS_PER_COURSE,
        maxCourseBytes: config.MAX_COURSE_STORAGE_MB * 1024 ** 2, maxUserBytes: config.MAX_USER_STORAGE_MB * 1024 ** 2 } } }; },
    async upload(owner, courseId, file) {
      if (!file) throw new AppError(422, 'PDF_REQUIRED', 'Chọn một file PDF để tải lên.');
      if(!cloudEnabled(config))throw new AppError(503,'CLOUDINARY_NOT_CONFIGURED','Cần cấu hình Cloudinary.');
      if(!file.buffer||file.size===0||file.buffer.subarray(0,5).toString('ascii')!=='%PDF-')throw new AppError(422,'INVALID_PDF','PDF không hợp lệ.');
      const key=randomUUID()+'.pdf';const sha256=createHash('sha256').update(file.buffer).digest('hex');
        const utf8Name = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const original = [...file.originalname].every(char => char.charCodeAt(0) <= 255) && !utf8Name.includes('\ufffd') ? utf8Name : file.originalname;
        const name = [...original.split(/[\\/]/).pop().normalize('NFC')].filter(char => char.codePointAt(0) >= 32 && char.codePointAt(0) !== 127).join('').trim();
        if (!name || [...name].length > 255) throw new AppError(422, 'INVALID_FILENAME', 'Tên file tối đa255 ký tự.');
        await writePendingPdf(config,key,file.buffer);
        try { return await repository.create(owner,courseId,{key,name,size:file.size,sha256},config); }
        catch(error) { if(!error.commitOutcomeUnknown) await removePendingPdf(config,key); throw error; }

    },
    async content(owner, id) {
      const row = await get(owner, id);
      return privatePdfContent(row, config);
    },
  };
}
