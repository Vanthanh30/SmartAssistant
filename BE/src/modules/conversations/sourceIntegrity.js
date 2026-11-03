import { createHash } from 'node:crypto';
import { json } from '../shared/repository.js';

export const sourceFingerprint = (content, position) =>
  createHash('sha256')
    .update(JSON.stringify([content, position?.sourceStart, position?.pageMap]))
    .digest('hex');
export function clipSessionSource(source, resources) {
  if (!resources) return source;
  const ranges = resources.filter(
    (r) =>
      r.documentId === source.documentId && (!r.chunkIds || r.chunkIds.includes(source.chunkId)),
  );
  if (ranges.some((r) => source.pageFrom >= r.pageFrom && source.pageTo <= r.pageTo)) return source;
  const pages = (source.pageMap || []).filter((p) =>
    ranges.some((r) => p.page >= r.pageFrom && p.page <= r.pageTo),
  );
  if (!pages.length || !Number.isFinite(source.sourceStart)) return null;
  const begin = Math.max(source.sourceStart, Math.min(...pages.map((p) => p.start))),
    end = Math.min(
      source.sourceStart + source.content.length,
      Math.max(...pages.map((p) => p.end)),
    );
  // Never include an intervening page outside the authorized lesson range.
  if (source.pageMap.some((p) => p.start < end && p.end > begin && !pages.includes(p))) return null;
  if (end <= begin) return null;
  return {
    ...source,
    content: source.content.slice(begin - source.sourceStart, end - source.sourceStart),
    sourceStart: begin,
    pageMap: pages,
    pageFrom: Math.min(...pages.map((p) => p.page)),
    pageTo: Math.max(...pages.map((p) => p.page)),
    scopeSnapshot: sourceFingerprint(source.content, source),
  };
}
export function matchesScopedSource(content, position, saved) {
  if (sourceFingerprint(content, position) !== saved.scopeSnapshot) return false;
  const offset = saved.sourceStart - position.sourceStart;
  return (
    Number.isInteger(offset) &&
    offset >= 0 &&
    offset + saved.content.length <= content.length &&
    content.slice(offset, offset + saved.content.length) === saved.content &&
    saved.pageMap?.every((p) =>
      position.pageMap?.some((q) => JSON.stringify(p) === JSON.stringify(q)),
    )
  );
}

// Reuse the existing sourceDeleted flag/DTO to prevent opening a changed live PDF.
export function snapshotUnavailable(row) {
  const scoped = json(row.vi_tri_trich_dan) || {};
  if (scoped.scopeSnapshot)
    return Boolean(
      row.ngay_xoa ||
      row.current_status !== 'sẵn sàng' ||
      (scoped.documentSha256 && scoped.documentSha256 !== row.current_document_hash) ||
      !matchesScopedSource(row.current_content, json(row.current_position), {
        ...scoped,
        content: row.noi_dung_ngu_canh,
      }),
    );
  if (
    row.ngay_xoa ||
    row.current_status !== 'sẵn sàng' ||
    row.current_content !== row.noi_dung_ngu_canh
  )
    return true;
  const saved = json(row.vi_tri_trich_dan) || {},
    current = json(row.current_position) || {};
  if (saved.documentSha256 && saved.documentSha256 !== row.current_document_hash) return true;
  if (!Array.isArray(saved.pageMap) || !Array.isArray(current.pageMap)) return true;
  return (
    saved.sourceStart !== current.sourceStart ||
    JSON.stringify(saved.pageMap) !== JSON.stringify(current.pageMap)
  );
}
