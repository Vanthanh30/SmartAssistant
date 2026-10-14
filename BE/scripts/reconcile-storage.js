import { loadConfig } from '../src/config/env.js';
import { createPool } from '../src/config/db.js';
import { prepareStorage } from '../src/modules/documents/storage.js';
import { reconcileStorage } from '../src/jobs/reconciliation.js';
const config = loadConfig(); const pool = createPool(config);
try {
  await prepareStorage(config);
  let cursor = '0';
  do { cursor = await reconcileStorage(pool, config, undefined, cursor); } while (cursor !== null && cursor !== '0');
  console.log(cursor === null ? 'Another reconciliation is running; this request was skipped.' : 'Storage reconciliation completed.');
} catch (error) { console.error(error.code ?? 'STORAGE_RECONCILIATION_FAILED'); process.exitCode = 1; }
finally { await pool.end(); }
