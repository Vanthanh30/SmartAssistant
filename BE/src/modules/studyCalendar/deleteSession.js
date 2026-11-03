import { AppError } from '../../shared/AppError.js';
import { json } from '../shared/repository.js';
import { revision } from './sessionMapper.js';

export function assertDeletableSession(row, version) {
  if (revision(row) !== version)
    throw new AppError(409, 'STALE_SESSION', 'Buổi học đã thay đổi. Tải lại lịch trước khi xóa.');
  if (row.trang_thai !== 'cancelled')
    throw new AppError(409, 'CANCEL_REQUIRED', 'Hủy buổi học trước khi xóa.');
}

export async function deleteCancelledSession(db, owner, row, version) {
  assertDeletableSession(row, version);
  if (row.dinh_danh_su_kien_google)
    throw new AppError(
      409,
      'GOOGLE_DELETE_REQUIRED',
      'Cần gỡ sự kiện Google thành công trước khi xóa buổi học.',
    );
  const id = String(row.ma_buoi_hoc),
    conditions = json(row.dieu_kien_hoc) || {};
  for (const key of ['sessions', 'requestIds', 'googleSync'])
    if (conditions[key]) delete conditions[key][id];
  if (conditions.notifications) {
    conditions.notifications.items = (conditions.notifications.items || []).filter(
      (n) => n.session?.id !== id,
    );
    if (conditions.notifications.sessions) delete conditions.notifications.sessions[id];
  }
  // Prevent a retry of an old plan-confirm request from recreating a deleted ID.
  conditions.deletedSessions ||= {};
  conditions.deletedSessions[id] = true;
  await db.execute(
    'UPDATE ke_hoach_hoc SET dieu_kien_hoc=? WHERE ma_ke_hoach=? AND ma_nguoi_dung=?',
    [JSON.stringify(conditions), row.ma_ke_hoach, owner],
  );
  const [result] = await db.execute(
    'DELETE b FROM buoi_hoc b JOIN ke_hoach_hoc p USING(ma_ke_hoach) WHERE b.ma_buoi_hoc=? AND p.ma_nguoi_dung=?',
    [id, owner],
  );
  if (result.affectedRows !== 1)
    throw new AppError(409, 'SESSION_DELETE_CONFLICT', 'Buổi học đã thay đổi. Tải lại lịch.');
  return { id, deleted: true };
}
