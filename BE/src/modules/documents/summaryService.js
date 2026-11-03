import { createHash } from 'node:crypto';
import { AppError } from '../../shared/AppError.js';
import { mapRetrievedSource } from '../../rag/documentRetrieval.js';
import { assertActiveActor } from '../auth/service.js';
import { summaryRepository as repository } from './summaryRepository.js';

const revision = 1;
const compact = (text) => text.normalize('NFC').replace(/\s/gu, '');
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function parse(value) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

export function summaryFingerprint(document, sources, config) {
  return digest([
    revision,
    config.LLM_PROVIDER,
    config.LLM_MODEL,
    config.SUMMARY_FALLBACK_MODEL || '',
    config.SUMMARY_MODEL || '',
    document.ma_bam_tap_tin,
    document.so_trang,
    parse(document.cau_hinh_xu_ly)?.extraction,
    sources.map((s) => [
      s.chunkId,
      s.chunkOrder,
      s.content,
      s.pageFrom,
      s.pageTo,
      s.sourceStart,
      s.pageMap,
    ]),
  ]);
}
function validAnswer(result, sources) {
  return (
    result?.status === 'answered' &&
    result.verification === 'đạt' &&
    typeof result.answer === 'string' &&
    result.answer.trim().length > 0 &&
    result.answer.length <= 16000 &&
    Array.isArray(result.evidence) &&
    result.evidence.length > 0 &&
    result.evidence.every(
      (e) =>
        e &&
        typeof e.quote === 'string' &&
        compact(e.quote).length >= 8 &&
        sources.some(
          (s) => s.chunkId === e.chunkId && compact(s.content).includes(compact(e.quote)),
        ),
    )
  );
}
function limitations(document, sources) {
  const meta = parse(document.cau_hinh_xu_ly);
  const pages = meta?.extraction?.pages;
  const covered = new Set();
  for (const source of sources)
    for (let page = source.pageFrom; page <= source.pageTo; page++) covered.add(page);
  const missing = [];
  for (let page = 1; page <= Number(document.so_trang || 0); page++) {
    if (
      !covered.has(page) ||
      (Array.isArray(pages) && !pages.find((p) => p.pageNumber === page)?.text?.trim())
    )
      missing.push(page);
  }
  const uncertain =
    meta?.extraction?.layout?.pages
      ?.filter((p) =>
        p.warnings?.some((w) =>
          ['table-structure-uncertain', 'rotated-text', 'invalid-text-geometry'].includes(w),
        ),
      )
      .map((p) => p.pageNumber) || [];
  const layoutNote = uncertain.length
    ? ` Bố cục hoặc quan hệ ô bảng chưa xác định chắc ở trang ${uncertain.slice(0, 20).join(', ')}; cần đối chiếu PDF gốc.`
    : '';
  return (
    (missing.length
      ? `Giới hạn: chưa có văn bản đáng tin cậy cho trang ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ` và ${missing.length - 20} trang khác` : ''}. Bản tóm tắt chỉ bao phủ nội dung đã trích xuất; hình ảnh và bảng/công thức không đọc được chưa được phân tích.`
      : 'Giới hạn: bản tóm tắt dựa trên văn bản đã trích xuất; không suy đoán hình ảnh hoặc bảng/công thức không đọc được.') +
    layoutNote
  );
}

