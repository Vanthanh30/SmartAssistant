import { toDb } from '../shared/values.js';
export function adminLists(pool) {
  return {
    async documents(filters) {
      const args = [],
        where = ['1=1'];
      for (const [key, column] of [
        ['documentId', 'd.ma_tai_lieu'],
        ['courseId', 'd.ma_mon_hoc'],
        ['userId', 'm.ma_nguoi_dung'],
        ['status', 'd.trang_thai'],
      ])
        if (filters[key]) {
          where.push(column + '=?');
          args.push(key === 'status' ? toDb(filters[key]) : filters[key]);
        }
      if (filters.q) {
        where.push('d.ten_tai_lieu LIKE ?');
        args.push('%' + filters.q + '%');
      }
      const join =
        ' FROM tai_lieu d JOIN mon_hoc m USING(ma_mon_hoc) JOIN nguoi_dung u USING(ma_nguoi_dung) WHERE ' +
        where.join(' AND ');
      const [count] = await pool.execute('SELECT COUNT(*) n' + join, args);
      const [rows] = await pool.query(
        'SELECT d.*,m.ma_nguoi_dung,m.ten_mon_hoc,u.ho_ten,u.email,u.vai_tro,u.trang_thai owner_status' +
          join +
          ' ORDER BY d.ma_tai_lieu DESC LIMIT ? OFFSET ?',
        [...args, filters.pageSize, (filters.page - 1) * filters.pageSize],
      );
      return { rows: rows, count };
    },
    async users(filters) {
      const f = filters,
        where = ['1=1'],
        args = [];
      if (f.q) {
        where.push('(ho_ten LIKE ? OR email LIKE ?)');
        args.push('%' + f.q + '%', '%' + f.q + '%');
      }
      for (const [key, column] of [
        ['role', 'vai_tro'],
        ['status', 'trang_thai'],
      ])
        if (f[key]) {
          where.push(column + '=?');
          args.push(toDb(f[key]));
        }
      const [count] = await pool.execute(
        'SELECT COUNT(*) n FROM nguoi_dung WHERE ' + where.join(' AND '),
        args,
      );
      const [r] = await pool.query(
        'SELECT * FROM nguoi_dung WHERE ' +
          where.join(' AND ') +
          ' ORDER BY ma_nguoi_dung DESC LIMIT ? OFFSET ?',
        [...args, f.pageSize, (f.page - 1) * f.pageSize],
      );
      return { rows: r, count };
    },
    async courses(filters) {
      const f = filters;
      const [r] = await pool.query(
        'SELECT m.*,u.ho_ten FROM mon_hoc m JOIN nguoi_dung u USING(ma_nguoi_dung) ORDER BY m.ma_mon_hoc DESC LIMIT ? OFFSET ?',
        [f.pageSize, (f.page - 1) * f.pageSize],
      );
      const [count] = await pool.execute('SELECT COUNT(*) n FROM mon_hoc');
      return { rows: r, count };
    },
  };
}
export const adminRepository = {
  embeddingConfiguration(db) {
    return db.execute(
      "SELECT DISTINCT b.ten_mo_hinh,JSON_EXTRACT(d.cau_hinh_xu_ly,'$.contract') contract FROM bieu_dien_noi_dung b JOIN doan_tai_lieu ch ON ch.ma_vec_to=b.ma_bieu_dien JOIN tai_lieu d USING(ma_tai_lieu) WHERE d.trang_thai='sẵn sàng' AND d.ngay_xoa IS NULL",
    );
  },
  user(db, parameters) {
    return db.execute('SELECT * FROM nguoi_dung WHERE ma_nguoi_dung=?', parameters);
  },
  documentOwner(db, parameters) {
    return db.execute(
      'SELECT m.ma_nguoi_dung FROM tai_lieu d JOIN mon_hoc m USING(ma_mon_hoc) WHERE d.ma_tai_lieu=?',
      parameters,
    );
  },
  lockAdmins(db) {
    return db.execute(
      "SELECT ma_nguoi_dung FROM nguoi_dung WHERE vai_tro='quản trị viên' ORDER BY ma_nguoi_dung FOR UPDATE",
    );
  },
  lockUser(db, parameters) {
    return db.execute('SELECT * FROM nguoi_dung WHERE ma_nguoi_dung=? FOR UPDATE', parameters);
  },
  activeAdmins(db) {
    return db.execute(
      "SELECT COUNT(*) n FROM nguoi_dung WHERE vai_tro='quản trị viên' AND trang_thai='hoạt động'",
    );
  },
  setUserStatus(db, parameters) {
    return db.execute('UPDATE nguoi_dung SET trang_thai=? WHERE ma_nguoi_dung=?', parameters);
  },
  userTotals(db, parameters = []) {
    return db.execute(
      "SELECT COUNT(*) total,SUM(trang_thai='hoạt động') active,SUM(trang_thai='bị khóa') blocked FROM nguoi_dung",
      parameters,
    );
  },
  courseTotal(db, parameters = []) {
    return db.execute('SELECT COUNT(*) n FROM mon_hoc', parameters);
  },
  documentStates(db) {
    return db.execute(
      'SELECT d.trang_thai status,COUNT(*) count FROM tai_lieu d WHERE d.ngay_xoa IS NULL GROUP BY d.trang_thai',
    );
  },
  activity(db, parameters = []) {
    return db.execute(
      "SELECT COUNT(*) total,SUM(trang_thai='không đủ ngữ cảnh') insufficient,SUM(trang_thai='đã trả lời') answered,SUM(trang_thai='đang xử lý') processing,SUM(trang_thai='thất bại') failed FROM luot_hoi_dap WHERE thoi_diem_hoi>=? AND thoi_diem_hoi<?",
      parameters,
    );
  },
  answerOrigins(db, parameters) {
    return db.execute(
      "SELECT JSON_UNQUOTE(JSON_EXTRACT(noi_dung_tra_loi,'$.metadata.origin')) origin,COUNT(*) n FROM luot_hoi_dap WHERE thoi_diem_hoi>=? AND thoi_diem_hoi<? GROUP BY origin",
      parameters,
    );
  },
  questionsByDay(db, parameters) {
    return db.execute(
      "SELECT DATE_FORMAT(CONVERT_TZ(thoi_diem_hoi,'+00:00','+07:00'),'%Y-%m-%d') day,COUNT(*) count FROM luot_hoi_dap WHERE thoi_diem_hoi>=? AND thoi_diem_hoi<? GROUP BY day",
      parameters,
    );
  },
  uploadsByDay(db, parameters) {
    return db.execute(
      "SELECT DATE_FORMAT(CONVERT_TZ(ngay_tai_len,'+00:00','+07:00'),'%Y-%m-%d') day,COUNT(*) count FROM tai_lieu WHERE ngay_tai_len>=? AND ngay_tai_len<? GROUP BY day",
      parameters,
    );
  },
};
