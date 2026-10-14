import { api } from '../../lib/api.js';
export const listDocuments = (courseId, page, signal) => api(`/courses/${courseId}/documents?page=${page}&pageSize=20`, { signal, envelope: true });
export const getDocument = (id, signal) => api(`/documents/${id}`, { signal });
export function uploadPdf(courseId, file, csrfToken) {
  const body = new FormData(); body.append('file', file);
  return api(`/courses/${courseId}/documents`, { method: 'POST', body, csrfToken, timeoutMs: 150000 });
}
export const pdfContent = (id, signal) => api(`/documents/${id}/content`, { raw: true, signal, timeoutMs: 150000 });
export const deleteDocument = (id, csrfToken) => api(`/documents/${id}`, { method: 'DELETE', csrfToken });
