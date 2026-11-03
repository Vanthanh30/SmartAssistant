// MySQL result tuples and parameter values are preserved at the persistence boundary.
export const sessionRepository = {
  range(db, parameters, filters) {
    return db.execute(
      `SELECT b.*,p.dieu_kien_hoc,p.ma_nguoi_dung,d.ma_mon_hoc FROM buoi_hoc b JOIN ke_hoach_hoc p USING(ma_ke_hoach) JOIN tai_lieu d USING(ma_tai_lieu) JOIN mon_hoc m ON m.ma_mon_hoc=p.ma_mon_hoc AND d.ma_mon_hoc=p.ma_mon_hoc WHERE p.ma_nguoi_dung=? AND m.ma_nguoi_dung=? AND b.bat_dau_luc<? AND b.ket_thuc_luc>?${filters.courseId ? ' AND d.ma_mon_hoc=?' : ''}${filters.status ? ' AND b.trang_thai=?' : ''} ORDER BY b.bat_dau_luc,b.ma_buoi_hoc LIMIT 501`,
      parameters,
    );
  },
  planConditions(db, parameters) {
    return db.execute('SELECT dieu_kien_hoc FROM ke_hoach_hoc WHERE ma_ke_hoach=?', parameters);
  },
  insertPlan(db, parameters) {
    return db.execute(
      "INSERT INTO ke_hoach_hoc(ma_nguoi_dung,ma_mon_hoc,ten_ke_hoach,muc_tieu,ngay_bat_dau,ngay_ket_thuc,so_buoi_mong_muon,dieu_kien_hoc,trang_thai) VALUES(?,?,?,?,?,?,?,?,'đã xác nhận')",
      parameters,
    );
  },
  setGoogleEvent(db, parameters) {
    return db.execute(
      'UPDATE buoi_hoc SET dinh_danh_su_kien_google=? WHERE ma_buoi_hoc=?',
      parameters,
    );
  },
  clearGoogleEvent(db, parameters) {
    return db.execute(
      'UPDATE buoi_hoc SET dinh_danh_su_kien_google=NULL WHERE ma_buoi_hoc=?',
      parameters,
    );
  },
  saveSyncConditions(db, parameters) {
    return db.execute('UPDATE ke_hoach_hoc SET dieu_kien_hoc=? WHERE ma_ke_hoach=?', parameters);
  },
  saveGoogleEvent(db, parameters) {
    return db.execute(
      'UPDATE buoi_hoc SET dinh_danh_su_kien_google=? WHERE ma_buoi_hoc=?',
      parameters,
    );
  },
  requireReconnect(db, parameters) {
    return db.execute(
      "UPDATE ket_noi_google SET trang_thai='cần kết nối lại' WHERE ma_nguoi_dung=?",
      parameters,
    );
  },
  findRequestedSessions(db, parameters, ids) {
    return db.execute(
      `SELECT b.*,p.dieu_kien_hoc,d.ma_mon_hoc FROM buoi_hoc b JOIN ke_hoach_hoc p USING(ma_ke_hoach) JOIN tai_lieu d USING(ma_tai_lieu) WHERE b.ma_buoi_hoc IN (${ids.map(() => '?').join(',')}) AND p.ma_nguoi_dung=?`,
      parameters,
    );
  },
  insertSession(db, parameters) {
    return db.execute(
      "INSERT INTO buoi_hoc(ma_buoi_hoc,ma_ke_hoach,ma_tai_lieu,tieu_de,noi_dung_can_hoc,bat_dau_luc,ket_thuc_luc,nhac_truoc_phut,trang_thai) VALUES(?,?,?,?,?,?,?,?,'đã lên lịch')",
      parameters,
    );
  },
  savePlanConditions(db, parameters) {
    return db.execute('UPDATE ke_hoach_hoc SET dieu_kien_hoc=? WHERE ma_ke_hoach=?', parameters);
  },
  updateSession(db, parameters) {
    return db.execute(
      'UPDATE buoi_hoc SET ma_ke_hoach=?,ma_tai_lieu=?,tieu_de=?,noi_dung_can_hoc=?,bat_dau_luc=?,ket_thuc_luc=?,nhac_truoc_phut=? WHERE ma_buoi_hoc=?',
      parameters,
    );
  },
  setStatus(db, parameters) {
    return db.execute('UPDATE buoi_hoc SET trang_thai=? WHERE ma_buoi_hoc=?', parameters);
  },
};
