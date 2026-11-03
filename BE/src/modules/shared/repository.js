import { AppError } from '../../shared/AppError.js';
import { fromDb } from './values.js';
export const missing=()=>new AppError(404,'NOT_FOUND','Không tìm thấy dữ liệu thuộc tài khoản của bạn.');
export const json=v=>typeof v==='string'?JSON.parse(v):v;
export async function atomic(pool,work){const db=await pool.getConnection();try{await db.beginTransaction();const result=await work(db);await db.commit();return result;}catch(e){await db.rollback();throw e;}finally{db.release();}}
export function studyAssistantRepository(db){
 const one=async(sql,args)=>{const [r]=await db.execute(sql,args);if(!r.length)throw missing();return r[0];};
 return {
 course:(owner,id)=>one('SELECT * FROM mon_hoc WHERE ma_mon_hoc=? AND ma_nguoi_dung=?',[id,owner]),
 document:(owner,id,ready=false)=>one(`SELECT d.*,m.ma_nguoi_dung FROM tai_lieu d JOIN mon_hoc m USING(ma_mon_hoc) WHERE d.ma_tai_lieu=? AND m.ma_nguoi_dung=? AND d.ngay_xoa IS NULL${ready?" AND d.trang_thai='sẵn sàng'":''}`,[id,owner]),
 async chunks(owner,id,from=1,to=10000){await this.document(owner,id,true);return (await db.execute('SELECT * FROM doan_tai_lieu WHERE ma_tai_lieu=? AND trang_bat_dau<=? AND trang_ket_thuc>=? ORDER BY thu_tu_doan LIMIT 50001',[id,to,from]))[0];},
 conversation:(owner,id)=>one('SELECT h.*,m.ma_nguoi_dung,m.ten_mon_hoc FROM hoi_thoai h JOIN mon_hoc m USING(ma_mon_hoc) WHERE h.ma_hoi_thoai=? AND m.ma_nguoi_dung=?',[id,owner]),
 set:(owner,id,lock=false)=>one(`SELECT b.* FROM bai_on_tap b JOIN mon_hoc m USING(ma_mon_hoc) WHERE b.ma_bai_on_tap=? AND m.ma_nguoi_dung=?${lock?' FOR UPDATE':''}`,[id,owner]),
 async items(id){return (await db.execute('SELECT * FROM cau_hoi_on_tap WHERE ma_bai_on_tap=? ORDER BY thu_tu',[id]))[0];},
 attempt:(owner,id,lock=false)=>one(`SELECT a.* FROM lan_lam_bai a JOIN bai_on_tap b USING(ma_bai_on_tap) JOIN mon_hoc m USING(ma_mon_hoc) WHERE a.ma_lan_lam_bai=? AND a.ma_nguoi_dung=? AND m.ma_nguoi_dung=?${lock?' FOR UPDATE':''}`,[id,owner,owner]),
 session:(owner,id)=>one('SELECT b.*,p.ma_nguoi_dung,p.dieu_kien_hoc,d.ma_mon_hoc FROM buoi_hoc b JOIN ke_hoach_hoc p USING(ma_ke_hoach) JOIN tai_lieu d USING(ma_tai_lieu) JOIN mon_hoc m ON m.ma_mon_hoc=p.ma_mon_hoc WHERE b.ma_buoi_hoc=? AND p.ma_nguoi_dung=? AND m.ma_nguoi_dung=? AND d.ma_mon_hoc=p.ma_mon_hoc',[id,owner,owner]),
 async connection(owner){const row=(await db.execute('SELECT dinh_danh_google googleSub,email_google googleEmail,refresh_token_ma_hoa ciphertext,trang_thai connectionStatus FROM ket_noi_google WHERE ma_nguoi_dung=?',[owner]))[0][0];return row?{...row,connectionStatus:fromDb(row.connectionStatus)}:null;},
 };}
