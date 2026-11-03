export const syncCandidates = (sessions) =>
  sessions.filter(
    (s) =>
      s.status !== "cancelled" &&
      s.syncStatus !== "pending_delete" &&
      s.syncStatus !== "synced",
  );

// One explicit user action, bounded sequential provider requests. A failure does
// not undo saved sessions or successes; retry uses deterministic event IDs.
export async function syncSelectedSessions(
  sessions,
  write,
  onResult,
  shouldStop = () => false,
) {
  for (const session of sessions) {
    if (shouldStop()) break;
    try {
      const result = await write(`/lich-hoc/${session.id}/thu-dong-bo`, {
        version: session.version,
        intent: "sync",
      });
      if (result.syncStatus !== "synced" || !result.googleConfirmed)
        throw Error("Google chưa xác nhận đồng bộ.");
      onResult(session.id, { status: "success", session: result });
    } catch (error) {
      onResult(session.id, { status: "error", message: error.message });
      if (error.status === 429) break;
    }
  }
}
