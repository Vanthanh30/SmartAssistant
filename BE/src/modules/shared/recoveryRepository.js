// MySQL result tuples and parameter values are preserved at the persistence boundary.
export const recoveryRepository = {
  processingDocuments(db) {
    return db.execute(
      "SELECT d.ma_tai_lieu,d.ma_mon_hoc FROM tai_lieu d WHERE d.trang_thai='đang xử lý' ORDER BY d.ma_tai_lieu LIMIT 1000",
    );
  },
  acquirePdfLock(db, parameters) {
    return db.execute('SELECT GET_LOCK(?,0) n', parameters);
  },
  failDocument(db, parameters) {
    return db.execute(
      "UPDATE tai_lieu SET trang_thai='thất bại' WHERE ma_tai_lieu=? AND trang_thai='đang xử lý'",
      parameters,
    );
  },
  releasePdfLock(db, parameters) {
    return db.execute('SELECT RELEASE_LOCK(?)', parameters);
  },
  processingConversations(db) {
    return db.execute(
      "SELECT DISTINCT ma_hoi_thoai FROM luot_hoi_dap WHERE trang_thai='đang xử lý' LIMIT 1000",
    );
  },
  acquireChatLock(db, parameters) {
    return db.execute('SELECT GET_LOCK(?,0) n', parameters);
  },
  failConversation(db, parameters) {
    return db.execute(
      "UPDATE luot_hoi_dap SET trang_thai='thất bại',thoi_diem_tra_loi=UTC_TIMESTAMP(),noi_dung_tra_loi=JSON_SET(noi_dung_tra_loi,'$.blocks',JSON_ARRAY(JSON_OBJECT('id','loi','type','paragraph','text','Yêu cầu bị gián đoạn. Hãy gửi câu hỏi mới.'))) WHERE ma_hoi_thoai=? AND trang_thai='đang xử lý'",
      parameters,
    );
  },
  releaseChatLock(db, parameters) {
    return db.execute('SELECT RELEASE_LOCK(?)', parameters);
  },
};
