import { AppError } from '../../../shared/AppError.js';
import { publicColumns } from './repository.js';
import { writeAudit } from '../audit.js';
export const adminUserDto=row=>({id:String(row.id),fullName:row.full_name,email:row.email,role:row.role,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at});
export function adminUserService(pool,repository){return {
 async list(filters){const result=await repository.list(filters);return {data:result.rows.map(adminUserDto),meta:{page:filters.page,pageSize:filters.pageSize,total:result.total}};},
 async get(id){const row=await repository.get(id);if(!row)throw new AppError(404,'USER_NOT_FOUND','Không tìm thấy người dùng.');return adminUserDto(row);},
 async setStatus(actor,id,input){
  const db=await pool.getConnection();
  try{
   await db.beginTransaction();
   // Lock all admin rows in stable order before actor/target locks; every admin status mutation shares this lock.
   await db.execute("SELECT ma FROM nguoi_dung WHERE vai_tro='admin' ORDER BY ma FOR UPDATE");
   const [actors]=await db.execute(`SELECT ${publicColumns} FROM nguoi_dung WHERE ma=? FOR UPDATE`,[actor.user.id]);
   if(actors[0]?.status!=='active' || actors[0]?.role!=='admin')throw new AppError(403,'ACCOUNT_BLOCKED','Phiên quản trị không còn hợp lệ.');
   const [sessions]=await db.execute("SELECT ma FROM phien_dang_nhap WHERE ma_nguoi_dung=? AND token_chong_csrf=? AND luc_thu_hoi IS NULL AND luc_het_han>UTC_TIMESTAMP(3) FOR UPDATE",[actor.user.id,actor.csrfToken]);
   if(!sessions.length)throw new AppError(401,'SESSION_EXPIRED','Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.');
   const [rows]=await db.execute(`SELECT ${publicColumns} FROM nguoi_dung WHERE ma=? FOR UPDATE`,[id]);
   if(!rows.length)throw new AppError(404,'USER_NOT_FOUND','Không tìm thấy người dùng.');
   const target=rows[0];
   if(target.status===input.status){await db.commit();return adminUserDto(target);}
   if(target.role==='admin' && input.status==='blocked'){
    const [admins]=await db.execute("SELECT ma FROM nguoi_dung WHERE vai_tro='admin' AND trang_thai='active' ORDER BY ma FOR UPDATE");
    if(admins.length<=1)throw new AppError(409,'LAST_ACTIVE_ADMIN','Không thể khóa quản trị viên hoạt động cuối cùng.');
   }
   await db.execute("UPDATE nguoi_dung SET trang_thai=? WHERE ma=?",[input.status,id]);
   let revokedSessions=0;
   if(input.status==='blocked'){
    const [result]=await db.execute("UPDATE phien_dang_nhap SET luc_thu_hoi=UTC_TIMESTAMP(3) WHERE ma_nguoi_dung=? AND luc_thu_hoi IS NULL",[id]);revokedSessions=result.affectedRows;
   }
   await writeAudit(db,{actorId:actor.user.id,action:input.status==='blocked' ? 'user.block' : 'user.unblock',entityType:'user',entityId:id,metadata:{previousStatus:target.status,status:input.status,role:target.role,revokedSessions}});
   const [updated]=await db.execute(`SELECT ${publicColumns} FROM nguoi_dung WHERE ma=?`,[id]);
   await db.commit();return adminUserDto(updated[0]);
  }catch(error){await db.rollback();throw error;}finally{db.release();}
 },
};}
