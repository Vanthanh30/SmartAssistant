import { api } from '../../lib/api.js';
export const getProfile = ({ signal }) => api('/users/me', { signal });
export const updateProfile = (input, csrfToken) => api('/users/me', { method: 'PATCH', body: input, csrfToken });
export const uploadAvatar = (file, csrfToken) => {
  const body = new FormData(); body.append('file', file);
  return api('/users/me/avatar', { method: 'POST', body, csrfToken, timeoutMs:150000 });
};
export const getAvatar = ({ signal }) => api('/users/me/avatar', { raw: true, signal, timeoutMs:65000 }).then(response => response.blob());
