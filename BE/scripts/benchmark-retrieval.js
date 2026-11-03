// Read-only live comparison. Never processes a PDF or creates conversation turns.
import { performance } from 'node:perf_hooks';
import '../src/config/env.js';
import { createPool } from '../src/config/db.js';
import { retrieveDocumentSources, mapRetrievedSource } from '../src/rag/documentRetrieval.js';
import { artifactStore } from '../src/modules/shared/artifacts.js';
import { ragClient } from '../src/rag/client.js';
import { questionParts } from '../src/modules/conversations/queryTerms.js';
import { groundedAi } from '../src/modules/conversations/aiService.js';
import { sourceFor } from '../src/modules/conversations/presentation.js';

// This benchmark does not initialize a provider or alter its configuration.
// Keep it usable while the application LLM configuration is being edited.
const config = { ...process.env, DB_PORT: Number(process.env.DB_PORT || 3306),
  DB_SCHEMA_VERSION: Number(process.env.DB_SCHEMA_VERSION || 16),
  RAG_TIMEOUT_MS: Number(process.env.RAG_TIMEOUT_MS || 300000),
  LLM_CONTEXT_BUDGET_TOKENS: Number(process.env.LLM_CONTEXT_BUDGET_TOKENS || 6000) };
const pool = createPool(config);
const fixtures = [
  { question: 'từ trường là gì', chunk: '31', page: 13 },
  { question: 'sự bay hơi và sự sôi', chunk: '18', page: 2 },
  { question: 'công thức của số mol chất khí', chunk: '24', page: 7 },
];
const quantile = (values, p) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)];
try {
  const [[course]] = await pool.execute('SELECT ma_nguoi_dung FROM mon_hoc WHERE ma_mon_hoc=?', ['24']);
  if (!course) throw Error('Benchmark fixture course 24 is not present; provide a manually checked corpus.');
  const owner = String(course.ma_nguoi_dung), courseId = '24', call = ragClient({ ...config, RAG_TIMEOUT_MS: 15000 });
  const files = artifactStore(config), index = await files.read('indexes', `${owner}_${courseId}`);
  if (!index) throw Error('No active published index; benchmark will not rebuild it.');
  const [catalog] = await pool.execute("SELECT ch.*,d.ten_tai_lieu FROM doan_tai_lieu ch JOIN tai_lieu d USING(ma_tai_lieu) JOIN mon_hoc m USING(ma_mon_hoc) WHERE m.ma_nguoi_dung=? AND d.ma_mon_hoc=? AND d.ma_tai_lieu=? AND d.ngay_xoa IS NULL AND d.trang_thai='sẵn sàng'", [owner, courseId, '17']);
  const byId = new Map(catalog.map(row => [String(row.ma_doan_tai_lieu), row]));
  if (fixtures.some(fixture => !byId.has(fixture.chunk))) throw Error('Gold chunks are absent; refusing to report fixture metrics.');
  // Baseline reproduces the previous FAISS-only, round-robin selection. Its SQL
  // shape and authorization checks match the previous production retrieval path.
  const baseline = async query => {
    const [rows] = await pool.execute("SELECT ch.ma_doan_tai_lieu,ch.ma_bam_doan FROM doan_tai_lieu ch JOIN tai_lieu d USING(ma_tai_lieu) JOIN mon_hoc m USING(ma_mon_hoc) JOIN bieu_dien_noi_dung b ON b.ma_bieu_dien=ch.ma_vec_to WHERE m.ma_nguoi_dung=? AND d.ma_mon_hoc=? AND d.ma_tai_lieu=? AND d.ngay_xoa IS NULL AND d.trang_thai='sẵn sàng' LIMIT 50001", [owner, courseId, '17']);
    const allowed = rows.map(row => String(row.ma_doan_tai_lieu)), ranks = [], parts = questionParts(query);
    for (const part of parts.length <= 4 ? parts : [query]) {
      const result = await call('/indexes/search', { owner, course: courseId, key: index.manifestKey, query: part, limit: 20, allowedChunkIds: allowed });
      if (result.version !== index.version) throw Error('Index changed during benchmark.');
      ranks.push(result.candidates);
    }
    const selected = [], seen = new Set(), hashes = new Set();
    for (let i = 0; i < 20; i++) for (const ranking of ranks) {
      const item = ranking[i], row = item && byId.get(item.chunkId);
      if (!row || seen.has(item.chunkId) || hashes.has(row.ma_bam_doan) || selected.length >= 20) continue;
      selected.push(item); seen.add(item.chunkId); hashes.add(row.ma_bam_doan);
    }
    const [rowsContent] = await pool.execute(`SELECT ch.*,d.ten_tai_lieu FROM doan_tai_lieu ch JOIN tai_lieu d USING(ma_tai_lieu) JOIN mon_hoc m USING(ma_mon_hoc) WHERE ch.ma_doan_tai_lieu IN (${selected.map(() => '?').join(',')}) AND m.ma_nguoi_dung=? AND d.ma_mon_hoc=? AND d.trang_thai='sẵn sàng' AND d.ngay_xoa IS NULL`, [...selected.map(s => s.chunkId), owner, courseId]);
    const mapped = new Map(rowsContent.map(row => [String(row.ma_doan_tai_lieu), row]));
    return selected.filter(s => mapped.has(s.chunkId)).map(s => ({ ...mapRetrievedSource(mapped.get(s.chunkId)), score: s.score }));
  };
  const traces = [], improved = retrieveDocumentSources(pool, config, { logger: (_p, _e, data) => traces.push(data) });
  const next = query => improved(owner, courseId, query, 20, ['17']);
  const report = { corpus: { pdfs: 1, chunks: catalog.length, goldQuestions: fixtures.length },
    scope: 'Read-only, same active index, no LLM API; p50/p95 are warm repeated retrieval, not complete chat latency.', results: {} };
  for (const [name, retrieve] of [['baseline', baseline], ['hybrid', next]]) {
    const observations = [], ranks = [], first = [];
    for (const fixture of fixtures) {
      let firstStart = performance.now();
      await retrieve(fixture.question);
      first.push(Number((performance.now() - firstStart).toFixed(2)));
      for (let i = 0; i < 10; i++) {
        firstStart = performance.now();
        const sources = await retrieve(fixture.question);
        observations.push(performance.now() - firstStart);
        if (i === 0) ranks.push({ question: fixture.question, rank: sources.findIndex(source => source.chunkId === fixture.chunk) + 1 });
      }
    }
    report.results[name] = { samples: observations.length, p50Ms: +quantile(observations, .5).toFixed(2),
      p95Ms: +quantile(observations, .95).toFixed(2), firstObservationMs: first, ranks,
      recallAt20: ranks.filter(item => item.rank > 0).length / ranks.length,
      mrr: ranks.reduce((sum, item) => sum + (item.rank > 0 ? 1 / item.rank : 0), 0) / ranks.length };
  }
  let paidCalls = 0;
  const forbidden = async () => { paidCalls++; throw Error('Paid LLM calls disabled during retrieval benchmark'); };
  const ai = groundedAi(config, { provider: { answer: forbidden }, call: forbidden });
  for (const fixture of fixtures) {
    const answer = await ai.answer(fixture.question, await next(fixture.question), []);
    if (answer.status !== 'answered' || !answer.evidence?.some(e => sourceFor(e.quote, answer.sources)?.pageFrom === fixture.page)) throw Error(`Source/citation regression: ${fixture.question}`);
  }
  const last = traces.at(-1);
  report.hybridLastStageMs = Object.fromEntries(Object.entries(last).filter(([key]) => key.endsWith('Ms')));
  report.paidLlmCalls = paidCalls;
  console.log(JSON.stringify(report, null, 2));
} finally { await pool.end(); }
