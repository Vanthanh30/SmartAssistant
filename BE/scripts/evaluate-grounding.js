import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { corpus, cases } from '../tests/rag/evaluation.fixture.js';
import { KeywordIndex } from '../src/rag/keywordIndex.js';
import { questionParts } from '../src/modules/conversations/queryTerms.js';
import { topicEvidence } from '../src/modules/conversations/topicEvidence.js';

const coverageFile = new URL('../src/modules/conversations/answerCoverage.js', import.meta.url);
const coverage = existsSync(coverageFile) ? (await import(coverageFile.href)).answerCoverage : null;
const results = [];
for (const item of cases) {
  const sources = corpus.filter((s) => item.documents.includes(s.documentId));
  const index = new KeywordIndex();
  for (const source of sources) index.add(source.chunkId, source.content);
  const times = [];
  let ranked;
  for (let i = 0; i < 30; i++) {
    const start = performance.now();
    ranked = index.search(item.question, 5);
    times.push(performance.now() - start);
  }
  const ids = ranked.map((r) => r.chunkId),
    hits = item.relevant.filter((id) => ids.includes(id)).length;
  const first = ids.findIndex((id) => item.relevant.includes(id));
  const accepted = coverage
    ? coverage(item.question, sources).supported.length > 0
    : questionParts(item.question).every((part) =>
        sources.some((s) => topicEvidence(part, s.content).supported),
      );
  times.sort((a, b) => a - b);
  results.push({
    id: item.id,
    recallAt5: item.relevant.length ? hits / item.relevant.length : null,
    reciprocalRank: first < 0 ? 0 : 1 / (first + 1),
    accepted,
    expectedAccepted: item.supported,
    ranking: ids,
    p50Ms: times[15],
    p95Ms: times[28],
  });
}
const positives = results.filter((r) => r.recallAt5 !== null);
const report = {
  fixtureOnly: true,
  denseFaissMeasured: false,
  geminiCalls: 0,
  datasetHash: createHash('sha256').update(JSON.stringify({ corpus, cases })).digest('hex'),
  cases: results.length,
  recallAt5: positives.reduce((n, r) => n + r.recallAt5, 0) / positives.length,
  mrr: positives.reduce((n, r) => n + r.reciprocalRank, 0) / positives.length,
  gateAccuracy: results.filter((r) => r.accepted === r.expectedAccepted).length / results.length,
  results,
};
const output = process.argv.find((a) => a.startsWith('--output='))?.slice(9);
if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
