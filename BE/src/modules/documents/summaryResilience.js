import { setTimeout as delay } from 'node:timers/promises';

// A source-only reading aid, never a verified or cached AI summary.
export function extractiveOverview(sources) {
  const ordered = [...sources].sort((a, b) => a.chunkOrder - b.chunkOrder);
  const selected = [];
  const seen = new Set();
  const slots = Math.min(8, ordered.length);
  for (let i = 0; i < slots; i++) {
    const source = ordered[Math.floor((i * ordered.length) / slots)];
    if (source.layoutWarnings?.some((w) => w !== 'table-structure-uncertain')) continue;
    const passages = source.content.split(/\n\s*\n/);
    const quote = passages.find(
      (text) =>
        text.length >= 70 &&
        text.length <= 650 &&
        !/[|\t=≈∝∫√]/u.test(text) &&
        !/\S {2,}\S/u.test(text) &&
        !seen.has(text.replace(/\s/g, '')),
    );
    if (!quote) continue;
    seen.add(quote.replace(/\s/g, ''));
    selected.push({ source, quote });
  }
  return {
    status: 'insufficient_context',
    model: 'document-extractive',
    verification: 'chưa kiểm chứng',
    answer:
      'Chưa tạo được bản tóm tắt AI đã kiểm chứng. Dưới đây là một số đoạn trích từ PDF để đọc nhanh; chưa bao quát toàn bộ tài liệu và chưa xác minh quan hệ hàng/cột trong bảng.\n\n' +
      (selected.length
        ? selected
            .map(
              ({ source, quote }) =>
                `Trang ${source.pageFrom}${source.pageTo !== source.pageFrom ? '–' + source.pageTo : ''}\n${quote}`,
            )
            .join('\n\n')
        : 'Chưa tìm được đoạn văn rõ ràng để trích lược. Vui lòng mở PDF gốc.'),
    sources: selected.map((s) => s.source),
    evidence: selected.map(({ source, quote }) => ({ chunkId: source.chunkId, quote })),
  };
}

export function resilientSummary(
  config,
  generate,
  { wait = delay, now = () => performance.now() } = {},
) {
  return async (sources, signal, budget) => {
    const models = [
      ...new Set(
        [
          config.LLM_PROVIDER !== 'openai'
            ? config.SUMMARY_MODEL || config.LLM_MODEL
            : config.LLM_MODEL,
          config.LLM_PROVIDER !== 'openai' ? config.SUMMARY_FALLBACK_MODEL : null,
        ].filter(Boolean),
      ),
    ];
    const timeout = AbortSignal.timeout(config.SUMMARY_TIMEOUT_MS || 45000);
    const overall = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const started = now();
    for (let attempt = 0; attempt < 2; attempt++) {
      if (overall.aborted) break;
      if (attempt) {
        try {
          await wait(700 * 2 ** (attempt - 1), undefined, { signal: overall });
        } catch {
          break;
        }
      }
      const attemptSignal = AbortSignal.any([
        overall,
        AbortSignal.timeout(config.SUMMARY_ATTEMPT_TIMEOUT_MS || 20000),
      ]);
      try {
        return await generate(
          sources,
          attemptSignal,
          budget,
          models[Math.min(attempt, models.length - 1)],
        );
      } catch (error) {
        const transient =
          ['LLM_TIMEOUT', 'LLM_UNAVAILABLE', 'LLM_RATE_LIMITED'].includes(error.code) ||
          (error.code === 'LLM_PROVIDER_ERROR' && error.details?.httpStatus === 503);
        const invalid = [
          'INVALID_SUMMARY_EVIDENCE',
          'SUMMARY_UNVERIFIED',
          'LLM_INCOMPLETE',
          'LLM_INVALID_RESPONSE',
        ].includes(error.code);
        if (!transient && !invalid) throw error;
        // Never replay an ambiguous timeout on the same model.
        if (models.length === 1 && error.details?.httpStatus !== 503) break;
        if (now() - started >= (config.SUMMARY_TIMEOUT_MS || 45000)) break;
      }
    }
    return extractiveOverview(sources);
  };
}
