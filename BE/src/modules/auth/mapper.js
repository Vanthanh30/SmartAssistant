import { fromDb } from '../shared/values.js';
export const dto = (u) => ({
  id: String(u.ma_nguoi_dung),
  fullName: u.ho_ten,
  email: u.email,
  role: fromDb(u.vai_tro),
  status: fromDb(u.trang_thai),
  avatarUrl: u.anh_dai_dien ? '/api/v1/users/me/avatar' : null,
});
