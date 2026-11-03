export function isFullStudyGoal(goal = '') {
  const text = goal
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase();
  return (
    /\b(full|toan bo|tat ca|hoc het|on het|ca hai tai lieu|ca 2 tai lieu)\b/.test(text) &&
    !/\b(khong|chi)\s+(?:hoc\s+)?(?:full|toan bo|tat ca)\b/.test(text)
  );
}

// Unlike the general chat survey, never drop long paragraphs or whole chunks.
export function planningSurvey(sources) {
  const limit = Math.max(40, Math.min(650, Math.floor(7000 / Math.max(1, sources.length))));
  return sources.map((s) => {
    const raw = (s.content || '').replace(/\s+/g, ' ').trim();
    const headings = (s.content || '')
      .split('\n')
      .filter((t) => /^(?:chương|chủ đề|chuyên đề|bài)\s/iu.test(t.trim()))
      .join(' · ');
    const text = `${headings ? headings + '\n' : ''}${raw}`;
    return {
      id: s.chunkId,
      documentId: s.documentId,
      pageFrom: s.pageFrom,
      pageTo: s.pageTo,
      text:
        text.length > limit
          ? text.slice(0, Math.floor(limit * 0.7)) + ' … ' + text.slice(-Math.floor(limit * 0.3))
          : text,
    };
  });
}

export function mergeLessonResources(sources) {
  const result = [];
  for (const s of [...sources].sort(
    (a, b) =>
      String(a.documentId).localeCompare(String(b.documentId)) ||
      a.pageFrom - b.pageFrom ||
      (a.chunkOrder || 0) - (b.chunkOrder || 0),
  )) {
    const last = result.at(-1);
    if (last && last.documentId === s.documentId && s.pageFrom <= last.pageTo + 1) {
      last.pageTo = Math.max(last.pageTo, s.pageTo);
      last.chunkIds.push(s.chunkId);
    } else
      result.push({
        documentId: s.documentId,
        pageFrom: s.pageFrom,
        pageTo: s.pageTo,
        chunkIds: [s.chunkId],
        fileName: s.fileName || 'Tài liệu PDF',
      });
  }
  return result;
}

export function coverageReport(lessons, sources) {
  const covered = new Set(lessons.flatMap((l) => l.lesson.resources.flatMap((r) => r.chunkIds)));
  const missing = sources.filter((s) => !covered.has(s.chunkId));
  return {
    complete: !missing.length,
    totalChunks: sources.length,
    coveredChunks: sources.length - missing.length,
    documents: [...new Set(sources.map((s) => s.documentId))].map((documentId) => ({
      documentId,
      fileName: sources.find((s) => s.documentId === documentId).fileName,
      total: sources.filter((s) => s.documentId === documentId).length,
      covered: sources.filter((s) => s.documentId === documentId && covered.has(s.chunkId)).length,
    })),
    missing: missing.map((s) => ({
      chunkId: s.chunkId,
      documentId: s.documentId,
      pageFrom: s.pageFrom,
      pageTo: s.pageTo,
    })),
  };
}
