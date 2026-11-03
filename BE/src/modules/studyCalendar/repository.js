import { fromDb } from '../shared/values.js';
import { assertActiveActor } from '../auth/service.js';
export function createCalendarRepository(db){return {
 async actor(actor){try{await assertActiveActor(db,db.runtimeConfig,actor,'student');return true;}catch{return false;}},
 async connection(owner){const row=(await db.execute('SELECT dinh_danh_google googleSub,email_google googleEmail,refresh_token_ma_hoa ciphertext,trang_thai connectionStatus FROM ket_noi_google WHERE ma_nguoi_dung=?',[owner]))[0][0];return row?{...row,connectionStatus:fromDb(row.connectionStatus)}:null;},
 saveConnection:(owner,sub,email,cipher)=>db.execute("INSERT INTO ket_noi_google(ma_nguoi_dung,dinh_danh_google,email_google,refresh_token_ma_hoa,trang_thai) VALUES(?,?,?,?,'đã kết nối') ON DUPLICATE KEY UPDATE dinh_danh_google=VALUES(dinh_danh_google),email_google=VALUES(email_google),refresh_token_ma_hoa=VALUES(refresh_token_ma_hoa),trang_thai='đã kết nối',ngay_ket_noi=UTC_TIMESTAMP(3)",[owner,sub,email,cipher]),
 async accountEventCount(owner){return Number((await db.execute('SELECT COUNT(*) n FROM buoi_hoc b JOIN ke_hoach_hoc p USING(ma_ke_hoach) WHERE p.ma_nguoi_dung=? AND b.dinh_danh_su_kien_google IS NOT NULL',[owner]))[0][0].n);},
 disconnect:owner=>db.execute("UPDATE ket_noi_google SET refresh_token_ma_hoa=NULL,trang_thai='đã ngắt kết nối' WHERE ma_nguoi_dung=?",[owner]),
 reconnect:owner=>db.execute("UPDATE ket_noi_google SET trang_thai='cần kết nối lại' WHERE ma_nguoi_dung=?",[owner]),
 async get(owner,id){return (await db.execute('SELECT b.ma_buoi_hoc id,b.dinh_danh_su_kien_google eventId FROM buoi_hoc b JOIN ke_hoach_hoc p USING(ma_ke_hoach) WHERE b.ma_buoi_hoc=? AND p.ma_nguoi_dung=?',[id,owner]))[0][0];},
};}

export { createCalendarRepository as calendarRepository };
