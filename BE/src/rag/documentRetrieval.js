import { sessionSqlScope } from '../modules/conversations/sessionChatScope.js';
import { clipSessionSource } from '../modules/conversations/sourceIntegrity.js';
import { createHash } from 'node:crypto';
import { AppError } from '../shared/AppError.js';
import { artifactStore } from '../modules/shared/artifacts.js';
import { json } from '../modules/shared/repository.js';
import { ragClient } from './client.js';
import { planQuestion } from './questionPlan.js';
import { KeywordIndex, fuseRankings } from './keywordIndex.js';
import { needsContinuation, continuesSource, needsPrevious } from './contextExpansion.js';
import { log } from '../config/logger.js';
import { isDocumentSummary } from '../modules/conversations/questionUnderstanding.js';
import { isStudyGuidance } from '../modules/conversations/studyGuidance.js';

export function mapRetrievedSource(row) {
  const p = json(row.vi_tri_tren_trang) || {};
  return {
    chunkId: String(row.ma_doan_tai_lieu),
    documentId: String(row.ma_tai_lieu),
    content: row.noi_dung,
    pageFrom: row.trang_bat_dau,
    pageTo: row.trang_ket_thuc,
    chunkOrder: row.thu_tu_doan,
    fileName: row.ten_tai_lieu,
    pageMap: p.pageMap,
    sourceStart: p.sourceStart,
    score: 1,
    ...(Array.isArray(p.layoutWarnings) ? { layoutWarnings: p.layoutWarnings } : {}),
    ...(row.document_sha256 ? { documentSha256: row.document_sha256 } : {}),
  };
}

function retrievalError(error) {
  const messages = {
    RAG_INVALID_INPUT: 'Câu hỏi hoặc phạm vi chưa phù hợp với bộ truy hồi. Hãy hỏi ngắn hơn.',
    RAG_MEMORY_LIMIT:
      'Máy thiếu bộ nhớ để chạy mô hình truy hồi. Hãy đóng ứng dụng không cần thiết và khởi động lại backend.',
    RAG_UNAUTHORIZED: 'Dịch vụ truy hồi chưa xác thực được kết nối nội bộ.',
    RAG_TIMEOUT: 'Truy hồi tài liệu quá thời gian. Vui lòng thử lại.',
  };
  return new AppError(
    error.code === 'RAG_INVALID_INPUT' ? 422 : error.code === 'RAG_TIMEOUT' ? 504 : 503,
    error.code || 'RAG_UNAVAILABLE',
    messages[error.code] || 'Dịch vụ truy hồi tài liệu chưa sẵn sàng. Vui lòng thử lại.',
  );
}

