import { AppError } from "../../../shared/AppError.js";
const DAY = 86400000;
export function dashboardRange(query, now = new Date()) {
  const today = new Date(now.getTime() + 7 * 3600000)
    .toISOString()
    .slice(0, 10);
  const valid = (value) =>
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  const end = query.end ?? today;
  const days = query.days ?? "7";
  if (!valid(end) || !["7", "30"].includes(days))
    throw new AppError(
      422,
      "INVALID_DATE_RANGE",
      "Ngày hoặc bộ lọc không hợp lệ.",
    );
  const start =
    query.start ??
    new Date(Date.parse(end) - (Number(days) - 1) * DAY)
      .toISOString()
      .slice(0, 10);
  if (
    Object.keys(query).some((k) => !["start", "end", "days"].includes(k)) ||
    !["7", "30"].includes(days) ||
    !valid(start) ||
    !valid(end) ||
    start > end ||
    end > today ||
    (Date.parse(end) - Date.parse(start)) / DAY >= 93
  )
    throw new AppError(
      422,
      "INVALID_DATE_RANGE",
      "Chọn khoảng ngày hợp lệ, tối đa 93 ngày và không vượt quá hôm nay.",
    );
  const dates = [];
  for (let t = Date.parse(start); t <= Date.parse(end); t += DAY)
    dates.push(new Date(t).toISOString().slice(0, 10));
  return {
    start,
    end,
    dates,
    from: new Date(Date.parse(start) - 7 * 3600000),
    to: new Date(Date.parse(end) + DAY - 7 * 3600000),
  };
}
