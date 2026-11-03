import { performance } from 'node:perf_hooks';
import { mkdtemp, writeFile, readFile, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { transcriptFixture, legacyCitationReads } from '../tests/modules/fixtures/performance.js';
import { readAuditTail } from '../src/modules/admin/auditTail.js';

const before = transcriptFixture(50, 2),
  after = transcriptFixture(50, 2);
let start = performance.now();
const count = await legacyCitationReads(before);
const legacyMs = performance.now() - start;
start = performance.now();
const result = await after.service.get('1', '21');
const batchMs = performance.now() - start;
assert.equal(
  result.messages.reduce((n, m) => n + m.citations.length, 0),
  count,
);
const dir = await mkdtemp(join(tmpdir(), 'study-benchmark-'));
try {
  const file = join(dir, 'audit.jsonl');
  await writeFile(file, 'Bản ghi kiểm thử hiệu năng tài liệu\n'.repeat(250000));
  start = performance.now();
  const full = await readFile(file, 'utf8');
  const expected = full.split('\n').filter(Boolean).slice(-20);
  const readAllMs = performance.now() - start;
  let bytes = 0;
  const openFile = async (...args) => {
    const h = await open(...args);
    return {
      stat: () => h.stat(),
      read: async (...args) => {
        const r = await h.read(...args);
        bytes += r.bytesRead;
        return r;
      },
      close: () => h.close(),
    };
  };
  start = performance.now();
  assert.deepEqual(await readAuditTail(file, 20, { openFile }), expected);
  const tailMs = performance.now() - start;
  console.log(
    JSON.stringify(
      {
        fixtureOnly: true,
        simulatedDbRoundTripMs: 2,
        transcript: {
          turns: 50,
          beforeQueries: before.calls.length,
          afterQueries: after.calls.length,
          beforeMs: legacyMs,
          afterMs: batchMs,
        },
        audit: {
          beforeBytes: Buffer.byteLength(full),
          afterBytes: bytes,
          beforeMs: readAllMs,
          afterMs: tailMs,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
