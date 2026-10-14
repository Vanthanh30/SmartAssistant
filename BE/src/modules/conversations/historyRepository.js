export function historyRepository(pool) {
 return {
  async list(owner,{ courseId,q,page,pageSize }) {
   const db = await pool.getConnection();
   const pattern = '%' + q.replace(/[!%_]/g,v => '!' + v) + '%';
   const where = `c.user_id=?${courseId ? ' AND c.course_id=?' : ''} AND c.title LIKE ? ESCAPE '!'`;
   const values = [owner,...(courseId ? [courseId] : []),pattern];
   try {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); await db.beginTransaction();
    const [count] = await db.execute(`SELECT COUNT(*) total FROM conversations c WHERE ${where}`,values);
    const [rows] = await db.query(`SELECT c.*,s.name course_name,(SELECT COUNT(*) FROM qa_messages m WHERE m.conversation_id=c.id) message_count FROM conversations c JOIN courses s ON s.id=c.course_id AND s.user_id=c.user_id WHERE ${where} ORDER BY c.updated_at DESC,c.id DESC LIMIT ? OFFSET ?`, [...values,pageSize,(page-1)*pageSize]);
    await db.commit(); return { rows,total:Number(count[0].total) };
   } catch(error) { await db.rollback(); throw error; } finally { db.release(); }
  },
 };
}
