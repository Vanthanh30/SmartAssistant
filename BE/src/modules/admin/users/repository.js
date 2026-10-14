export const publicColumns='id,full_name,email,role,status,created_at,updated_at';
export function adminUserRepository(pool){return {
 async get(id){return (await pool.execute(`SELECT ${publicColumns} FROM users WHERE id=?`,[id]))[0][0];},
 async list({q,status,page,pageSize}){
  const db=await pool.getConnection();const pattern='%'+q.replace(/[!%_]/g,v=>'!'+v)+'%';
  const where=`(full_name COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!' OR email COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!')${status ? ' AND status=?' : ''}`;
  const values=[pattern,pattern,...(status ? [status] : [])];
  try{await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await db.beginTransaction();
   const [count]=await db.execute(`SELECT COUNT(*) total FROM users WHERE ${where}`,values);
   const [rows]=await db.query(`SELECT ${publicColumns} FROM users WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,[...values,pageSize,(page-1)*pageSize]);
   await db.commit();return {rows,total:Number(count[0].total)};
  }catch(error){await db.rollback();throw error;}finally{db.release();}
 },
};}
