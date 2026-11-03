import { fromDb } from '../shared/values.js';
import { json } from '../shared/repository.js';
export const dto = async (d) => {
  const meta = json(d.cau_hinh_xu_ly) || {};
  const status = fromDb(d.trang_thai);
  return {
    id: String(d.ma_tai_lieu),
    courseId: String(d.ma_mon_hoc),
    fileName: d.ten_tai_lieu,
    status,
    pageCount: d.so_trang,
    sizeBytes: meta.sizeBytes ?? null,
    storageProvider: 'cloudinary',
    cloudStorageStatus: d.dinh_danh_dam_may ? 'uploaded' : null,
    processingStage: status === 'processing' ? meta.processing?.stage : null,
    extractionCompleted: status === 'ready',
    processRetryable: ['uploaded', 'failed'].includes(status),
    deletionRetryable: status === 'deleting',
    createdAt: d.ngay_tai_len,
    updatedAt: d.ngay_xu_ly || d.ngay_tai_len,
  };
};
