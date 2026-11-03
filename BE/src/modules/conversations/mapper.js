export const dto = (h) => ({
  id: String(h.ma_hoi_thoai),
  courseId: String(h.ma_mon_hoc),
  title: h.tieu_de,
  courseName: h.ten_mon_hoc,
  createdAt: h.ngay_tao,
  updatedAt: h.ngay_cap_nhat,
});
export const text = (blocks) =>
  blocks
    .map((b) => b.text || b.items?.join('\n') || '')
    .filter(Boolean)
    .join('\n');
