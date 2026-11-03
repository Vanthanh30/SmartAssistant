import bcrypt from 'bcrypt';
import { loadConfig } from '../src/config/env.js';
import { createPool } from '../src/config/db.js';
import { registerSchema } from '../src/modules/auth/schema.js';
const config = loadConfig();
const password = process.env.ADMIN_PASSWORD;
const input = registerSchema.parse({ fullName: 'Quản trị viên', email: process.env.ADMIN_EMAIL,
  password, confirmPassword: password });
const pool = createPool(config);
try {
  const [existing] = await pool.execute(`SELECT ma_nguoi_dung FROM nguoi_dung WHERE email=?`, [input.email]);
  if (existing.length) throw new Error('Email đã tồn tại; seed không đổi role hoặc mật khẩu tài khoản có sẵn.');
  await pool.execute(`INSERT INTO nguoi_dung(ho_ten,email,mat_khau,vai_tro,trang_thai) VALUES (?,?,?,?,?)`,
    [input.fullName, input.email, await bcrypt.hash(input.password, config.BCRYPT_ROUNDS),'quản trị viên','hoạt động']);
  console.log('Đã tạo admin từ env.');
} finally { await pool.end(); }
