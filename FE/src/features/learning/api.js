import { api } from '../../lib/api.js';
export const listSets = (courseId,page,signal) => api(`/courses/${courseId}/learning-sets?page=${page}`,{signal,envelope:true});
export const createSet = (courseId,body,csrfToken) => api(`/courses/${courseId}/learning-sets`,{method:'POST',body,csrfToken,timeoutMs:180000});
export const getSet = (id,signal) => api(`/learning-sets/${id}`,{signal});
export const deleteSet = (id,csrfToken) => api(`/learning-sets/${id}`,{method:'DELETE',csrfToken});
export const listAttempts = (id,signal) => api(`/learning-sets/${id}/attempts`,{signal});
export const startAttempt = (id,requestId,csrfToken) => api(`/learning-sets/${id}/attempts`,{method:'POST',body:{requestId},csrfToken});
export const getAttempt = (id,signal) => api(`/learning-attempts/${id}`,{signal});
export const submitAttempt = (id,answers,csrfToken) => api(`/learning-attempts/${id}/submit`,{method:'POST',body:{answers},csrfToken});
