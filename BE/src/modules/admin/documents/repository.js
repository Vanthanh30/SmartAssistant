const select=`SELECT d.*,d.ma_tep_dam_may ma_tep_dam_may,IF(d.ma_tep_dam_may IS NOT NULL,'uploaded',IF(d.trang_thai='failed','failed','queued')) cloud_storage_status,u.ho_ten owner_name,u.email owner_email,u.vai_tro owner_role,u.trang_thai owner_status,c.ten course_name,
 (SELECT j.trang_thai FROM tac_vu_pdf j WHERE j.ma_tai_lieu=d.ma AND j.loai_tac_vu='delete_pdf') deletion_job_status
 FROM tai_lieu d JOIN nguoi_dung u ON u.ma=d.ma_nguoi_dung JOIN mon_hoc c ON c.ma=d.ma_mon_hoc AND c.ma_nguoi_dung=d.ma_nguoi_dung`;
export function adminDocumentRepository(pool){return {
 async courses({q,userId,page,pageSize}){
  const db=await pool.getConnection();const values=[];const conditions=[];
  if(userId){conditions.push("c.ma_nguoi_dung=?");values.push(userId);}
  if(q){conditions.push("c.ten LIKE ? ESCAPE '!'");values.push('%'+q.replace(/[!%_]/g,v=>'!'+v)+'%');}
  const where=conditions.length ? ' WHERE '+conditions.join(' AND ') : '';
  try{await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await db.beginTransaction();
   const [count]=await db.execute("SELECT COUNT(*) total FROM mon_hoc c"+where,values);
   const [rows]=await db.query("SELECT c.ma,c.ten,c.ma_nguoi_dung,u.ho_ten owner_name FROM mon_hoc c JOIN nguoi_dung u ON u.ma=c.ma_nguoi_dung"+where+" ORDER BY c.ten,c.ma LIMIT ? OFFSET ?",[...values,pageSize,(page-1)*pageSize]);
   await db.commit();return {rows,total:Number(count[0].total)};
  }catch(error){await db.rollback();throw error;}finally{db.release();}
 },
 async get(id){return (await pool.execute(select+" WHERE d.ma=?",[id]))[0][0];},
 async list({q,status,userId,courseId,page,pageSize}){
  const conditions=[];const values=[];
  if(status){conditions.push("d.trang_thai=?");values.push(status);}else conditions.push("d.trang_thai<>'deleted'");
  if(userId){conditions.push("d.ma_nguoi_dung=?");values.push(userId);}
  if(courseId){conditions.push("d.ma_mon_hoc=?");values.push(courseId);}
  if(q){conditions.push("(d.ten_tep_goc LIKE ? ESCAPE '!' OR c.ten LIKE ? ESCAPE '!' OR u.ho_ten COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!' OR u.email COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!')");const pattern='%'+q.replace(/[!%_]/g,v=>'!'+v)+'%';values.push(pattern,pattern,pattern,pattern);}
  const where=' WHERE '+conditions.join(' AND ');const db=await pool.getConnection();
  try{await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await db.beginTransaction();
   const [count]=await db.execute("SELECT COUNT(*) total FROM tai_lieu d JOIN nguoi_dung u ON u.ma=d.ma_nguoi_dung JOIN mon_hoc c ON c.ma=d.ma_mon_hoc AND c.ma_nguoi_dung=d.ma_nguoi_dung"+where,values);
   const [rows]=await db.query(select+where+" ORDER BY d.ngay_tao DESC,d.ma DESC LIMIT ? OFFSET ?",[...values,pageSize,(page-1)*pageSize]);
   await db.commit();return {rows,total:Number(count[0].total)};
  }catch(error){await db.rollback();throw error;}finally{db.release();}
 },
};}
