import { AppError } from '../../shared/AppError.js';
export function createUserRepository(pool){return {
 async get(id){return (await pool.execute("SELECT ma_nguoi_dung id,ho_ten full_name,email,CASE vai_tro WHEN 'quản trị viên' THEN 'admin' ELSE 'student' END role,CASE trang_thai WHEN 'hoạt động' THEN 'active' ELSE 'blocked' END status,anh_dai_dien avatar_key,IF(anh_dai_dien IS NULL,NULL,'uploaded') avatar_storage_status,ngay_tao created_at FROM nguoi_dung WHERE ma_nguoi_dung=?",[id]))[0][0];},
 async updateName(id,name){await pool.execute('UPDATE nguoi_dung SET ho_ten=? WHERE ma_nguoi_dung=?',[name,id]);return this.get(id);},
 async replaceAvatar(id,key){const db=await pool.getConnection();try{await db.beginTransaction();const [rows]=await db.execute('SELECT anh_dai_dien,trang_thai FROM nguoi_dung WHERE ma_nguoi_dung=? FOR UPDATE',[id]);if(rows[0]?.trang_thai!=='hoạt động')throw new AppError(403,'ACCOUNT_BLOCKED','Tài khoản không hoạt động.');await db.execute('UPDATE nguoi_dung SET anh_dai_dien=? WHERE ma_nguoi_dung=?',[key,id]);await db.commit();return rows[0].anh_dai_dien;}catch(e){await db.rollback();throw e;}finally{db.release();}},
};}

export { createUserRepository as userRepository };
