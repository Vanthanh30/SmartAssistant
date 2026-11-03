import { AppError } from '../../shared/AppError.js';
export function createCourseRepository(db) {
  const columns = `c.ma_mon_hoc id,c.ten_mon_hoc name,c.mo_ta description,c.ngay_tao created_at,c.ngay_tao updated_at,(SELECT COUNT(*) FROM tai_lieu d WHERE d.ma_mon_hoc=c.ma_mon_hoc AND d.ngay_xoa IS NULL AND d.trang_thai='sẵn sàng') ready_count`;
  return {
    async get(owner, id) {
      return (
        await db.execute(
          `SELECT ${columns} FROM mon_hoc c WHERE c.ma_mon_hoc=? AND c.ma_nguoi_dung=?`,
          [id, owner],
        )
      )[0][0];
    },
    async create(owner, input) {
      const [r] = await db.execute(
        'INSERT INTO mon_hoc(ma_nguoi_dung,ten_mon_hoc,mo_ta) VALUES(?,?,?)',
        [owner, input.name, input.description],
      );
      return this.get(owner, String(r.insertId));
    },
    async remove(owner, id) {
      const tx = await db.getConnection();
      try {
        await tx.beginTransaction();
        const [rows] = await tx.execute(
          "SELECT m.ma_mon_hoc FROM mon_hoc m JOIN nguoi_dung u USING(ma_nguoi_dung) WHERE m.ma_mon_hoc=? AND m.ma_nguoi_dung=? AND u.trang_thai='hoạt động' FOR UPDATE",
          [id, owner],
        );
        if (!rows.length) throw new AppError(404, 'COURSE_NOT_FOUND', 'Không tìm thấy môn học.');
        await tx.execute('DELETE FROM mon_hoc WHERE ma_mon_hoc=? AND ma_nguoi_dung=?', [id, owner]);
        await tx.commit();
        return { deleted: true };
      } catch (e) {
        await tx.rollback();
        if (e.code === 'ER_ROW_IS_REFERENCED_2')
          throw new AppError(
            409,
            'COURSE_HAS_DATA',
            'Môn học còn tài liệu, hội thoại, bài ôn tập hoặc kế hoạch nên không thể xóa.',
          );
        throw e;
      } finally {
        tx.release();
      }
    },
    async patch(owner, id, input) {
      const fields = Object.keys(input);
      await db.execute(
        `UPDATE mon_hoc SET ${fields.map((k) => ({ name: 'ten_mon_hoc', description: 'mo_ta' })[k] + '=?').join(',')} WHERE ma_mon_hoc=? AND ma_nguoi_dung=?`,
        [...fields.map((k) => input[k]), id, owner],
      );
      return this.get(owner, id);
    },
    async list(owner, { q, page, pageSize }) {
      const pattern = '%' + q.replace(/[!%_]/g, (v) => '!' + v) + '%';
      const [count] = await db.execute(
        "SELECT COUNT(*) total FROM mon_hoc WHERE ma_nguoi_dung=? AND ten_mon_hoc LIKE ? ESCAPE '!'",
        [owner, pattern],
      );
      const [rows] = await db.query(
        `SELECT ${columns} FROM mon_hoc c WHERE c.ma_nguoi_dung=? AND c.ten_mon_hoc LIKE ? ESCAPE '!' ORDER BY c.ma_mon_hoc DESC LIMIT ? OFFSET ?`,
        [owner, pattern, pageSize, (page - 1) * pageSize],
      );
      return { rows, total: Number(count[0].total) };
    },
  };
}

export { createCourseRepository as courseRepository };
