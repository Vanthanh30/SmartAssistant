export const CHAT_RETRIEVAL_CANDIDATES = 20;
import { ragClient } from "./client.js";
export function retrievalService(pool, config) {
  const call = ragClient(config);
  return async (owner, course, query, limit = 5, documentIds) => {
    const [indexes] = await pool.execute(
      "SELECT i.* FROM course_indexes i JOIN courses c ON c.id=i.course_id AND c.user_id=i.user_id WHERE i.course_id=? AND i.user_id=?",
      [course, owner],
    );
    if (!indexes.length) return [];
    const index = indexes[0];
    let allowedChunkIds;
    if (documentIds) {
      const [scope] = await pool.query(
        `SELECT ch.id FROM chunks ch JOIN documents d ON d.id=ch.document_id
         WHERE d.id IN (${documentIds.map(() => "?").join(",")}) AND d.user_id=? AND d.course_id=?
         AND d.status='ready' AND d.deleted_at IS NULL LIMIT 50001`,
        [...documentIds, owner, course],
      );
      if (scope.length > 50000)
        throw Object.assign(new Error("DOCUMENT_SCOPE_TOO_LARGE"), {
          code: "DOCUMENT_SCOPE_TOO_LARGE",
        });
      allowedChunkIds = scope.map((row) => row.id);
      if (!allowedChunkIds.length) return [];
    }
    const result = await call("/indexes/search", {
      owner: String(owner),
      course: String(course),
      key: index.manifest_key,
      query,
      limit,
      ...(allowedChunkIds ? { allowedChunkIds } : {}),
    });
    if (result.version !== index.version)
      throw new Error("INDEX_VERSION_MISMATCH");
    const ids = [
      ...new Set(result.candidates.map((candidate) => candidate.chunkId)),
    ];
    if (!ids.length) return [];
    const [rows] = await pool.execute(
      `SELECT ch.*,d.original_name FROM chunks ch JOIN documents d ON d.id=ch.document_id WHERE ch.id IN (${ids.map(() => "?").join(",")}) AND d.user_id=? AND d.course_id=? AND d.status='ready' AND d.deleted_at IS NULL`,
      [...ids, owner, course],
    );
    const metadata = new Map(rows.map((row) => [row.id, row]));
    const verified = [];
    for (const candidate of result.candidates) {
      const row = metadata.get(candidate.chunkId);
      if (
        row &&
        (!documentIds || documentIds.includes(String(row.document_id)))
      )
        verified.push({
          chunkId: row.id,
          documentId: String(row.document_id),
          content: row.content,
          pageFrom: row.page_from,
          pageTo: row.page_to,
          chunkOrder: row.chunk_order,
          fileName: row.original_name,
          score: candidate.score,
        });
    }
    return verified;
  };
}
