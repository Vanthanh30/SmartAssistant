import { DateTime } from 'luxon';
export const ZONE='Asia/Ho_Chi_Minh';
export const localNow=()=>DateTime.now().setZone(ZONE);
export const weekOf=value=>DateTime.fromISO(value,{zone:ZONE}).startOf('week').toISODate();
export const localInput=value=>DateTime.fromISO(value,{zone:ZONE}).toFormat("yyyy-MM-dd'T'HH:mm");
export const fromInput=value=>DateTime.fromISO(value,{zone:ZONE}).toUTC().toISO();
export const when=value=>DateTime.fromISO(value,{zone:ZONE}).setLocale('vi').toFormat('ccc dd/LL HH:mm');
export function rangeFor(date,view) {
 const day=DateTime.fromISO(date,{zone:ZONE});
 const from=view==='dayGridMonth'?day.startOf('month').startOf('week'):day.startOf('week');
 return {from:from.toUTC().toISO(),to:from.plus({days:view==='dayGridMonth'?42:7}).toUTC().toISO()};
}
export const businessLabels={planned:'Chưa hoàn thành',completed:'Đã hoàn thành',cancelled:'Đã hủy'};
export const syncLabels={unverified:'Có event ID; bấm đồng bộ để kiểm tra Google',local:'Chỉ trong ứng dụng',pending_sync:'Chờ đồng bộ Google',synced:'Đã đồng bộ Google',pending_delete:'Chờ xóa Google',detached:'Đã gỡ đồng bộ',error:'Lỗi đồng bộ — cần xử lý',reconnect_required:'Cần kết nối lại / chọn ý định đồng bộ'};
