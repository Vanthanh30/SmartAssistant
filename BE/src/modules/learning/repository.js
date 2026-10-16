// Parameterized SQL; callers supply the pool or their short-lived transaction connection.
export function learningRepository(db) {
  return {
    actor: (params) => db.execute("SELECT trang_thai,vai_tro FROM nguoi_dung WHERE ma=? FOR UPDATE",params),
    session: (params) => db.execute("SELECT ma FROM phien_dang_nhap WHERE ma_nguoi_dung=? AND token_chong_csrf=? AND luc_thu_hoi IS NULL AND luc_het_han>UTC_TIMESTAMP(3) FOR UPDATE",params),
    course: (params) => db.execute("SELECT ma FROM mon_hoc WHERE ma=? AND ma_nguoi_dung=?",params),
    set: (params, lock = false) => db.execute(`SELECT s.*,(SELECT COUNT(*) FROM muc_hoc_tap WHERE ma_bo_hoc=s.ma) item_count FROM bo_hoc_tap s WHERE s.ma=? AND s.ma_nguoi_dung=?${lock ? ' FOR UPDATE' : ''}`,params),
    verifySource: async ([chunkId,documentId,owner,courseId], lock = false) => {
      // Document before chunk, matching deletion finalization's lock order.
      const [documents] = await db.execute(`SELECT ma FROM tai_lieu WHERE ma=? AND ma_nguoi_dung=? AND ma_mon_hoc=? AND trang_thai='ready' AND luc_xoa IS NULL${lock ? ' FOR UPDATE' : ''}`,[documentId,owner,courseId]);
      if (!documents.length) return [[],[]];
      return db.execute(`SELECT ma FROM doan_tai_lieu WHERE ma=? AND ma_tai_lieu=?${lock ? ' FOR UPDATE' : ''}`,[chunkId,documentId]);
    },
    items: (params) => db.execute("SELECT * FROM muc_hoc_tap WHERE ma_bo_hoc=? ORDER BY vi_tri",params),
    citationChunks: (ids,owner,courseId) => db.execute(`SELECT ch.ma chunkId,ch.ma_tai_lieu documentId,
      ch.noi_dung content,ch.vi_tri_dau sourceStart,ch.anh_xa_trang pageMap,ch.tu_trang pageFrom,ch.den_trang pageTo
      FROM doan_tai_lieu ch JOIN tai_lieu d ON d.ma=ch.ma_tai_lieu
      WHERE ch.ma IN (${ids.map(() => '?').join(',')}) AND d.ma_nguoi_dung=? AND d.ma_mon_hoc=?
      AND d.trang_thai='ready' AND d.luc_xoa IS NULL`,[...ids,owner,courseId]),
    citations: (params) => db.execute(`SELECT c.*,d.trang_thai document_status,d.luc_xoa FROM nguon_hoc_tap c
      JOIN muc_hoc_tap i ON i.ma=c.ma_noi_dung LEFT JOIN tai_lieu d ON d.ma=c.ma_tai_lieu WHERE i.ma_bo_hoc=? ORDER BY c.ma`,params),
    attempt: (params) => db.execute("SELECT * FROM lan_lam_bai WHERE ma=? AND ma_nguoi_dung=?",params),
    answers: (params) => db.execute("SELECT ma_noi_dung,lua_chon,dung_sai FROM dap_an_da_chon WHERE ma_lan_lam=?",params),
    countSets: (params) => db.execute("SELECT COUNT(*) total FROM bo_hoc_tap WHERE ma_mon_hoc=? AND ma_nguoi_dung=?",params),
    listSets: (params) => db.query(`SELECT s.*,(SELECT COUNT(*) FROM muc_hoc_tap WHERE ma_bo_hoc=s.ma) item_count FROM bo_hoc_tap s
          WHERE ma_mon_hoc=? AND ma_nguoi_dung=? ORDER BY ma DESC LIMIT ? OFFSET ?`,params),
    generation: (params) => db.execute("SELECT * FROM yeu_cau_tao_bo WHERE ma_nguoi_dung=? AND ma_yeu_cau=?",params),
    readyDocuments: (params) => db.execute(`SELECT ma FROM tai_lieu WHERE ma IN (${params.slice(0,-2).map(() => '?').join(',')}) AND ma_nguoi_dung=? AND ma_mon_hoc=? AND trang_thai='ready' AND luc_xoa IS NULL`,params),
    chunkCounts: (params) => db.execute(`SELECT ma_tai_lieu,COUNT(*) total FROM doan_tai_lieu WHERE ma_tai_lieu IN (${params.map(() => '?').join(',')}) GROUP BY ma_tai_lieu`,params),
    dailyUsage: (params) => db.execute("SELECT COUNT(*) total FROM yeu_cau_tao_bo WHERE ma_nguoi_dung=? AND ngay_tao>=UTC_DATE()",params),
    recentUsage: (params) => db.execute("SELECT COUNT(*) total FROM yeu_cau_tao_bo WHERE ma_nguoi_dung=? AND ngay_tao>=UTC_TIMESTAMP(3)-INTERVAL 1 MINUTE",params),
    reserveGeneration: (params) => db.execute("INSERT INTO yeu_cau_tao_bo(ma_nguoi_dung,ma_mon_hoc,ma_yeu_cau,ma_bam_dau_vao,tinh_trang) VALUES(?,?,?,?,'processing')",params),
    sampleChunks: ([documentId,owner,courseId,seed]) => db.execute(`WITH sections AS (
      SELECT ch.ma, NTILE(16) OVER (ORDER BY ch.tu_trang,ch.thu_tu_doan,ch.ma) section_bin
      FROM doan_tai_lieu ch JOIN tai_lieu d ON d.ma=ch.ma_tai_lieu
      WHERE ch.ma_tai_lieu=? AND d.ma_nguoi_dung=? AND d.ma_mon_hoc=? AND d.trang_thai='ready' AND d.luc_xoa IS NULL
    ), samples AS (
      SELECT ma,section_bin,ROW_NUMBER() OVER (PARTITION BY section_bin ORDER BY CRC32(CONCAT(ma,?)),ma) pick FROM sections
    ) SELECT ch.ma chunkId,ch.ma_tai_lieu documentId,LEFT(ch.noi_dung,4000) noi_dung,
      ch.vi_tri_dau sourceStart,ch.anh_xa_trang pageMap,
      ch.tu_trang pageFrom,ch.den_trang pageTo,d.ten_tep_goc fileName,s.section_bin sectionBin
      FROM samples s JOIN doan_tai_lieu ch ON ch.ma=s.ma JOIN tai_lieu d ON d.ma=ch.ma_tai_lieu
      WHERE s.pick<=2 AND d.ma_nguoi_dung=? AND d.ma_mon_hoc=? AND d.trang_thai='ready' AND d.luc_xoa IS NULL
      ORDER BY s.section_bin,s.pick,ch.ma LIMIT 32`,[documentId,owner,courseId,seed,owner,courseId]),
    insertSet: (params) => db.execute("INSERT INTO bo_hoc_tap(ma_mon_hoc,ma_nguoi_dung,loai,tieu_de,mo_hinh,so_nguon) VALUES(?,?,?,?,?,?)",params),
    insertItem: (params) => db.execute("INSERT INTO muc_hoc_tap(ma_bo_hoc,vi_tri,cau_hoi_hoac_mat_truoc,dap_an_hoac_mat_sau,cac_lua_chon,vi_tri_dap_an_dung,giai_thich) VALUES(?,?,?,?,?,?,?)",params),
    insertCitation: (params) => db.execute("INSERT INTO nguon_hoc_tap(ma_noi_dung,ma_doan,ma_tai_lieu,ten_tep_nguon,tu_trang,den_trang,noi_dung_nguon_chup_lai) VALUES(?,?,?,?,?,?,?)",params),
    completeGeneration: (params) => db.execute("UPDATE yeu_cau_tao_bo SET tinh_trang='completed',ma_bo_hoc=? WHERE ma=?",params),
    failGeneration: (params) => db.execute("UPDATE yeu_cau_tao_bo SET tinh_trang='failed',ma_loi=?,ma_trang_thai_loi=? WHERE ma=? AND tinh_trang='processing'",params),
    deleteSet: (params) => db.execute("DELETE FROM bo_hoc_tap WHERE ma=?",params),
    attemptRequest: (params) => db.execute("SELECT ma,ma_bo_hoc FROM lan_lam_bai WHERE ma_nguoi_dung=? AND ma_yeu_cau=?",params),
    insertAttempt: (params) => db.execute("INSERT INTO lan_lam_bai(ma_bo_hoc,ma_nguoi_dung,ma_yeu_cau,tong_so_cau) VALUES(?,?,?,?)",params),
    listAttempts: (params) => db.execute("SELECT ma,diem,so_cau_dung,tong_so_cau,luc_bat_dau,luc_hoan_thanh FROM lan_lam_bai WHERE ma_bo_hoc=? AND ma_nguoi_dung=? ORDER BY ma DESC LIMIT 50",params),
    lookupAttempt: (params) => db.execute("SELECT ma_bo_hoc FROM lan_lam_bai WHERE ma=? AND ma_nguoi_dung=?",params),
    lockAttempt: (params) => db.execute("SELECT * FROM lan_lam_bai WHERE ma=? AND ma_nguoi_dung=? FOR UPDATE",params),
    gradeItems: (params) => db.execute("SELECT ma,vi_tri_dap_an_dung FROM muc_hoc_tap WHERE ma_bo_hoc=? ORDER BY vi_tri",params),
    insertAnswer: (params) => db.execute("INSERT INTO dap_an_da_chon(ma_lan_lam,ma_noi_dung,lua_chon,dung_sai) VALUES(?,?,?,?)",params),
    completeAttempt: (params) => db.execute("UPDATE lan_lam_bai SET diem=?,so_cau_dung=?,ma_bam_bai_nop=?,luc_hoan_thanh=UTC_TIMESTAMP(3) WHERE ma=?",params),
  };
}