// Uses the caller's dedicated connection, outside its turn-save transaction.
// GET_LOCK prevents duplicate generation across conversations/processes, not just within RAM.
export function documentSummaries(
  config,
  { generate, repo = repository, authorize = assertActiveActor } = {},
) {
  async function load(db, owner, course, id, lock = false) {
    const [[document]] = await repo.document(db, owner, course, id, lock);
    if (!document)
      throw new AppError(
        404,
        'NOT_FOUND',
        'Không tìm thấy PDF sẵn sàng thuộc tài khoản và môn học.',
      );
    const extractionHash = parse(document.cau_hinh_xu_ly)?.extraction?.sourceSha256;
    if (extractionHash && extractionHash !== document.ma_bam_tap_tin)
      throw new AppError(
        409,
        'SOURCE_CHANGED',
        'Dữ liệu trích xuất chưa khớp với phiên bản PDF hiện tại.',
      );
    const [rows] = await repo.chunks(db, id);
    if (!rows.length || !rows.some((row) => row.noi_dung?.trim()))
      throw new AppError(422, 'SUMMARY_NO_TEXT', 'PDF chưa có văn bản để tóm tắt.');
    if (
      rows.length > 4096 ||
      rows.reduce((n, r) => n + Buffer.byteLength(r.noi_dung || '', 'utf8'), 0) > 8 * 1024 ** 2
    )
      throw new AppError(
        422,
        'SUMMARY_SCOPE_TOO_LARGE',
        'PDF vượt giới hạn tóm tắt của lượt này. Hãy chọn tài liệu nhỏ hơn.',
      );
    const sources = rows.map((row) => ({
      ...mapRetrievedSource({
        ...row,
        ten_tai_lieu: document.ten_tai_lieu,
        document_sha256: document.ma_bam_tap_tin,
      }),
      retrievalMethod: 'document-summary',
      scoreMeasured: false,
    }));
    return { document, sources, fingerprint: summaryFingerprint(document, sources, config) };
  }
  async function one(db, actor, course, id, force, signal, budget) {
    const owner = actor.user.id,
      name = `erd16-summary-${id}`;
    // Check permission before acquiring a lock, including cached requests.
    const [[permitted]] = await repo.document(db, owner, course, id);
    if (!permitted)
      throw new AppError(
        404,
        'NOT_FOUND',
        'Không tìm thấy PDF sẵn sàng thuộc tài khoản và môn học.',
      );
    if (Number((await repo.acquire(db, name))[0][0].n) !== 1)
      throw new AppError(
        409,
        'SUMMARY_IN_PROGRESS',
        'PDF đang được tóm tắt. Vui lòng kiểm tra lại sau.',
      );
    try {
      const snapshot = await load(db, owner, course, id);
      const stored = parse(snapshot.document.noi_dung_tom_tat);
      if (
        !force &&
        stored?.kind === 'studyassistant-summary' &&
        stored.revision === revision &&
        stored.fingerprint === snapshot.fingerprint &&
        validAnswer(stored.result, snapshot.sources)
      ) {
        const cited = new Set(stored.result.evidence.map((e) => e.chunkId));
        return { ...stored.result, sources: snapshot.sources.filter((s) => cited.has(s.chunkId)) };
      }
      const generated = await generate(snapshot.sources, signal, budget);
      if (
        generated?.model === 'document-extractive' &&
        generated.status === 'insufficient_context'
      ) {
        // Reauthorize and check the source snapshot even though this reading aid is not saved.
        await authorize(db, config, actor, 'student');
        const current = await load(db, owner, course, id);
        if (current.fingerprint !== snapshot.fingerprint)
          throw new AppError(409, 'SOURCE_CHANGED', 'PDF đã thay đổi trong lúc trích lược.');
        if (
          generated.evidence.some(
            (e) =>
              !snapshot.sources.some((s) => s.chunkId === e.chunkId && s.content.includes(e.quote)),
          )
        )
          throw new AppError(502, 'INVALID_CITATION', 'Đoạn trích không khớp nguồn PDF.');
        return {
          ...generated,
          answer: `${generated.answer}\n\n${limitations(snapshot.document, snapshot.sources)}`,
        };
      }
      if (signal.aborted)
        throw new AppError(
          504,
          'LLM_TIMEOUT',
          'Đã hết thời gian tóm tắt. Bản đã lưu được giữ nguyên.',
        );
      if (!validAnswer(generated, snapshot.sources))
        throw new AppError(
          502,
          'SUMMARY_UNVERIFIED',
          'Chưa tạo được bản tóm tắt có đủ căn cứ. Bản tóm tắt đã lưu được giữ nguyên.',
        );
      const cited = new Set(generated.evidence.map((e) => e.chunkId));
      const result = {
        status: 'answered',
        answer: `${generated.answer.trim()}\n\n${limitations(snapshot.document, snapshot.sources)}`,
        verification: 'đạt',
        model: generated.model,
        evidence: generated.evidence,
      };
      await db.beginTransaction();
      try {
        await authorize(db, config, actor, 'student');
        const current = await load(db, owner, course, id, true);
        if (current.fingerprint !== snapshot.fingerprint)
          throw new AppError(
            409,
            'SOURCE_CHANGED',
            'PDF đã thay đổi trong lúc tóm tắt. Không lưu kết quả cũ.',
          );
        await repo.save(
          db,
          JSON.stringify({
            kind: 'studyassistant-summary',
            revision,
            fingerprint: snapshot.fingerprint,
            createdAt: new Date().toISOString(),
            result,
          }),
          id,
        );
        await db.commit();
      } catch (error) {
        await db.rollback();
        throw error;
      }
      return { ...result, sources: snapshot.sources.filter((s) => cited.has(s.chunkId)) };
    } finally {
      await repo.release(db, name);
    }
  }
  return async (db, actor, course, documents, force = false) => {
    if (!documents.length)
      throw new AppError(422, 'SUMMARY_NO_TEXT', 'Chọn ít nhất một PDF sẵn sàng để tóm tắt.');
    const results = [];
    const signal = AbortSignal.timeout(150000);
    const budget = { operations: 0, limit: 96 };
    for (const id of documents) {
      if (signal.aborted)
        throw new AppError(504, 'LLM_TIMEOUT', 'Đã hết thời gian tóm tắt các PDF đã chọn.');
      results.push(await one(db, actor, course, id, force, signal, budget));
    }
    return {
      status: results.some((r) => r.status !== 'answered') ? 'insufficient_context' : 'answered',
      verification: results.every((r) => r.verification === 'đạt') ? 'đạt' : 'chưa kiểm chứng',
      model: results.at(-1).model,
      answer: results
        .map((r, i) =>
          documents.length > 1
            ? `Tài liệu ${i + 1}: ${r.sources[0]?.fileName || documents[i]}\n\n${r.answer}`
            : r.answer,
        )
        .join('\n\n'),
      sources: results.flatMap((r) => r.sources),
      evidence: results.flatMap((r) => r.evidence),
    };
  };
}
