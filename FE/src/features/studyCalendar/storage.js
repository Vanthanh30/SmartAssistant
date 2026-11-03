const prefix='study-calendar:';
export function clearCalendarStorage(userId) {
 for(const store of [sessionStorage,localStorage])for(let i=store.length-1;i>=0;i--){const key=store.key(i);if(key?.startsWith(`${prefix}${userId}:`))store.removeItem(key);}
}
