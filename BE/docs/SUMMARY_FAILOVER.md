# Bounded summary failover

Summary generation now uses `resilientSummary` after ownership, snapshot loading,
and the existing verified-cache lookup. Primary Q&A keeps its current model.

Configuration (milliseconds):

- `SUMMARY_MODEL=gemini-3.5-flash-lite`
- `SUMMARY_FALLBACK_MODEL=gemini-3.8-flash`
- `SUMMARY_ATTEMPT_TIMEOUT_MS=20000`
- `SUMMARY_TIMEOUT_MS=45000`

At most two summary jobs run, with a 700 ms backoff before the second. Each job
includes generation and independent verification under the same attempt signal.
The existing bounded evidence repair/map-reduce rules still apply inside a job.
Only transient connectivity/rate/503 failures or invalid generated summaries may
switch model. Auth errors, quota exhaustion, source conflicts and other permanent
errors propagate. An ambiguous timeout is never retried on the same model.

Both model failures produce a partial source-only reading aid, not a verified AI
summary. It samples at most eight passages, cites exact original text, labels
coverage limitations, and is never cached or allowed to replace a verified cache.
The source snapshot and actor are checked again before returning that reading aid.
Verified AI summaries continue using the existing database field and lock.
Fallback model configuration participates in the cache fingerprint.
The preferred summary model now runs first, avoiding the former 20-second wait
for the Q&A model before switching to Flash-Lite. Gemini 3 requests also support
`GEMINI_THINKING_LEVEL=low` to reduce reasoning latency while preserving verification.

No database schema changes, libraries, services or reindexing.

Validation on 2026-10-28:

- 86 automated tests passed; lint and format checks passed.
- Project model metadata confirmed `gemini-3.5-flash-lite` supports generation.
- Live readonly replay on current PDF 20 / course 25 (10 existing chunks): primary
  `gemini-3.8-flash` then fallback `gemini-3.5-flash-lite`; verified answer of 872
  characters, four valid original-source citations, total 25,077 ms, zero DB writes.
- This is one successful measurement, not a latency guarantee or a guarantee that
  Gemini will remain available. Restart the existing backend terminal to load config.

Additional speed validation:

- Ranking-only RAM cache: 64 entries, 60-second TTL; key includes owner/course,
  source hashes, selected scope, manifest/version, exact planned questions and limit.
  Authorization, index checks and fresh source reads still run on every request.
- Current PDF readonly count-question benchmark: first request 557 ms total
  (537 ms retrieval), repeated request 18 ms total (8 ms retrieval), no AI calls.
  These timings exclude HTTP/browser rendering and are not latency guarantees.
- 88 automated tests pass, including scope isolation and cache invalidation.
