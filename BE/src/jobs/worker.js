import { assertSchema } from '../config/schema.js';
import { processCloudQueue } from './cloudWorker.js';
import { loadConfig } from '../config/env.js';
import { createPool } from '../config/db.js';
import { log } from '../config/logger.js';
import { prepareStorage } from '../modules/documents/storage.js';
import { jobRepository } from './repository.js';
import { processExtraction } from './processor.js';
import { sourceRepository } from './sourceRepository.js';
import { processSource } from './sourceProcessor.js';
import { deletionRepository } from './deletionRepository.js';
import { processDeletion } from './deletionProcessor.js';
import { reconcileStorage, reportReconciliationFailure } from './reconciliation.js';
import { setTimeout as delay } from 'node:timers/promises';
let pool;
let loop;
let stopping = false;
const abort = new AbortController();
async function stop(code = 0) {
  if (stopping) return;
  stopping = true; abort.abort();
  const forced = setTimeout(() => process.exit(1), 9000);
  try { try { await loop; } catch { /* failure already logged; lease recovery handles interrupted jobs */ } await pool?.end(); }
  finally { clearTimeout(forced); log('worker', 'stopped'); process.exit(code); }
}
try {
  const config = loadConfig(); pool = createPool(config);
  await assertSchema(pool);
  await prepareStorage(config);
  const repository = jobRepository(pool, config);
  if (config.RAG_SERVICE_TOKEN.length < 32 || config.RAG_SERVICE_TOKEN.startsWith('replace_')) throw new Error('RAG_SERVICE_TOKEN_REQUIRED');
  const sources = sourceRepository(pool, config);
  const deletions = deletionRepository(pool, config);
  let reconciledAt = Date.now(); let cursor = '0';
  const run = async () => {
    while (!stopping) {
      if (Date.now() - reconciledAt >= config.RECONCILIATION_INTERVAL_MS) {
        try { cursor = await reconcileStorage(pool, config, abort.signal, cursor) ?? cursor; } catch (error) { if (!stopping) reportReconciliationFailure(error); }
        reconciledAt = Date.now();
      }
      await processCloudQueue(pool,config);

      if(stopping)break;
      const deletion = await deletions.claim();
      if (deletion) { await processDeletion(deletion, deletions, pool, config, abort.signal); continue; }
      const claim = await repository.claim();
      if (claim) await processExtraction(claim, repository, config, abort.signal);
      else {
        const source = await sources.claim();
        if (source) await processSource(source, sources, pool, config, abort.signal);
        else { try { await delay(config.JOB_POLL_MS, null, { signal: abort.signal }); } catch { if (!stopping) throw new Error('WORKER_SLEEP_FAILED'); } }
      }
    }
  };
  log('worker', 'ready', { mode: 'persistent-source-pipeline', indexingImplemented: true });
  process.send?.({ type: 'ready', process: 'worker' });
  process.on('message', message => { if (message?.type === 'shutdown') void stop(); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void stop());
  if (process.send) process.on('disconnect', () => void stop());
  loop = run();
  loop.catch(error => { log('worker', 'dependency-failed', { code: error.code ?? 'WORKER_ERROR' }); void stop(1); });
} catch (error) {
  log('worker', 'startup-failed', { code: error.code ?? error.message }); await pool?.end(); process.exitCode = 1;
}
