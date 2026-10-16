import {AppError} from '../../shared/AppError.js';
export function userRepository(pool){return {
 async get(id){return (await pool.execute("SELECT *,IF(khoa_anh_dai_dien IS NULL,NULL,'uploaded') avatar_storage_status FROM nguoi_dung WHERE ma=?",[id]))[0][0];},
 async updateName(id,name){await pool.execute("UPDATE nguoi_dung SET ho_ten=? WHERE ma=?",[name,id]);return this.get(id);},
 async replaceAvatar(id,key){const db=await pool.getConnection();let committing=false;try{await db.beginTransaction();const [rows]=await db.execute("SELECT khoa_anh_dai_dien,trang_thai FROM nguoi_dung WHERE ma=? FOR UPDATE",[id]);if(rows[0]?.status!=='active')throw new AppError(403,'ACCOUNT_BLOCKED','Tài khoản không còn hoạt động.');await db.execute("UPDATE nguoi_dung SET khoa_anh_dai_dien=? WHERE ma=?",[key,id]);committing=true;await db.commit();return rows[0].avatar_key;}catch(error){error.commitOutcomeUnknown=committing;await db.rollback();throw error;}finally{db.release();}}
};}
