import { api } from '../../../lib/api.js';
const query=filters=>new URLSearchParams(Object.entries(filters).filter(([,value])=>value!==''));
export const listAdminDocuments=(filters,signal)=>api('/admin/documents?'+query(filters),{envelope:true,signal});
export const listDocumentCourses=(filters,signal)=>api('/admin/documents/courses?'+query(filters),{envelope:true,signal});
export const getAdminDocument=(id,signal)=>api(`/admin/documents/${id}`,{signal});
export const adminPdfContent=(id,signal)=>api(`/admin/documents/${id}/content`,{raw:true,signal,timeoutMs:60000});
export const deleteAdminDocument=(id,csrfToken)=>api(`/admin/documents/${id}`,{method:'DELETE',csrfToken});
export const documentStates={queued:'Đang chờ',extracting:'Trích xuất',chunking:'Chia đoạn',embedding:'Embedding',indexing:'Lập chỉ mục',ready:'Sẵn sàng',failed:'Thất bại',unsupported:'Không hỗ trợ',deleting:'Đang xóa',deleted:'Đã xóa'};
export const shouldPoll=document=>document && (['queued','extracting','chunking','embedding','indexing'].includes(document.status) || (document.status==='deleting' && !document.deletionRetryable));