export function retrieveDocumentSources(
  pool,
  config,
  { call = ragClient(config), files = artifactStore(config), logger = log } = {},
) {
  let cachedKeyword = null,
    keywordBuild = null,
    batchSupported = true;
  // Cache rankings only. Authorization, index version and source content are rechecked per request.
  const searchCache = new Map();
  return async (owner, course, query, limit = 20, documents, resources) => {
    const scoped = sessionSqlScope(resources);
    const started = performance.now(),
      timings = {};
    if (documents && !documents.length) return [];
    if (isDocumentSummary(query) || isStudyGuidance(query)) {
      // Summaries cover the selected documents, not the nearest passages to the word "summary".
      const [rows] = await pool.execute(
        `SELECT ch.*,d.ten_tai_lieu,d.ma_bam_tap_tin document_sha256 FROM doan_tai_lieu ch JOIN tai_lieu d USING(ma_tai_lieu) JOIN mon_hoc m USING(ma_mon_hoc) WHERE m.ma_nguoi_dung=? AND d.ma_mon_hoc=? AND d.ngay_xoa IS NULL AND d.trang_thai='sẵn sàng'${documents?.length ? ` AND d.ma_tai_lieu IN (${documents.map(() => '?').join(',')})` : ''} ${scoped.sql} ORDER BY ch.ma_tai_lieu,ch.thu_tu_doan LIMIT 129`,
        [owner, course, ...(documents || []), ...scoped.args],
      );
      if (rows.length > 128)
        throw new AppError(
          422,
          'SUMMARY_SCOPE_TOO_LARGE',
          'Phạm vi tóm tắt quá lớn. Hãy chọn ít tài liệu hơn.',
        );
      return rows
        .map((row) =>
          clipSessionSource(
            { ...mapRetrievedSource(row), retrievalMethod: 'document-summary', scoreMeasured: false },
            resources,
          ),
        )
        .filter(Boolean);
    }
    limit = Math.min(20, Math.max(1, limit));
    const planStarted = performance.now(),
      plan = planQuestion(query);
    timings.planningMs = performance.now() - planStarted;
    const scopeStarted = performance.now();
    const [rows] = await pool.execute(
      `SELECT ch.ma_doan_tai_lieu,ch.ma_tai_lieu,ch.ma_bam_doan,ch.thu_tu_doan,b.dinh_danh_chi_muc FROM doan_tai_lieu ch JOIN tai_lieu d USING(ma_tai_lieu) JOIN mon_hoc m USING(ma_mon_hoc) JOIN bieu_dien_noi_dung b ON b.ma_bieu_dien=ch.ma_vec_to WHERE m.ma_nguoi_dung=? AND d.ma_mon_hoc=? AND d.ngay_xoa IS NULL AND d.trang_thai='sẵn sàng'${documents?.length ? ` AND d.ma_tai_lieu IN (${documents.map(() => '?').join(',')})` : ''} ${scoped.sql} ORDER BY ch.ma_tai_lieu,ch.thu_tu_doan LIMIT 50001`,
      [owner, course, ...(documents || []), ...scoped.args],
    );
    timings.scopeSqlMs = performance.now() - scopeStarted;
    if (!rows.length) return [];
    if (rows.length > 50000)
      throw new AppError(
        422,
        'DOCUMENT_SCOPE_TOO_LARGE',
        'Phạm vi tài liệu quá lớn. Hãy chọn ít PDF hơn.',
      );
    let index = await files.read('indexes', `${owner}_${course}`);
    if (!index) {
      const keys = [...new Set(rows.map((row) => row.dinh_danh_chi_muc))];
      if (
        keys.length === 1 &&
        keys[0].startsWith(`${owner}/${course}/`) &&
        /^[a-f0-9]{64}$/.test(keys[0].split('/').at(-1))
      ) {
        index = { schemaVersion: 16, manifestKey: keys[0], version: keys[0].split('/').at(-1) };
      }
    }
    if (
      !index ||
      index.schemaVersion !== 16 ||
      rows.some((row) => row.dinh_danh_chi_muc !== index.manifestKey)
    )
      throw new AppError(409, 'INDEX_VERSION_MISMATCH', 'Chỉ mục chưa khớp với tài liệu hiện tại.');
    const allowed = rows.map((row) => String(row.ma_doan_tai_lieu));
    const byId = new Map(rows.map((row) => [String(row.ma_doan_tai_lieu), row]));
    const byOrder = new Map(
      rows.map((row) => [`${row.ma_tai_lieu}:${row.thu_tu_doan}`, String(row.ma_doan_tai_lieu)]),
    );
    let contentSqlMs = 0;
    const fetchContent = async (ids) => {
      if (!ids.length) return [];
      const began = performance.now();
      const [content] = await pool.execute(
        `SELECT ch.*,d.ten_tai_lieu,d.ma_bam_tap_tin document_sha256 FROM doan_tai_lieu ch JOIN tai_lieu d USING(ma_tai_lieu) JOIN mon_hoc m USING(ma_mon_hoc) WHERE ch.ma_doan_tai_lieu IN (${ids.map(() => '?').join(',')}) AND m.ma_nguoi_dung=? AND d.ma_mon_hoc=? AND d.trang_thai='sẵn sàng' AND d.ngay_xoa IS NULL`,
        [...ids, owner, course],
      );
      contentSqlMs += performance.now() - began;
      const valid = content.filter((row) => {
        const original = byId.get(String(row.ma_doan_tai_lieu));
        if (!original || String(original.ma_tai_lieu) !== String(row.ma_tai_lieu)) return false;
        if (original.ma_bam_doan !== row.ma_bam_doan)
          throw new AppError(409, 'SOURCE_CHANGED', 'Nguồn đã thay đổi trong lúc truy hồi.');
        return true;
      });
      if (valid.length !== new Set(ids).size)
        throw new AppError(409, 'SOURCE_CHANGED', 'Phạm vi nguồn đã thay đổi trong lúc truy hồi.');
      return valid;
    };
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          String(owner),
          String(course),
          index.manifestKey,
          rows.map((row) => [String(row.ma_doan_tai_lieu), row.ma_bam_doan]),
          resources,
        ]),
      )
      .digest('hex');
    const keywordStarted = performance.now();
    const cacheHit = cachedKeyword?.key === fingerprint;
    if (!cacheHit) {
      if (keywordBuild) await keywordBuild;
      if (cachedKeyword?.key !== fingerprint) {
        cachedKeyword = null;
        keywordBuild = (async () => {
          const keyword = new KeywordIndex();
          try {
            for (let i = 0; i < allowed.length; i += 256)
              for (const row of await fetchContent(allowed.slice(i, i + 256))) {
                const scopedSource = clipSessionSource(mapRetrievedSource(row), resources);
                if (scopedSource) keyword.add(String(row.ma_doan_tai_lieu), scopedSource.content);
              }
            cachedKeyword = { key: fingerprint, index: keyword };
          } catch (error) {
            if (error.code !== 'KEYWORD_BUDGET') throw error;
            cachedKeyword = { key: fingerprint, index: null };
          }
        })();
        try {
          await keywordBuild;
        } finally {
          keywordBuild = null;
        }
      }
    }
    const keyword = cachedKeyword?.key === fingerprint ? cachedKeyword.index : null;
    timings.keywordBuildMs = performance.now() - keywordStarted;
    const searchStarted = performance.now(),
      queries = plan.items.map((item) => item.query);
    const body = {
      owner: String(owner),
      course: String(course),
      key: index.manifestKey,
      limit,
      allowedChunkIds: allowed,
    };
    let semantic,
      pythonTimings = null;
    const searchKey = createHash('sha256')
      .update(JSON.stringify([fingerprint, index.version, queries, limit]))
      .digest('hex');
    const cachedSearch = searchCache.get(searchKey);
    const searchCacheHit = !!cachedSearch && Date.now() - cachedSearch.at < 60000;
    if (searchCacheHit) {
      semantic = cachedSearch.rankings;
      searchCache.delete(searchKey);
      searchCache.set(searchKey, cachedSearch);
    }
    try {
      if (!semantic && queries.length > 1 && batchSupported) {
        try {
          const found = await call('/indexes/search-batch', { ...body, queries });
          if (found.version !== index.version)
            throw Object.assign(Error('Index changed'), { code: 'INDEX_VERSION_MISMATCH' });
          if (!Array.isArray(found.rankings) || found.rankings.length !== queries.length)
            throw Object.assign(Error('Invalid batch result'), { code: 'RAG_INVALID_RESPONSE' });
          semantic = found.rankings;
          pythonTimings = found.timings;
        } catch (error) {
          if (error.code !== 'RAG_ENDPOINT_UNAVAILABLE') throw error;
          batchSupported = false;
        }
      }
      if (!semantic) {
        semantic = [];
        for (const part of queries) {
          const found = await call('/indexes/search', { ...body, query: part });
          if (found.version !== index.version)
            throw Object.assign(Error('Index changed'), { code: 'INDEX_VERSION_MISMATCH' });
          semantic.push(found.candidates);
          if (found.timings) {
            pythonTimings ||= {};
            for (const [key, value] of Object.entries(found.timings))
              if (Number.isFinite(value)) pythonTimings[key] = (pythonTimings[key] || 0) + value;
          }
        }
      }
    } catch (error) {
      if (error.code === 'INDEX_VERSION_MISMATCH')
        throw new AppError(409, error.code, 'Chỉ mục đã thay đổi trong lúc truy hồi.');
      throw retrievalError(error);
    }
    if (!searchCacheHit) {
      searchCache.delete(searchKey);
      searchCache.set(searchKey, { at: Date.now(), rankings: semantic });
      while (searchCache.size > 64) searchCache.delete(searchCache.keys().next().value);
    }
    timings.searchMs = performance.now() - searchStarted;
    const rerankStarted = performance.now();
    const rankings = queries.map((part, i) =>
      fuseRankings(
        semantic[i].filter((item) => byId.has(item.chunkId)),
        keyword?.search(part, limit) || [],
        part,
        keyword,
      ),
    );
    const selected = [],
      selectedById = new Map(),
      hashes = new Set();
    const anchorLimit = Math.min(limit, Math.max(plan.items.length, limit - 4));
    for (let rank = 0; rank < limit * 2; rank++)
      for (let part = 0; part < rankings.length; part++) {
        const candidate = rankings[part][rank];
        if (!candidate) continue;
        if (selectedById.has(candidate.chunkId)) {
          const item = selectedById.get(candidate.chunkId);
          if (!item.retrievalParts.includes(plan.items[part].id))
            item.retrievalParts.push(plan.items[part].id);
          continue;
        }
        const row = byId.get(candidate.chunkId),
          hash = row && `${row.ma_tai_lieu}:${row.ma_bam_doan}`;
        if (!row || hashes.has(hash) || selected.length >= anchorLimit) continue;
        const item = { ...candidate, retrievalParts: [plan.items[part].id] };
        selected.push(item);
        selectedById.set(item.chunkId, item);
        hashes.add(hash);
      }
    timings.rerankingMs = performance.now() - rerankStarted;
    const content = await fetchContent(selected.map((item) => item.chunkId));
    const mapped = new Map(content.map((row) => [String(row.ma_doan_tai_lieu), row]));
    let sources = selected
      .filter((item) => mapped.has(item.chunkId))
      .map((item) => ({
        ...mapRetrievedSource(mapped.get(item.chunkId)),
        ...item,
        retrievalMethod: 'hybrid',
        contextGroup: item.chunkId,
      }));
    const expansionStarted = performance.now(),
      requests = [];
    // Bound added context using the unchanged embedding contract; the existing
    // generation path still checks the exact full-prompt tokenizer budget.
    const maxChunkTokens = Number(index.maxTokens) || 512;
    const expansionLimit = Math.min(
      4,
      limit - sources.length,
      Math.floor(Math.min(2048, config.LLM_CONTEXT_BUDGET_TOKENS || 6000) / maxChunkTokens),
    );
    for (const source of sources)
      for (const direction of [1, -1]) {
        if (direction === 1 ? !needsContinuation(source) : !needsPrevious(source)) continue;
        const id = byOrder.get(`${source.documentId}:${source.chunkOrder + direction}`);
        if (
          id &&
          !mapped.has(id) &&
          !requests.some((request) => request.id === id) &&
          requests.length < expansionLimit
        )
          requests.push({ id, parent: source, direction });
      }
    const neighbors = new Map(
      (await fetchContent(requests.map((request) => request.id))).map((row) => [
        String(row.ma_doan_tai_lieu),
        row,
      ]),
    );
    for (const request of requests) {
      const row = neighbors.get(request.id);
      if (!row) continue;
      const neighbor = mapRetrievedSource(row);
      if (
        !(request.direction === 1
          ? continuesSource(request.parent, neighbor)
          : needsContinuation(neighbor) && continuesSource(neighbor, request.parent))
      )
        continue;
      const hash = `${row.ma_tai_lieu}:${row.ma_bam_doan}`;
      if (hashes.has(hash)) continue;
      hashes.add(hash);
      sources.push({
        ...neighbor,
        score: 0,
        scoreMeasured: false,
        retrievalMethod: 'context',
        contextGroup: request.parent.contextGroup,
        retrievalParts: [...request.parent.retrievalParts],
        contextParentId: request.parent.chunkId,
      });
    }
    let groupLinks = 0;
    for (const [position, source] of sources.entries()) {
      const next = sources.find(
        (candidate) =>
          candidate.documentId === source.documentId &&
          candidate.chunkOrder === source.chunkOrder + 1 &&
          continuesSource(source, candidate),
      );
      if (needsContinuation(source) && next && sources.indexOf(next) > position && groupLinks < 4) {
        const previousGroup = next.contextGroup;
        for (const member of sources)
          if (member.contextGroup === previousGroup) member.contextGroup = source.contextGroup;
        groupLinks++;
      }
      source.contextIncomplete = needsContinuation(source) && !next;
    }
    const groups = [...new Set(sources.map((source) => source.contextGroup))];
    sources = groups.flatMap((group) =>
      sources
        .filter((source) => source.contextGroup === group)
        .sort((a, b) => a.chunkOrder - b.chunkOrder),
    );
    timings.expansionMs = performance.now() - expansionStarted;
    timings.contentSqlMs = contentSqlMs;
    logger('rag', 'retrieved', {
      courseId: String(course),
      parts: plan.items.length,
      planLimited: plan.limited,
      scopeChunks: rows.length,
      selectedChunks: sources.length,
      keywordCacheHit: cacheHit,
      searchCacheHit,
      keywordEnabled: !!keyword,
      ...Object.fromEntries(
        Object.entries(timings).map(([key, value]) => [key, Math.round(value * 100) / 100]),
      ),
      pythonTimings,
      elapsedMs: Math.round((performance.now() - started) * 100) / 100,
    });
    return sources.map((s) => clipSessionSource(s, resources)).filter(Boolean);
  };
}
