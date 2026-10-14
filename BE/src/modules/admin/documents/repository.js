const select=`SELECT d.*,(SELECT public_id FROM cloud_assets WHERE document_id=d.id) cloud_public_id,(SELECT cloud_name FROM cloud_assets WHERE document_id=d.id) cloud_name,(SELECT state FROM cloud_assets WHERE document_id=d.id) cloud_storage_status,u.full_name owner_name,u.email owner_email,u.role owner_role,u.status owner_status,c.name course_name,
 (SELECT j.status FROM processing_jobs j WHERE j.document_id=d.id AND j.type='delete_pdf') deletion_job_status
 FROM documents d JOIN users u ON u.id=d.user_id JOIN courses c ON c.id=d.course_id AND c.user_id=d.user_id`;
export function adminDocumentRepository(pool){return {
 async courses({q,userId,page,pageSize}){
  const db=await pool.getConnection();const values=[];const conditions=[];
  if(userId){conditions.push('c.user_id=?');values.push(userId);}
  if(q){conditions.push("c.name LIKE ? ESCAPE '!'");values.push('%'+q.replace(/[!%_]/g,v=>'!'+v)+'%');}
  const where=conditions.length ? ' WHERE '+conditions.join(' AND ') : '';
  try{await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await db.beginTransaction();
   const [count]=await db.execute('SELECT COUNT(*) total FROM courses c'+where,values);
   const [rows]=await db.query('SELECT c.id,c.name,c.user_id,u.full_name owner_name FROM courses c JOIN users u ON u.id=c.user_id'+where+' ORDER BY c.name,c.id LIMIT ? OFFSET ?',[...values,pageSize,(page-1)*pageSize]);
   await db.commit();return {rows,total:Number(count[0].total)};
  }catch(error){await db.rollback();throw error;}finally{db.release();}
 },
 async get(id){return (await pool.execute(select+' WHERE d.id=?',[id]))[0][0];},
 async list({q,status,userId,courseId,page,pageSize}){
  const conditions=[];const values=[];
  if(status){conditions.push('d.status=?');values.push(status);}else conditions.push("d.status<>'deleted'");
  if(userId){conditions.push('d.user_id=?');values.push(userId);}
  if(courseId){conditions.push('d.course_id=?');values.push(courseId);}
  if(q){conditions.push("(d.original_name LIKE ? ESCAPE '!' OR c.name LIKE ? ESCAPE '!' OR u.full_name COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!' OR u.email COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!')");const pattern='%'+q.replace(/[!%_]/g,v=>'!'+v)+'%';values.push(pattern,pattern,pattern,pattern);}
  const where=' WHERE '+conditions.join(' AND ');const db=await pool.getConnection();
  try{await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await db.beginTransaction();
   const [count]=await db.execute('SELECT COUNT(*) total FROM documents d JOIN users u ON u.id=d.user_id JOIN courses c ON c.id=d.course_id AND c.user_id=d.user_id'+where,values);
   const [rows]=await db.query(select+where+' ORDER BY d.created_at DESC,d.id DESC LIMIT ? OFFSET ?',[...values,pageSize,(page-1)*pageSize]);
   await db.commit();return {rows,total:Number(count[0].total)};
  }catch(error){await db.rollback();throw error;}finally{db.release();}
 },
};}
