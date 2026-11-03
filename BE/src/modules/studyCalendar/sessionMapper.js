import { createHash } from 'node:crypto';
import { fromDb } from '../shared/values.js';
import { json } from '../shared/repository.js';
export const revision = (b) =>
  Number.parseInt(
    createHash('sha256')
      .update(
        JSON.stringify([
          b.tieu_de,
          b.noi_dung_can_hoc,
          b.bat_dau_luc,
          b.ket_thuc_luc,
          b.trang_thai,
          b.nhac_truoc_phut,
          b.ma_tai_lieu,
          b.trang_bat_dau,
          b.trang_ket_thuc,
          ...(b.lesson ? [b.lesson] : []),
        ]),
      )
      .digest('hex')
      .slice(0, 7),
    16,
  ) + 1;
export const decorate = (b) => {
  const c = json(b.dieu_kien_hoc) || {},
    scope = c.sessions?.[String(b.ma_buoi_hoc)] || {};
  return {
    ...b,
    trang_thai: fromDb(b.trang_thai),
    trang_bat_dau: scope.pageFrom,
    trang_ket_thuc: scope.pageTo,
    lesson: scope.lesson || null,
    movedAt: scope.movedAt || null,
    moveHistory: scope.moveHistory || [],
  };
};
export const dto = (b) => ({
  id: String(b.ma_buoi_hoc),
  planId: String(b.ma_ke_hoach),
  courseId: String(b.ma_mon_hoc),
  documentId: String(b.ma_tai_lieu),
  pageFrom: b.trang_bat_dau,
  pageTo: b.trang_ket_thuc,
  title: b.tieu_de,
  goal: b.noi_dung_can_hoc,
  lesson: b.lesson || null,
  movedAt: b.movedAt || null,
  moveHistory: b.moveHistory || [],
  start: new Date(b.bat_dau_luc).toISOString(),
  end: new Date(b.ket_thuc_luc).toISOString(),
  reminderMinutes: b.nhac_truoc_phut,
  status: b.trang_thai,
  googleSync: !!b.dinh_danh_su_kien_google,
  syncStatus: !b.dinh_danh_su_kien_google
    ? 'local'
    : json(b.dieu_kien_hoc)?.googleSync?.[String(b.ma_buoi_hoc)]?.phien_ban === revision(b)
      ? 'synced'
      : 'unverified',
  version: revision(b),
  requestId: json(b.dieu_kien_hoc)?.requestIds?.[String(b.ma_buoi_hoc)] || null,
});
