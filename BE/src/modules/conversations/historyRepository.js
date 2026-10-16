export function historyRepository(pool) {
 return {
  async list(owner,{ courseId,q,page,pageSize }) {
   const db = await pool.getConnection();
   const pattern = '%' + q.replace(/[!%_]/g,v => '!' + v) + '%';
   const where = `c.ma_nguoi_dung=?${courseId ? " AND c.ma_mon_hoc=?" : ''} AND c.tieu_de LIKE ? ESCAPE '!'`;
   const values = [owner,...(courseId ? [courseId] : []),pattern];
   try {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); await db.beginTransaction();
    const [count] = await db.execute(`SELECT COUNT(*) total FROM hoi_thoai c WHERE ${where}`,values);
    const [rows] = await db.query(`SELECT c.*,s.ten course_name,(SELECT COUNT(*) FROM tin_nhan m WHERE m.ma_hoi_thoai=c.ma) message_count FROM hoi_thoai c JOIN mon_hoc s ON s.ma=c.ma_mon_hoc AND s.ma_nguoi_dung=c.ma_nguoi_dung WHERE ${where} ORDER BY c.ngay_cap_nhat DESC,c.ma DESC LIMIT ? OFFSET ?`, [...values,pageSize,(page-1)*pageSize]);
    await db.commit(); return { rows,total:Number(count[0].total) };
   } catch(error) { await db.rollback(); throw error; } finally { db.release(); }
  },
 };
}
