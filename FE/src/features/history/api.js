import { api } from '../../lib/api.js';
export const listHistory = (filters,signal) => api('/conversations?'+new URLSearchParams(Object.entries(filters).filter(([,value]) => value!=='')),{ signal,envelope:true });
export const getHistory = (id,beforeMessageId,signal) => api(`/conversations/${id}?`+new URLSearchParams({limit:50,...(beforeMessageId ? {beforeMessageId} : {})}),{signal});
export const deleteConversation = (id,csrfToken) => api(`/conversations/${id}`,{method:'DELETE',csrfToken});
