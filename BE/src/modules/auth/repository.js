// MySQL result tuples and parameter values are preserved at the persistence boundary.
export const authRepository = {
  lockActor(db, parameters) {
    return db.execute(
      'SELECT trang_thai,vai_tro FROM nguoi_dung WHERE ma_nguoi_dung=? FOR UPDATE',
      parameters,
    );
  },
  findUser(db, parameters) {
    return db.execute('SELECT * FROM nguoi_dung WHERE ma_nguoi_dung=?', parameters);
  },
  insertUser(db, parameters) {
    return db.execute('INSERT INTO nguoi_dung(ho_ten,email,mat_khau) VALUES(?,?,?)', parameters);
  },
  findByEmail(db, parameters) {
    return db.execute('SELECT * FROM nguoi_dung WHERE email=?', parameters);
  },
  lockUser(db, parameters) {
    return db.execute(
      'SELECT ma_nguoi_dung FROM nguoi_dung WHERE ma_nguoi_dung=? FOR UPDATE',
      parameters,
    );
  },
};
