export const publicColumns="ma,ho_ten,email,vai_tro,trang_thai,ngay_tao,ngay_cap_nhat";
export function adminUserRepository(pool){return {
 async get(id){return (await pool.execute(`SELECT ${publicColumns} FROM nguoi_dung WHERE ma=?`,[id]))[0][0];},
 async list({q,status,page,pageSize}){
  const db=await pool.getConnection();const pattern='%'+q.replace(/[!%_]/g,v=>'!'+v)+'%';
  const where=`(ho_ten COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!' OR email COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!')${status ? " AND trang_thai=?" : ''}`;
  const values=[pattern,pattern,...(status ? [status] : [])];
  try{await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await db.beginTransaction();
   const [count]=await db.execute(`SELECT COUNT(*) total FROM nguoi_dung WHERE ${where}`,values);
   const [rows]=await db.query(`SELECT ${publicColumns} FROM nguoi_dung WHERE ${where} ORDER BY ngay_tao DESC,ma DESC LIMIT ? OFFSET ?`,[...values,pageSize,(page-1)*pageSize]);
   await db.commit();return {rows,total:Number(count[0].total)};
  }catch(error){await db.rollback();throw error;}finally{db.release();}
 },
};}
