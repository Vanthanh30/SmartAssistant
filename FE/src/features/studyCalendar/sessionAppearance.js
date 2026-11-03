export function sessionAppearance(session) {
  if (session.status === "cancelled")
    return { state: "cancelled", label: "Đã hủy", color: "#c73b46" };
  if (session.status === "completed")
    return { state: "completed", label: "Đã hoàn thành", color: "#227a52" };
  if (session.movedAt)
    return { state: "moved", label: "Đã dời lịch", color: "#a85c0a" };
  return { state: "planned", label: "Chưa hoàn thành", color: "#315fa5" };
}
