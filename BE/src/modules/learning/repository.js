// MySQL result tuples and parameter values are preserved at the persistence boundary.
export const learningRepository = {
  findCitationChunk(db, parameters) {
    return db.execute(
      'SELECT ch.ma_doan_tai_lieu FROM doan_tai_lieu ch WHERE ch.ma_doan_tai_lieu=? AND ch.ma_tai_lieu=?',
      parameters,
    );
  },
  attemptAnswers(db, parameters) {
    return db.execute('SELECT * FROM chi_tiet_lam_bai WHERE ma_lan_lam_bai=?', parameters);
  },
  findItem(db, parameters) {
    return db.execute(
      'SELECT * FROM cau_hoi_on_tap WHERE ma_cau_hoi=? AND ma_bai_on_tap=?',
      parameters,
    );
  },
  findAnswer(db, parameters) {
    return db.execute(
      'SELECT * FROM chi_tiet_lam_bai WHERE ma_lan_lam_bai=? AND ma_cau_hoi=?',
      parameters,
    );
  },
  insertAnswer(db, parameters) {
    return db.execute(
      'INSERT INTO chi_tiet_lam_bai(ma_lan_lam_bai,ma_cau_hoi,tra_loi_nguoi_dung,tra_loi_dung,muc_do_ghi_nho) VALUES(?,?,?,?,?)',
      parameters,
    );
  },
  countSets(db, parameters) {
    return db.execute(
      "SELECT COUNT(*) n FROM bai_on_tap WHERE ma_mon_hoc=? AND trang_thai<>'đã lưu trữ'",
      parameters,
    );
  },
  listSets(db, parameters) {
    return db.query(
      "SELECT b.*,(SELECT COUNT(*) FROM cau_hoi_on_tap q WHERE q.ma_bai_on_tap=b.ma_bai_on_tap) n,(SELECT COUNT(DISTINCT j.id) FROM cau_hoi_on_tap q JOIN JSON_TABLE(q.nguon_tham_khao,'$.sources[*]' COLUMNS(id VARCHAR(64) PATH '$.ma_doan_goc')) j WHERE q.ma_bai_on_tap=b.ma_bai_on_tap) source_count FROM bai_on_tap b WHERE b.ma_mon_hoc=? AND b.trang_thai<>'đã lưu trữ' ORDER BY b.ngay_tao DESC,b.ma_bai_on_tap DESC LIMIT ? OFFSET ?",
      parameters,
    );
  },
  findOwnedSet(db, parameters) {
    return db.execute(
      'SELECT b.* FROM bai_on_tap b JOIN mon_hoc m USING(ma_mon_hoc) WHERE b.ma_bai_on_tap=? AND m.ma_nguoi_dung=?',
      parameters,
    );
  },
  findSet(db, parameters) {
    return db.execute('SELECT ma_bai_on_tap FROM bai_on_tap WHERE ma_bai_on_tap=?', parameters);
  },
  findReusable(db, parameters) {
    return db.execute(
      "SELECT b.ma_bai_on_tap FROM bai_on_tap b JOIN mon_hoc m USING(ma_mon_hoc) WHERE b.ma_mon_hoc=? AND m.ma_nguoi_dung=? AND b.trang_thai='sẵn sàng' AND JSON_UNQUOTE(JSON_EXTRACT(b.cau_hinh_tao,'$.reuseFingerprint'))=? AND JSON_UNQUOTE(JSON_EXTRACT(b.cau_hinh_tao,'$.verified'))='true' ORDER BY b.ngay_tao DESC LIMIT 1",
      parameters,
    );
  },
  insertSet(db, parameters) {
    return db.execute(
      'INSERT INTO bai_on_tap(ma_bai_on_tap,ma_mon_hoc,ten_bai_on_tap,loai_bai,nguon_tao,mo_hinh_tao,cau_hinh_tao) VALUES(?,?,?,?,?,?,?)',
      parameters,
    );
  },
  insertItem(db, parameters) {
    return db.execute(
      'INSERT INTO cau_hoi_on_tap(ma_bai_on_tap,thu_tu,noi_dung_cau_hoi,phuong_an,dap_an,giai_thich,nguon_tham_khao) VALUES(?,?,?,?,?,?,?)',
      parameters,
    );
  },
  findAttempt(db, parameters) {
    return db.execute(
      'SELECT ma_bai_on_tap,ma_nguoi_dung FROM lan_lam_bai WHERE ma_lan_lam_bai=?',
      parameters,
    );
  },
  insertAttempt(db, parameters) {
    return db.execute(
      "INSERT INTO lan_lam_bai(ma_lan_lam_bai,ma_bai_on_tap,ma_nguoi_dung,trang_thai,bat_dau_luc) VALUES(?,?,?,'đang làm',UTC_TIMESTAMP())",
      parameters,
    );
  },
  submittedAnswers(db, parameters) {
    return db.execute('SELECT * FROM chi_tiet_lam_bai WHERE ma_lan_lam_bai=?', parameters);
  },
  completeAttempt(db, parameters) {
    return db.execute(
      "UPDATE lan_lam_bai SET diem=?,trang_thai='hoàn thành',hoan_thanh_luc=UTC_TIMESTAMP(3) WHERE ma_lan_lam_bai=?",
      parameters,
    );
  },
  listAttempts(db, parameters) {
    return db.execute(
      'SELECT a.*,(SELECT COUNT(*) FROM cau_hoi_on_tap WHERE ma_bai_on_tap=a.ma_bai_on_tap) total,(SELECT COUNT(*) FROM chi_tiet_lam_bai WHERE ma_lan_lam_bai=a.ma_lan_lam_bai AND tra_loi_dung=1) correct FROM lan_lam_bai a WHERE a.ma_bai_on_tap=? AND a.ma_nguoi_dung=? ORDER BY a.bat_dau_luc DESC LIMIT 50',
      parameters,
    );
  },
  setAttempts(db, parameters) {
    return db.execute(
      'SELECT ma_lan_lam_bai FROM lan_lam_bai WHERE ma_bai_on_tap=? LIMIT 1',
      parameters,
    );
  },
  deleteItems(db, parameters) {
    return db.execute('DELETE FROM cau_hoi_on_tap WHERE ma_bai_on_tap=?', parameters);
  },
  deleteAttemptDetails(db, parameters) {
    return db.execute(
      'DELETE c FROM chi_tiet_lam_bai c JOIN lan_lam_bai a USING(ma_lan_lam_bai) JOIN cau_hoi_on_tap q USING(ma_cau_hoi) WHERE a.ma_bai_on_tap=? OR q.ma_bai_on_tap=?',
      parameters,
    );
  },
  deleteAttempts(db, parameters) {
    return db.execute('DELETE FROM lan_lam_bai WHERE ma_bai_on_tap=?', parameters);
  },
  deleteSet(db, parameters) {
    return db.execute('DELETE FROM bai_on_tap WHERE ma_bai_on_tap=?', parameters);
  },
};
