import { startPdfExtraction } from '../rag/pdfExtractor.js';
import { log } from '../config/logger.js';
import { cloudBuffer } from '../integrations/cloudinary.js';
export async function processExtraction(claim, repository, config, signal) {
  const { job, document } = claim;
  let extraction;
  const abort = new AbortController();
  let leaseLost = false; let renewing = false;
  const cancel = () => { abort.abort(); void extraction?.cancel(); };
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const heartbeat = setInterval(async () => {
    if (renewing || leaseLost) return;
    renewing = true;
    try { if (!await repository.renew(job)) { leaseLost = true; cancel(); } }
    catch { leaseLost = true; cancel(); }
    finally { renewing = false; }
  }, Math.floor(config.JOB_LEASE_SECONDS * 1000 / 3));
  // Repository lease fencing protects the DB extraction payload from stale workers.
  let commitStarted = false;
  try {
    const asset = await repository.cloudAsset(document.id);
    const bytes=await cloudBuffer(config,asset,abort.signal);
    if (leaseLost || signal.aborted) return;
    extraction = startPdfExtraction(bytes, document, config);
    const result = await extraction.promise;
    if (leaseLost || signal.aborted) return;
    // Store exact artifact key transactionally with the completed extraction below.
    commitStarted = true;
    const retained = await repository.finish(job, result.pageCount, null, 'db', result);
    if (retained) log('worker', 'extraction-completed', { documentId: String(document.id), pages: result.pageCount });
  } catch (error) {
    // On uncertain COMMIT, the durable DB payload/job state is reconciled by lease recovery.
    if (commitStarted) throw error;
    if (!leaseLost && !signal.aborted) {
      const code = error.code?.startsWith('PDF_') ? error.code : 'PDF_STORAGE_UNAVAILABLE';
      if (await repository.finish(job, null, code)) log('worker', 'extraction-failed', { documentId: String(document.id), code });
    }
  } finally {
    clearInterval(heartbeat); signal.removeEventListener('abort', cancel); await extraction?.cancel();
    if (signal.aborted && !leaseLost) await repository.release(job);
  }
}
