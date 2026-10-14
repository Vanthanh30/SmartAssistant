const names = { queued: 'Đang chờ xử lý', extracting: 'Đang trích xuất', chunking: 'Đang chia đoạn', embedding: 'Đang tạo embedding', indexing: 'Đang lập chỉ mục', ready: 'Sẵn sàng', failed: 'Xử lý thất bại', unsupported: 'Không hỗ trợ', deleting: 'Đang xóa', deleted: 'Đã xóa' };
export function DocumentStatus({ document }) {
  const name = document.status === 'extracting' && document.extractionCompleted ? 'Đã trích xuất · Chờ bước tiếp theo' : names[document.status] ?? document.status;
  return <><span className={`document-status document-status-${document.status}`}>{name}</span>{document.storageProvider==='cloudinary'&&<small> · Cloudinary: {document.cloudStorageStatus==='uploaded'?'Đã lưu':document.cloudStorageStatus==='failed'?'Lưu thất bại':document.cloudStorageStatus==='deleted'?'Đã xóa':document.cloudStorageStatus==='deleting'?'Đang xóa':'Đang lưu'}</small>}</>;
}
