// SQL stays on the connection supplied by service/policy; no hidden transactions or connections.
export function conversationRepository(db) {
  return {
    actor: (params = []) => db.execute("SELECT trang_thai,vai_tro FROM nguoi_dung WHERE ma=? FOR UPDATE", params),
    session: (params = []) => db.execute("SELECT ma FROM phien_dang_nhap WHERE ma_nguoi_dung=? AND token_chong_csrf=? AND luc_thu_hoi IS NULL AND luc_het_han>UTC_TIMESTAMP(3) FOR UPDATE", params),
    owned: (params = []) => db.execute("SELECT * FROM hoi_thoai WHERE ma=? AND ma_nguoi_dung=?", params),
    citationRows: (messageIds) => db.execute(`SELECT c.*,d.trang_thai document_status FROM nguon_tra_loi c LEFT JOIN tai_lieu d ON d.ma=c.ma_tai_lieu WHERE c.ma_tin_nhan IN (${messageIds.map(() => '?').join(',')}) ORDER BY c.ma`, messageIds),
    request: (params = []) => db.execute("SELECT * FROM tin_nhan WHERE ma_hoi_thoai=? AND ma_yeu_cau=? AND vai_tro='user'", params),
    interrupt: (params = []) => db.execute("UPDATE tin_nhan SET trang_thai='failed',ma_loi='REQUEST_INTERRUPTED',ma_trang_thai_loi=409 WHERE ma=?", params),
    answer: (params = []) => db.execute("SELECT * FROM tin_nhan WHERE ma_hoi_thoai=? AND ma_yeu_cau=? AND vai_tro='assistant'", params),
    course: (params = []) => db.execute("SELECT ma FROM mon_hoc WHERE ma=? AND ma_nguoi_dung=?", params),
    insertConversation: (params = []) => db.execute("INSERT INTO hoi_thoai(ma_mon_hoc,ma_nguoi_dung,tieu_de) VALUES(?,?,?)", params),
    snapshot: (params = []) => db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', params),
    courseName: (params = []) => db.execute("SELECT ten FROM mon_hoc WHERE ma=? AND ma_nguoi_dung=?", params),
    cursor: (params = []) => db.execute("SELECT ma FROM tin_nhan WHERE ma=? AND ma_hoi_thoai=?", params),
    transcript: (beforeMessageId, params = []) => db.query(`SELECT * FROM tin_nhan WHERE ma_hoi_thoai=?${beforeMessageId ? ' AND id<?' : ''} ORDER BY ma DESC LIMIT ?`, params),
    acquireLock: (params = []) => db.execute('SELECT GET_LOCK(?,0) acquired', params),
    lockOwned: (params = []) => db.execute("SELECT ma FROM hoi_thoai WHERE ma=? AND ma_nguoi_dung=? FOR UPDATE", params),
    deleteConversation: (params = []) => db.execute("DELETE FROM hoi_thoai WHERE ma=? AND ma_nguoi_dung=?", params),
    releaseLock: (params = []) => db.execute('SELECT RELEASE_LOCK(?)', params),
    readyDocument: (params = []) => db.execute("SELECT ma FROM tai_lieu WHERE ma=? AND ma_nguoi_dung=? AND ma_mon_hoc=? AND trang_thai='ready' AND luc_xoa IS NULL", params),
    dailyUsage: (params = []) => db.execute("SELECT COUNT(*) total FROM luot_hoi_dap WHERE ma_nguoi_dung=? AND luc_tinh_luot>=UTC_DATE()", params),
    minuteUsage: (params = []) => db.execute("SELECT COUNT(*) total FROM luot_hoi_dap WHERE ma_nguoi_dung=? AND luc_tinh_luot>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE)", params),
    reserveQuestion: (params = []) => db.execute("INSERT INTO tin_nhan(ma_hoi_thoai,ma_yeu_cau,ma_bam_dau_vao,vai_tro,noi_dung,trang_thai) VALUES(?,?,?,'user',?,'processing')", params),
    chargeUsage: (params = []) => db.execute("INSERT INTO luot_hoi_dap(ma_nguoi_dung) VALUES(?)", params),
    initialTitle: (params = []) => db.execute("UPDATE hoi_thoai SET tieu_de=? WHERE ma=? AND tieu_de='Hội thoại mới' AND (SELECT COUNT(*) FROM tin_nhan WHERE ma_hoi_thoai=?)=1", params),
    recentTurns: (params = []) => db.query("SELECT vai_tro,noi_dung FROM tin_nhan WHERE ma_hoi_thoai=? AND trang_thai='answered' ORDER BY ma DESC LIMIT 6", params),
    verifyContext: (ids, owner, course) => db.execute(`SELECT ch.ma FROM doan_tai_lieu ch JOIN tai_lieu d ON d.ma=ch.ma_tai_lieu
                WHERE ch.ma IN (${ids.map(() => '?').join(',')}) AND d.ma_nguoi_dung=? AND d.ma_mon_hoc=? AND d.trang_thai='ready' AND d.luc_xoa IS NULL`, [...ids,owner,course]),
    lockDocument: (params = []) => db.execute("SELECT ma FROM tai_lieu WHERE ma=? AND ma_nguoi_dung=? AND ma_mon_hoc=? AND trang_thai='ready' AND luc_xoa IS NULL FOR UPDATE", params),
    lockChunk: (params = []) => db.execute("SELECT ma FROM doan_tai_lieu WHERE ma=? AND ma_tai_lieu=? FOR UPDATE", params),
    insertAnswer: (params = []) => db.execute("INSERT INTO tin_nhan(ma_hoi_thoai,ma_yeu_cau,ma_bam_dau_vao,vai_tro,noi_dung,trang_thai,mo_hinh,do_tre_ms,nguon_tra_loi,cac_khoi_tra_loi) VALUES(?,?,?,'assistant',?,?,?,?,?,?)", params),
    insertCitation: (params = []) => db.execute("INSERT INTO nguon_tra_loi(ma_tin_nhan,ma_doan,ma_tai_lieu,ten_tep_nguon,tu_trang,den_trang,noi_dung_nguon_chup_lai,diem) VALUES(?,?,?,?,?,?,?,?)", params),
    completeQuestion: (params = []) => db.execute("UPDATE tin_nhan SET trang_thai=?,do_tre_ms=?,nguon_tra_loi=? WHERE ma_hoi_thoai=? AND ma_yeu_cau=? AND vai_tro='user'", params),
    touchConversation: (params = []) => db.execute("UPDATE hoi_thoai SET ngay_cap_nhat=CURRENT_TIMESTAMP(3) WHERE ma=?", params),
    failQuestion: (params = []) => db.execute("UPDATE tin_nhan SET trang_thai='failed',ma_loi=?,ma_trang_thai_loi=?,do_tre_ms=? WHERE ma_hoi_thoai=? AND ma_yeu_cau=? AND vai_tro='user' AND trang_thai='processing'", params),
    neighbours: (conditions, params) => db.execute(`SELECT ch.*,d.ten_tep_goc FROM doan_tai_lieu ch JOIN tai_lieu d ON d.ma=ch.ma_tai_lieu
      WHERE d.ma_nguoi_dung=? AND d.ma_mon_hoc=? AND d.trang_thai='ready' AND d.luc_xoa IS NULL
      AND (${conditions.join(' OR ')}) ORDER BY ch.ma_tai_lieu,ch.thu_tu_doan`, params),
  };
}
