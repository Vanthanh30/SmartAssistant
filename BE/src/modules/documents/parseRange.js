import { AppError } from '../../shared/AppError.js';
export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]))
    throw new AppError(416, 'INVALID_RANGE', 'Khoảng byte không hợp lệ.');
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1)
      throw new AppError(416, 'INVALID_RANGE', 'Khoảng byte không hợp lệ.');
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    throw new AppError(416, 'INVALID_RANGE', 'Khoảng byte không hợp lệ.');
  return { start, end };
}
