export function courseRepository(pool) {
  return {
    async get(owner, id) { return (await pool.execute("SELECT c.*,(SELECT COUNT(*) FROM documents d WHERE d.course_id=c.id AND d.user_id=c.user_id AND d.status='ready' AND d.deleted_at IS NULL) AS ready_count FROM courses c WHERE c.id=? AND c.user_id=?", [id, owner]))[0][0]; },
    async create(owner, input) {
      const [result] = await pool.execute('INSERT INTO courses(user_id,name,description) VALUES (?,?,?)', [owner, input.name, input.description]);
      return this.get(owner, String(result.insertId));
    },
    async patch(owner, id, input) {
      const fields = Object.keys(input); // Strict Zod schema limits this to name/description.
      await pool.execute(`UPDATE courses SET ${fields.map(key => `${key}=?`).join(',')} WHERE id=? AND user_id=?`, [...fields.map(key => input[key]), id, owner]);
      return this.get(owner, id);
    },
    async list(owner, { q, page, pageSize }) {
      // Escape LIKE metacharacters; search text is literal, not a wildcard or SQL fragment.
      const pattern = '%' + q.replace(/[!%_]/g, v => '!' + v) + '%';
      const connection = await pool.getConnection();
      try {
        await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await connection.beginTransaction();
        const [count] = await connection.execute("SELECT COUNT(*) AS total FROM courses WHERE user_id=? AND name LIKE ? ESCAPE '!'", [owner, pattern]);
        const [rows] = await connection.query("SELECT c.*,(SELECT COUNT(*) FROM documents d WHERE d.course_id=c.id AND d.user_id=c.user_id AND d.status='ready' AND d.deleted_at IS NULL) AS ready_count FROM courses c WHERE c.user_id=? AND c.name LIKE ? ESCAPE '!' ORDER BY c.updated_at DESC,c.id DESC LIMIT ? OFFSET ?", [owner, pattern, pageSize, (page - 1) * pageSize]);
        await connection.commit(); return { rows, total: Number(count[0].total) };
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
  };
}
