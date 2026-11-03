import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export async function verifyIntegrity(db) {
  const { tables } = JSON.parse(await readFile(new URL('./model.json', import.meta.url), 'utf8'));
  for (const [table, t] of Object.entries(tables))
    for (const fk of t.foreignKeys) {
      const [[row]] = await db.query(
        `SELECT COUNT(*) n FROM \`${table}\` c LEFT JOIN \`${fk.table}\` p ON c.\`${fk.column}\`=p.\`${fk.key}\` WHERE c.\`${fk.column}\` IS NOT NULL AND p.\`${fk.key}\` IS NULL`,
      );
      assert.equal(Number(row.n), 0, `${table}.${fk.column}: dữ liệu mồ côi`);
    }
  return 21;
}

// Chỉ gọi chủ động trên database phát triển; tất cả dữ liệu kiểm tra đều rollback.
export async function verifyVietnameseData(pool) {
  const db = await pool.getConnection(),
    mark = randomUUID();
  const insert = async (sql, args = []) => String((await db.execute(sql, args))[0].insertId);
  async function rejected(sql, args, code) {
    await assert.rejects(db.execute(sql, args), (error) => error.code === code);
  }
  try {
    await db.beginTransaction();
    const user = await insert('INSERT INTO nguoi_dung(ho_ten,email,mat_khau) VALUES(?,?,?)', [
      'Học sinh kiểm tra tiếng Việt',
      mark + '@kiem-tra.invalid',
      'giá trị kiểm tra, không phải tài khoản đăng nhập',
    ]);
    await rejected(
      'UPDATE nguoi_dung SET vai_tro=? WHERE ma_nguoi_dung=?',
      ['student', user],
      'WARN_DATA_TRUNCATED',
    );
    await rejected(
      'UPDATE nguoi_dung SET trang_thai=? WHERE ma_nguoi_dung=?',
      ['active', user],
      'WARN_DATA_TRUNCATED',
    );
    const course = await insert(
      'INSERT INTO mon_hoc(ma_nguoi_dung,ten_mon_hoc,mo_ta) VALUES(?,?,?)',
      [user, 'Vật lý — nhiệt học', 'Giữ nguyên dấu tiếng Việt và ký tự 📚'],
    );
    const document = await insert(
      'INSERT INTO tai_lieu(ma_mon_hoc,ten_tai_lieu,ma_bam_tap_tin,cau_hinh_xu_ly) VALUES(?,?,?,?)',
      [
        course,
        'Tài liệu nhiệt học.pdf',
        'a'.repeat(64),
        JSON.stringify({ công_cụ: 'PDF.js', giai_đoạn: 'đã tải lên' }),
      ],
    );
    await rejected(
      'UPDATE tai_lieu SET trang_thai=? WHERE ma_tai_lieu=?',
      ['ready', document],
      'ER_CHECK_CONSTRAINT_VIOLATED',
    );
    const representation = await insert(
      'INSERT INTO bieu_dien_noi_dung(ma_dinh_danh,ten_mo_hinh,dinh_danh_chi_muc,ma_trong_chi_muc) VALUES(?,?,?,?)',
      ['b'.repeat(64), 'mô hình kiểm tra', 'chỉ-mục-kiểm-tra', 0],
    );
    const chunk = await insert(
      'INSERT INTO doan_tai_lieu(ma_tai_lieu,ma_vec_to,thu_tu_doan,noi_dung,ma_bam_doan,trang_bat_dau,trang_ket_thuc,vi_tri_tren_trang) VALUES(?,?,?,?,?,?,?,?)',
      [
        document,
        representation,
        0,
        'Nhiệt dung riêng của chất',
        'c'.repeat(64),
        1,
        2,
        JSON.stringify({ trang: [1, 2] }),
      ],
    );
    await rejected(
      'UPDATE doan_tai_lieu SET ma_vec_to=? WHERE ma_doan_tai_lieu=?',
      ['18446744073709551615', chunk],
      'ER_NO_REFERENCED_ROW_2',
    );
    const conversation = await insert('INSERT INTO hoi_thoai(ma_mon_hoc,tieu_de) VALUES(?,?)', [
      course,
      'Hỏi về nhiệt học',
    ]);
    const turn = await insert('INSERT INTO luot_hoi_dap(ma_hoi_thoai,cau_hoi) VALUES(?,?)', [
      conversation,
      'Nhiệt dung riêng là gì?',
    ]);
    await db.execute('INSERT INTO pham_vi_hoi_dap(ma_luot_hoi_dap,ma_tai_lieu) VALUES(?,?)', [
      turn,
      document,
    ]);
    await rejected(
      'INSERT INTO pham_vi_hoi_dap(ma_luot_hoi_dap,ma_tai_lieu) VALUES(?,?)',
      [turn, document],
      'ER_DUP_ENTRY',
    );
    await insert(
      'INSERT INTO ngu_canh_hoi_dap(ma_luot_hoi_dap,ma_doan_tai_lieu,diem_tuong_dong,thu_hang,noi_dung_ngu_canh,thong_tin_nguon) VALUES(?,?,?,?,?,?)',
      [
        turn,
        chunk,
        0.85,
        1,
        'Nội dung nguồn tiếng Việt',
        JSON.stringify({ tên_tài_liệu: 'Tài liệu nhiệt học.pdf' }),
      ],
    );
    const set = await insert(
      'INSERT INTO bai_on_tap(ma_mon_hoc,ten_bai_on_tap,loai_bai,nguon_tao,cau_hinh_tao) VALUES(?,?,?,?,?)',
      [course, 'Ôn tập nhiệt học', 'trắc nghiệm', 'thủ công', JSON.stringify({ số_câu: 1 })],
    );
    await rejected(
      'UPDATE bai_on_tap SET loai_bai=? WHERE ma_bai_on_tap=?',
      ['quiz', set],
      'WARN_DATA_TRUNCATED',
    );
    const question = await insert(
      'INSERT INTO cau_hoi_on_tap(ma_bai_on_tap,thu_tu,noi_dung_cau_hoi,phuong_an,dap_an) VALUES(?,?,?,?,?)',
      [set, 1, 'Chọn đáp án đúng', JSON.stringify(['Đúng', 'Sai']), 'Đúng'],
    );
    const attempt = await insert(
      'INSERT INTO lan_lam_bai(ma_bai_on_tap,ma_nguoi_dung) VALUES(?,?)',
      [set, user],
    );
    await db.execute(
      'INSERT INTO chi_tiet_lam_bai(ma_lan_lam_bai,ma_cau_hoi,tra_loi_nguoi_dung,tra_loi_dung,muc_do_ghi_nho) VALUES(?,?,?,?,?)',
      [attempt, question, 'Đúng', true, 'tốt'],
    );
    await rejected(
      'INSERT INTO chi_tiet_lam_bai(ma_lan_lam_bai,ma_cau_hoi) VALUES(?,?)',
      [attempt, question],
      'ER_DUP_ENTRY',
    );
    const plan = await insert(
      'INSERT INTO ke_hoach_hoc(ma_nguoi_dung,ma_mon_hoc,ten_ke_hoach,muc_tieu,ngay_bat_dau,ngay_ket_thuc,so_buoi_mong_muon,dieu_kien_hoc) VALUES(?,?,?,?,?,?,?,?)',
      [
        user,
        course,
        'Kế hoạch kiểm tra',
        'Ôn tập',
        '2026-10-25',
        '2026-10-26',
        1,
        JSON.stringify({ múi_giờ: 'Asia/Ho_Chi_Minh' }),
      ],
    );
    const session = await insert(
      'INSERT INTO buoi_hoc(ma_ke_hoach,ma_tai_lieu,tieu_de,noi_dung_can_hoc,bat_dau_luc,ket_thuc_luc) VALUES(?,?,?,?,?,?)',
      [plan, document, 'Buổi ôn tập', 'Nhiệt học', '2026-10-25 08:00:00', '2026-10-25 09:00:00'],
    );
    await rejected(
      'UPDATE buoi_hoc SET ket_thuc_luc=bat_dau_luc WHERE ma_buoi_hoc=?',
      [session],
      'ER_CHECK_CONSTRAINT_VIOLATED',
    );
    await db.execute(
      'INSERT INTO ket_noi_google(ma_nguoi_dung,dinh_danh_google,email_google) VALUES(?,?,?)',
      [user, mark, mark + '@kiem-tra.invalid'],
    );
    await rejected(
      'INSERT INTO ket_noi_google(ma_nguoi_dung,dinh_danh_google,email_google) VALUES(?,?,?)',
      [user, mark, 'trùng@kiem-tra.invalid'],
      'ER_DUP_ENTRY',
    );
    await rejected('DELETE FROM mon_hoc WHERE ma_mon_hoc=?', [course], 'ER_ROW_IS_REFERENCED_2');
    const [[values]] = await db.execute(
      'SELECT u.vai_tro,u.trang_thai,m.mo_ta,q.ket_qua_kiem_chung FROM nguoi_dung u JOIN mon_hoc m USING(ma_nguoi_dung) JOIN hoi_thoai h USING(ma_mon_hoc) JOIN luot_hoi_dap q USING(ma_hoi_thoai) WHERE q.ma_luot_hoi_dap=?',
      [turn],
    );
    assert.equal(values.vai_tro, 'học sinh');
    assert.equal(values.trang_thai, 'hoạt động');
    assert.equal(values.mo_ta, 'Giữ nguyên dấu tiếng Việt và ký tự 📚');
    assert.equal(values.ket_qua_kiem_chung, 'chưa kiểm chứng');
    await verifyIntegrity(db);
    return {
      tablesExercised: 16,
      foreignKeysChecked: 21,
      vietnameseRoundTrip: true,
      englishValuesRejected: true,
      compositeKeysVerified: true,
      testDataRolledBack: true,
    };
  } finally {
    await db.rollback();
    db.release();
  }
}
