export const notificationLabel = (kind) =>
  ({
    before: "Sắp đến giờ học",
    start: "Đến giờ học",
    missed: "Bạn có buổi học chưa hoàn thành",
    moved: "Buổi học đã thay đổi",
    cancelled: "Buổi học đã được hủy",
  })[kind] || "Thông báo học tập";
export function notificationDestination(row) {
  return row.kind === "cancelled" || row.withdrawn
    ? "/app/study-calendar"
    : `/app/study-calendar/sessions/${encodeURIComponent(String(row.session.id))}`;
}
export const permissionLabel = (permission) =>
  ({
    default: "Chưa bật",
    granted: "Đã bật",
    denied: "Đang bị chặn",
    unsupported: "Trình duyệt chưa hỗ trợ",
  })[permission] || "Chưa bật";
