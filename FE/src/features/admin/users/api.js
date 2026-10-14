import { api } from '../../../lib/api.js';
export const listAdminUsers=(filters,signal)=>api('/admin/users?'+new URLSearchParams(Object.entries(filters).filter(([,value])=>value!=='')),{signal,envelope:true});
export const getAdminUser=(id,signal)=>api(`/admin/users/${id}`,{signal});
export const setUserStatus=(id,status,csrfToken)=>api(`/admin/users/${id}/status`,{method:'PATCH',body:{status},csrfToken});
