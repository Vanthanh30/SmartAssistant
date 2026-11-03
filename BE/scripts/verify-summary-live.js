import { loadConfig } from '../src/config/env.js';
import { createPool } from '../src/config/db.js';
import { groundedAi } from '../src/modules/conversations/aiService.js';
import { responsesCaller } from '../src/integrations/llm/caller.js';
import { documentSummaries } from '../src/modules/documents/summaryService.js';

// Explicit opt-in only: this command sends the selected PDF text to Gemini,
// incurs API usage, and saves a verified result in the existing summary field.
const argument = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
if (!process.argv.includes('--allow-paid')) throw Error('PAID_API_OPT_IN_REQUIRED');
const conversation = argument('conversation'),
  document = argument('document');
if (!/^[1-9][0-9]{0,19}$/.test(conversation || '') || !/^[1-9][0-9]{0,19}$/.test(document || ''))
  throw Error('EXPLICIT_SCOPE_REQUIRED');
const config = loadConfig();
if (
  config.NODE_ENV !== 'development' ||
  !['localhost', '127.0.0.1', '::1'].includes(config.DB_HOST) ||
  config.LLM_PROVIDER !== 'gemini'
)
  throw Error('LOCAL_GEMINI_DEVELOPMENT_REQUIRED');
const pool = createPool(config),
  db = await pool.getConnection(),
  start = performance.now();
let generations = 0,
  counts = 0;
try {
  const [[scope]] = await db.execute(
    'SELECT h.ma_mon_hoc,m.ma_nguoi_dung FROM hoi_thoai h JOIN mon_hoc m USING(ma_mon_hoc) JOIN tai_lieu d ON d.ma_mon_hoc=h.ma_mon_hoc WHERE h.ma_hoi_thoai=? AND d.ma_tai_lieu=? AND d.ngay_xoa IS NULL',
    [conversation, document],
  );
  if (!scope) throw Object.assign(Error('scope'), { code: 'NOT_FOUND' });
  const call = responsesCaller(config);
  const ai = groundedAi(config, {
    call: async (path, body, signal) => {
      if (path === '/input_tokens') counts++;
      else generations++;
      console.log(
        JSON.stringify({
          process: 'summary-live-check',
          operation: body.text?.format?.name,
          kind: path === '/input_tokens' ? 'count' : 'generate',
          generations,
        }),
      );
      return call(path, body, signal);
    },
  });
  const summarize = documentSummaries(config, {
    generate: (sources, signal, budget) => {
      budget.limit = 16;
      return ai.answer('tóm tắt tài liệu', sources, [], { signal, budget });
    },
  });
  const now = Date.now(),
    actor = {
      user: { id: String(scope.ma_nguoi_dung) },
      tokenIssuedAt: now,
      tokenExpiresAt: now + 300000,
      sessionNonce: 'local-explicit-summary-verification',
    };
  const result = await summarize(db, actor, String(scope.ma_mon_hoc), [document], true);
  console.log(
    JSON.stringify({
      process: 'summary-live-check',
      passed: true,
      status: result.status,
      verification: result.verification,
      summarySaved: true,
      model: result.model,
      characters: result.answer.length,
      citations: result.sources.length,
      generations,
      tokenCounts: counts,
      elapsedMs: Math.round(performance.now() - start),
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      process: 'summary-live-check',
      passed: false,
      code: error.code || error.name,
      generations,
      tokenCounts: counts,
      elapsedMs: Math.round(performance.now() - start),
    }),
  );
  process.exitCode = 1;
} finally {
  db.release();
  await pool.end();
}
