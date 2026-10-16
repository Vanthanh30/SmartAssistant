export const CHAT_RETRIEVAL_CANDIDATES = 20;
import { ragClient } from "./client.js";
export function retrievalService(pool, config) {
  const call = ragClient(config);
  return async (owner, course, query, limit = 5, documentIds) => {
    const [indexes] = await pool.execute(
      "SELECT i.* FROM chi_muc_tim_kiem i JOIN mon_hoc c ON c.ma=i.ma_mon_hoc AND c.ma_nguoi_dung=i.ma_nguoi_dung WHERE i.ma_mon_hoc=? AND i.ma_nguoi_dung=?",
      [course, owner],
    );
    if (!indexes.length) return [];
    const index = indexes[0];
    let allowedChunkIds;
    if (documentIds) {
      const [scope] = await pool.query(
        `SELECT ch.ma FROM doan_tai_lieu ch JOIN tai_lieu d ON d.ma=ch.ma_tai_lieu
         WHERE d.ma IN (${documentIds.map(() => "?").join(",")}) AND d.ma_nguoi_dung=? AND d.ma_mon_hoc=?
         AND d.trang_thai='ready' AND d.luc_xoa IS NULL LIMIT 50001`,
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
      throw Object.assign(new Error("INDEX_VERSION_MISMATCH"), { code: "INDEX_VERSION_MISMATCH" });
    const ids = [
      ...new Set(result.candidates.map((candidate) => candidate.chunkId)),
    ];
    if (!ids.length) return [];
    const [rows] = await pool.execute(
      `SELECT ch.*,d.ten_tep_goc FROM doan_tai_lieu ch JOIN tai_lieu d ON d.ma=ch.ma_tai_lieu WHERE ch.ma IN (${ids.map(() => "?").join(",")}) AND d.ma_nguoi_dung=? AND d.ma_mon_hoc=? AND d.trang_thai='ready' AND d.luc_xoa IS NULL`,
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
          content: row.content, pageMap: row.page_map, sourceStart: row.source_start,
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
