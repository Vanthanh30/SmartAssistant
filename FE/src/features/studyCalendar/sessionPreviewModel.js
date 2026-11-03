export function sessionPreviewModel(session) {
  const title = (session.title || "").trim();
  const raw = (session.goal || "").trim();
  const goal =
    raw === title
      ? ""
      : raw.startsWith(title + " · ")
        ? raw.slice(title.length + 3).trim()
        : raw;
  const rawResources = session.lesson?.resources || [];
  const groups = new Map();
  for (const r of rawResources) {
    if (!r?.documentId) continue;
    if (!groups.has(r.documentId))
      groups.set(r.documentId, { ...r, ranges: [] });
    groups.get(r.documentId).ranges.push([r.pageFrom, r.pageTo]);
  }
  for (const r of groups.values()) {
    r.ranges.sort((a, b) => a[0] - b[0]);
    r.ranges = r.ranges.reduce((list, current) => {
      const last = list.at(-1);
      if (last && current[0] <= last[1] + 1)
        last[1] = Math.max(last[1], current[1]);
      else list.push([...current]);
      return list;
    }, []);
  }
  const resources = groups.size ? [...groups.values()] : rawResources;
  return {
    goal,
    objectives: (session.lesson?.objectives || []).slice(0, 2),
    resources: resources.slice(0, 2),
    extraResources: Math.max(0, resources.length - 2),
    canStudy: !!session.courseId && session.status !== "cancelled",
    canEdit: session.status === "planned",
    canOpenGoogle: ["synced", "unverified"].includes(session.syncStatus),
    needsSyncRetry: [
      "error",
      "pending_sync",
      "reconnect_required",
      "unverified",
    ].includes(session.syncStatus),
    needsDeleteRetry: session.syncStatus === "pending_delete",
  };
}
