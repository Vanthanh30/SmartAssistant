// MySQL result tuples and parameter values are preserved at the persistence boundary.
export const conversationRepository = {
  citationsForTurns(db, ids) {
    return db.execute(
      `SELECT n.*,d.ma_tai_lieu,d.ngay_xoa,d.trang_thai current_status,d.ma_bam_tap_tin current_document_hash,ch.noi_dung current_content,ch.vi_tri_tren_trang current_position FROM ngu_canh_hoi_dap n JOIN doan_tai_lieu ch USING(ma_doan_tai_lieu) JOIN tai_lieu d USING(ma_tai_lieu) WHERE n.ma_luot_hoi_dap IN (${ids.map(() => '?').join(',')}) AND n.thu_tu_trich_dan IS NOT NULL ORDER BY n.ma_luot_hoi_dap,n.thu_tu_trich_dan`,
      ids,
    );
  },
  async history(pool, owner, f) {
    const pattern = '%' + (f.q || '').replace(/[!%_]/g, (v) => '!' + v) + '%';
    const args = [
      owner,
      ...(f.courseId ? [f.courseId] : []),
      ...(f.q ? [pattern, pattern, pattern] : []),
    ];
    const where =
      'm.ma_nguoi_dung=?' +
      (f.courseId ? ' AND m.ma_mon_hoc=?' : '') +
      (f.q
        ? " AND (h.tieu_de LIKE ? ESCAPE '!' OR EXISTS(SELECT 1 FROM luot_hoi_dap q WHERE q.ma_hoi_thoai=h.ma_hoi_thoai AND (q.cau_hoi LIKE ? ESCAPE '!' OR q.noi_dung_tra_loi LIKE ? ESCAPE '!')))"
        : '');
    const [[count]] = await pool.execute(
      `SELECT COUNT(*) n FROM hoi_thoai h JOIN mon_hoc m USING(ma_mon_hoc) WHERE ${where}`,
      args,
    );
    const [rows] = await pool.query(
      `SELECT h.*,m.ten_mon_hoc,(SELECT COUNT(*)*2 FROM luot_hoi_dap q WHERE q.ma_hoi_thoai=h.ma_hoi_thoai) n FROM hoi_thoai h JOIN mon_hoc m USING(ma_mon_hoc) WHERE ${where} ORDER BY h.ngay_cap_nhat DESC,h.ma_hoi_thoai DESC LIMIT ? OFFSET ?`,
      [...args, f.pageSize, (f.page - 1) * f.pageSize],
    );
    return { rows, count };
  },
  citations(db, parameters) {
    return db.execute(
      'SELECT n.*,d.ma_tai_lieu,d.ngay_xoa,d.trang_thai current_status,d.ma_bam_tap_tin current_document_hash,ch.noi_dung current_content,ch.vi_tri_tren_trang current_position FROM ngu_canh_hoi_dap n JOIN doan_tai_lieu ch USING(ma_doan_tai_lieu) JOIN tai_lieu d USING(ma_tai_lieu) WHERE n.ma_luot_hoi_dap=? AND n.thu_tu_trich_dan IS NOT NULL ORDER BY n.thu_tu_trich_dan',
      parameters,
    );
  },
  currentSources(db, parameters, sources) {
    return db.execute(
      `SELECT ch.ma_doan_tai_lieu,ch.ma_tai_lieu,ch.noi_dung,ch.vi_tri_tren_trang current_position,d.ma_bam_tap_tin current_document_hash FROM doan_tai_lieu ch JOIN tai_lieu d USING(ma_tai_lieu) JOIN mon_hoc m USING(ma_mon_hoc) WHERE ch.ma_doan_tai_lieu IN (${sources.map(() => '?').join(',')}) AND m.ma_nguoi_dung=? AND d.ma_mon_hoc=? AND d.ngay_xoa IS NULL AND d.trang_thai='sẵn sàng'`,
      parameters,
    );
  },
  insertConversation(db, parameters) {
    return db.execute('INSERT INTO hoi_thoai(ma_mon_hoc,tieu_de) VALUES(?,?)', parameters);
  },

  findCursor(db, parameters) {
    return db.execute(
      'SELECT ma_luot_hoi_dap FROM luot_hoi_dap WHERE ma_hoi_thoai=? AND ma_luot_hoi_dap=?',
      parameters,
    );
  },
  transcript(db, parameters, beforeMessageId) {
    return db.query(
      `SELECT * FROM luot_hoi_dap WHERE ma_hoi_thoai=?${beforeMessageId ? ' AND ma_luot_hoi_dap<?' : ''} ORDER BY ma_luot_hoi_dap DESC LIMIT ?`,
      parameters,
    );
  },
  acquireConversationLock(db, parameters) {
    return db.execute('SELECT GET_LOCK(?,0) n', parameters);
  },
  findRequest(db, parameters) {
    return db.execute(
      "SELECT * FROM luot_hoi_dap WHERE ma_hoi_thoai=? AND JSON_UNQUOTE(JSON_EXTRACT(noi_dung_tra_loi,'$.metadata.requestId'))=?",
      parameters,
    );
  },
  readyDocuments(db, parameters) {
    return db.execute(
      "SELECT d.ma_tai_lieu FROM tai_lieu d JOIN mon_hoc m USING(ma_mon_hoc) WHERE m.ma_nguoi_dung=? AND d.ma_mon_hoc=? AND d.ngay_xoa IS NULL AND d.trang_thai='sẵn sàng'",
      parameters,
    );
  },
  insertTurn(db, parameters) {
    return db.execute(
      'INSERT INTO luot_hoi_dap(ma_hoi_thoai,cau_hoi,noi_dung_tra_loi) VALUES(?,?,?)',
      parameters,
    );
  },
  insertScope(db, parameters) {
    return db.execute(
      'INSERT INTO pham_vi_hoi_dap(ma_luot_hoi_dap,ma_tai_lieu) VALUES(?,?)',
      parameters,
    );
  },
  recentAnswers(db, parameters) {
    return db.query(
      "SELECT cau_hoi,cau_hoi_truy_hoi,noi_dung_tra_loi FROM luot_hoi_dap WHERE ma_hoi_thoai=? AND ma_luot_hoi_dap<? AND trang_thai='đã trả lời' ORDER BY ma_luot_hoi_dap DESC LIMIT 8",
      parameters,
    );
  },
  insertContext(db, parameters) {
    return db.execute(
      'INSERT INTO ngu_canh_hoi_dap(ma_luot_hoi_dap,ma_doan_tai_lieu,diem_tuong_dong,thu_hang,thu_tu_trich_dan,noi_dung_ngu_canh,thong_tin_nguon,vi_tri_trich_dan) VALUES(?,?,?,?,?,?,?,?)',
      parameters,
    );
  },
  completeTurn(db, parameters) {
    return db.execute(
      'UPDATE luot_hoi_dap SET cau_hoi_truy_hoi=?,noi_dung_tra_loi=?,mo_hinh_llm=?,ket_qua_kiem_chung=?,trang_thai=?,thoi_diem_tra_loi=UTC_TIMESTAMP() WHERE ma_luot_hoi_dap=?',
      parameters,
    );
  },
  touchConversation(db, parameters) {
    return db.execute(
      "UPDATE hoi_thoai SET ngay_cap_nhat=UTC_TIMESTAMP(),tieu_de=IF(tieu_de='Hội thoại mới',?,tieu_de) WHERE ma_hoi_thoai=?",
      parameters,
    );
  },
  findTurn(db, parameters) {
    return db.execute('SELECT * FROM luot_hoi_dap WHERE ma_luot_hoi_dap=?', parameters);
  },
  failTurn(db, parameters) {
    return db.execute(
      "UPDATE luot_hoi_dap SET trang_thai='thất bại',noi_dung_tra_loi=?,thoi_diem_tra_loi=UTC_TIMESTAMP() WHERE ma_luot_hoi_dap=?",
      parameters,
    );
  },
  releaseConversationLock(db, parameters) {
    return db.execute('SELECT RELEASE_LOCK(?)', parameters);
  },
  deleteTurnRelations(db, parameters, table) {
    return db.execute(
      `DELETE s FROM ${table} s JOIN luot_hoi_dap q USING(ma_luot_hoi_dap) WHERE q.ma_hoi_thoai=?`,
      parameters,
    );
  },
  deleteTurns(db, parameters) {
    return db.execute('DELETE FROM luot_hoi_dap WHERE ma_hoi_thoai=?', parameters);
  },
  deleteConversation(db, parameters) {
    return db.execute('DELETE FROM hoi_thoai WHERE ma_hoi_thoai=?', parameters);
  },
};
