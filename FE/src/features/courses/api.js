import { api } from '../../lib/api.js';
export const listCourses = (query, signal) => api('/courses?' + new URLSearchParams(query), { envelope: true, signal });
export const getCourse = (id, signal) => api('/courses/' + encodeURIComponent(id), { signal });
export const createCourse = (input, csrfToken) => api('/courses', { method: 'POST', body: input, csrfToken });
export const updateCourse = (id, input, csrfToken) => api('/courses/' + encodeURIComponent(id), { method: 'PATCH', body: input, csrfToken });
