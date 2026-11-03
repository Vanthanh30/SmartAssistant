export function moveMetadata(row, next, previous = {}, now = new Date()) {
  const before = {
    start: new Date(row.bat_dau_luc).toISOString(),
    end: new Date(row.ket_thuc_luc).toISOString(),
  };
  const changed =
    +new Date(before.start) !== +new Date(next.start) ||
    +new Date(before.end) !== +new Date(next.end);
  const history = previous.moveHistory || [];
  if (!changed) return previous.movedAt ? { movedAt: previous.movedAt, moveHistory: history } : {};
  const movedAt = now.toISOString();
  return {
    movedAt,
    moveHistory: [
      ...history,
      { from: before, to: { start: next.start, end: next.end }, at: movedAt },
    ].slice(-10),
  };
}
