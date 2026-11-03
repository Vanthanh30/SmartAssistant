import { generateStudyNotifications } from '../modules/studyCalendar/notifications.js';
import { setTimeout as delay } from 'node:timers/promises';
import { loadConfig } from '../config/env.js';
import { createPool } from '../config/db.js';
import { assertDatabaseSchema } from '../config/schema.js';
import { log } from '../config/logger.js';
import { recoverInterruptedDocumentProcessing, recoverInterruptedConversationReplies } from '../modules/shared/recovery.js';
let pool,
  stopping = false;
const abort = new AbortController();
const stop = () => {
  stopping = true;
  abort.abort();
};
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
process.on('message', (message) => {
  if (message?.type === 'shutdown') stop();
});
if (process.send) process.on('disconnect', stop);
try {
  const config = loadConfig();
  if (config.DB_SCHEMA_VERSION !== 16) throw Error('WORKER_DATABASE_SCHEMA_VERSION_UNSUPPORTED');
  pool = createPool(config);
  await assertDatabaseSchema(pool);
  log('worker', 'ready', {
    schemaVersion: 16,
    mode: 'request-bound-recovery',
    automaticGoogleSync: false,
  });
  process.send?.({ type: 'ready', process: 'worker' });
  while (!stopping) {
    await recoverInterruptedDocumentProcessing(pool);
    await recoverInterruptedConversationReplies(pool);
    try {
      await generateStudyNotifications(pool, config);
    } catch (error) {
      log('worker', 'notifications-failed', { code: error.code || 'NOTIFICATION_FAILED' });
    }
    try {
      await delay(30000, null, { signal: abort.signal });
    } catch {
      break;
    }
  }
} catch (error) {
  log('worker', 'failed', { code: error.code || error.message });
  process.exitCode = 1;
} finally {
  await pool?.end();
  if (process.connected) process.disconnect();
}
