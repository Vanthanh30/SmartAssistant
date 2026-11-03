import { fromDb } from '../shared/values.js';
export const userDto = (u) => ({
  id: String(u.ma_nguoi_dung),
  fullName: u.ho_ten,
  email: u.email,
  role: fromDb(u.vai_tro),
  status: fromDb(u.trang_thai),
  createdAt: u.ngay_tao,
  updatedAt: null,
});
