export function courseRepository(pool) {
  return {
    async get(owner, id) { return (await pool.execute("SELECT c.*,(SELECT COUNT(*) FROM tai_lieu d WHERE d.ma_mon_hoc=c.ma AND d.ma_nguoi_dung=c.ma_nguoi_dung AND d.trang_thai='ready' AND d.luc_xoa IS NULL) AS ready_count FROM mon_hoc c WHERE c.ma=? AND c.ma_nguoi_dung=?", [id, owner]))[0][0]; },
    async create(owner, input) {
      const [result] = await pool.execute("INSERT INTO mon_hoc(ma_nguoi_dung,ten,mo_ta) VALUES (?,?,?)", [owner, input.name, input.description]);
      return this.get(owner, String(result.insertId));
    },
    async patch(owner, id, input) {
      const fields = Object.keys(input); // Strict Zod schema limits this to name/description.
      await pool.execute(`UPDATE mon_hoc SET ${fields.map(key => `${{name:'ten',description:'mo_ta'}[key]}=?`).join(',')} WHERE ma=? AND ma_nguoi_dung=?`, [...fields.map(key => input[key]), id, owner]);
      return this.get(owner, id);
    },
    async list(owner, { q, page, pageSize }) {
      // Escape LIKE metacharacters; search text is literal, not a wildcard or SQL fragment.
      const pattern = '%' + q.replace(/[!%_]/g, v => '!' + v) + '%';
      const connection = await pool.getConnection();
      try {
        await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await connection.beginTransaction();
        const [count] = await connection.execute("SELECT COUNT(*) AS total FROM mon_hoc WHERE ma_nguoi_dung=? AND ten LIKE ? ESCAPE '!'", [owner, pattern]);
        const [rows] = await connection.query("SELECT c.*,(SELECT COUNT(*) FROM tai_lieu d WHERE d.ma_mon_hoc=c.ma AND d.ma_nguoi_dung=c.ma_nguoi_dung AND d.trang_thai='ready' AND d.luc_xoa IS NULL) AS ready_count FROM mon_hoc c WHERE c.ma_nguoi_dung=? AND c.ten LIKE ? ESCAPE '!' ORDER BY c.ngay_cap_nhat DESC,c.ma DESC LIMIT ? OFFSET ?", [owner, pattern, pageSize, (page - 1) * pageSize]);
        await connection.commit(); return { rows, total: Number(count[0].total) };
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
  };
}
