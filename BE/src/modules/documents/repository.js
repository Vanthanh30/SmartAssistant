// MySQL result tuples and parameter values are preserved at the persistence boundary.
export const documentRepository = {
  acquireCourseLock(db, parameters) {
    return db.execute('SELECT GET_LOCK(?,0) n', parameters);
  },
  releaseCourseLock(db, parameters) {
    return db.execute('SELECT RELEASE_LOCK(?)', parameters);
  },
  indexDocuments(db, parameters) {
    return db.execute(
      "SELECT d.* FROM tai_lieu d JOIN mon_hoc m USING(ma_mon_hoc) WHERE m.ma_nguoi_dung=? AND d.ma_mon_hoc=? AND d.ngay_xoa IS NULL AND (d.trang_thai='sẵn sàng' OR d.ma_tai_lieu=?) ORDER BY d.ma_tai_lieu",
      parameters,
    );
  },
  updateIndexPositions(db, parameters) {
    return db.execute(
      'UPDATE bieu_dien_noi_dung b JOIN doan_tai_lieu ch ON ch.ma_vec_to=b.ma_bieu_dien JOIN tai_lieu d USING(ma_tai_lieu) SET b.dinh_danh_chi_muc=?,b.ma_trong_chi_muc=? WHERE ch.ma_doan_tai_lieu=? AND d.ma_mon_hoc=?',
      parameters,
    );
  },
  countCourseDocuments(db, parameters) {
    return db.execute(
      'SELECT COUNT(*) n FROM tai_lieu WHERE ma_mon_hoc=? AND ngay_xoa IS NULL',
      parameters,
    );
  },
  listCourseDocuments(db, parameters) {
    return db.query(
      'SELECT * FROM tai_lieu WHERE ma_mon_hoc=? AND ngay_xoa IS NULL ORDER BY ma_tai_lieu DESC LIMIT ? OFFSET ?',
      parameters,
    );
  },
  ownerDocuments(db, parameters) {
    return db.execute(
      'SELECT d.* FROM tai_lieu d JOIN mon_hoc m USING(ma_mon_hoc) WHERE m.ma_nguoi_dung=? AND d.ngay_xoa IS NULL LIMIT 5001',
      parameters,
    );
  },
  insertDocument(db, parameters) {
    return db.execute(
      'INSERT INTO tai_lieu(ma_mon_hoc,ten_tai_lieu,ma_bam_tap_tin,cau_hinh_xu_ly) VALUES(?,?,?,?)',
      parameters,
    );
  },
  acquireUploadLock(db, parameters) {
    return db.execute('SELECT GET_LOCK(?,0) n', parameters);
  },
  countReadyDocuments(db, parameters) {
    return db.execute(
      "SELECT COUNT(*) n FROM tai_lieu WHERE ma_mon_hoc=? AND trang_thai='sẵn sàng' AND ngay_xoa IS NULL",
      parameters,
    );
  },
  releaseUploadLock(db, parameters) {
    return db.execute('SELECT RELEASE_LOCK(?)', parameters);
  },
  saveProcessingConfig(db, parameters) {
    return db.execute('UPDATE tai_lieu SET cau_hinh_xu_ly=? WHERE ma_tai_lieu=?', parameters);
  },
  markProcessing(db, parameters) {
    return db.execute(
      "UPDATE tai_lieu SET trang_thai='đang xử lý',ngay_xu_ly=NULL WHERE ma_tai_lieu=?",
      parameters,
    );
  },
  saveCloudAsset(db, parameters) {
    return db.execute('UPDATE tai_lieu SET dinh_danh_dam_may=? WHERE ma_tai_lieu=?', parameters);
  },
  upsertChunk(db, parameters) {
    return db.execute(
      'INSERT INTO doan_tai_lieu(ma_tai_lieu,thu_tu_doan,noi_dung,ma_bam_doan,trang_bat_dau,trang_ket_thuc,vi_tri_tren_trang) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE noi_dung=VALUES(noi_dung),ma_bam_doan=VALUES(ma_bam_doan),trang_bat_dau=VALUES(trang_bat_dau),trang_ket_thuc=VALUES(trang_ket_thuc),vi_tri_tren_trang=VALUES(vi_tri_tren_trang)',
      parameters,
    );
  },
  findChunkByOrder(db, parameters) {
    return db.execute(
      'SELECT ma_doan_tai_lieu FROM doan_tai_lieu WHERE ma_tai_lieu=? AND thu_tu_doan=?',
      parameters,
    );
  },
  obsoleteVectors(db, parameters, orders) {
    return db.execute(
      `SELECT ma_vec_to FROM doan_tai_lieu WHERE ma_tai_lieu=? AND thu_tu_doan NOT IN (${orders.map(() => '?').join(',')})`,
      parameters,
    );
  },
  deleteObsoleteChunks(db, parameters, orders) {
    return db.execute(
      `DELETE FROM doan_tai_lieu WHERE ma_tai_lieu=? AND thu_tu_doan NOT IN (${orders.map(() => '?').join(',')})`,
      parameters,
    );
  },
  deleteUnreferencedVector(db, parameters) {
    return db.execute(
      'DELETE FROM bieu_dien_noi_dung WHERE ma_bieu_dien=? AND NOT EXISTS(SELECT 1 FROM doan_tai_lieu WHERE ma_vec_to=?)',
      parameters,
    );
  },
  chunkVector(db, parameters) {
    return db.execute('SELECT ma_vec_to FROM doan_tai_lieu WHERE ma_doan_tai_lieu=?', parameters);
  },
  updateVector(db, parameters) {
    return db.execute(
      'UPDATE bieu_dien_noi_dung SET ma_dinh_danh=?,ten_mo_hinh=?,dinh_danh_chi_muc=?,ma_trong_chi_muc=? WHERE ma_bieu_dien=?',
      parameters,
    );
  },
  insertVector(db, parameters) {
    return db.execute(
      'INSERT INTO bieu_dien_noi_dung(ma_dinh_danh,ten_mo_hinh,dinh_danh_chi_muc,ma_trong_chi_muc) VALUES(?,?,?,?)',
      parameters,
    );
  },
  attachVector(db, parameters) {
    return db.execute('UPDATE doan_tai_lieu SET ma_vec_to=? WHERE ma_doan_tai_lieu=?', parameters);
  },
  markReady(db, parameters) {
    return db.execute(
      "UPDATE tai_lieu SET so_trang=?,cau_hinh_xu_ly=?,trang_thai='sẵn sàng',ngay_xu_ly=UTC_TIMESTAMP() WHERE ma_tai_lieu=?",
      parameters,
    );
  },
  markFailed(db, parameters) {
    return db.execute(
      "UPDATE tai_lieu SET trang_thai='thất bại',cau_hinh_xu_ly=? WHERE ma_tai_lieu=? AND trang_thai='đang xử lý'",
      parameters,
    );
  },
  markDeleting(db, parameters) {
    return db.execute("UPDATE tai_lieu SET trang_thai='đang xóa' WHERE ma_tai_lieu=?", parameters);
  },
  markDeleted(db, parameters) {
    return db.execute(
      "UPDATE tai_lieu SET ngay_xoa=UTC_TIMESTAMP(),trang_thai='đã xóa' WHERE ma_tai_lieu=?",
      parameters,
    );
  },
};
