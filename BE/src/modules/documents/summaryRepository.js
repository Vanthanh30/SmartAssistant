export const summaryRepository = {
  document(db, owner, course, id, lock = false) {
    return db.execute(
      `SELECT d.* FROM tai_lieu d JOIN mon_hoc m USING(ma_mon_hoc) WHERE m.ma_nguoi_dung=? AND d.ma_mon_hoc=? AND d.ma_tai_lieu=? AND d.ngay_xoa IS NULL AND d.trang_thai='sẵn sàng'${lock ? ' FOR UPDATE' : ''}`,
      [owner, course, id],
    );
  },
  chunks(db, id) {
    return db.execute(
      'SELECT * FROM doan_tai_lieu WHERE ma_tai_lieu=? ORDER BY thu_tu_doan LIMIT 4097',
      [id],
    );
  },
  acquire(db, name) {
    return db.execute('SELECT GET_LOCK(?,0) n', [name]);
  },
  release(db, name) {
    return db.execute('SELECT RELEASE_LOCK(?)', [name]);
  },
  save(db, content, id) {
    return db.execute('UPDATE tai_lieu SET noi_dung_tom_tat=? WHERE ma_tai_lieu=?', [content, id]);
  },
};
