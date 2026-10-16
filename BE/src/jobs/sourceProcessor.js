import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ragClient } from '../rag/client.js';
import { log } from '../config/logger.js';
export async function processSource(claim, repository, pool, config, signal) {
  const { job, document } = claim;
  const abort = new AbortController(); let lost = false; let renewing = false;
  const cancel = () => abort.abort(); signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel();
  const heartbeat = setInterval(async () => {
    if (renewing || lost) return; renewing = true;
    try { if (!await repository.renew(job)) { lost = true; cancel(); } } catch { lost = true; cancel(); } finally { renewing = false; }
  }, config.JOB_LEASE_SECONDS * 1000 / 3);
  const call = ragClient(config); let lockDb; let acquired = false;
  const owner = String(document.user_id); const course = String(document.course_id);
  try {
    // F06 shares this lock for the entire source workflow, including vector writes.
    lockDb = await pool.getConnection();
    while (!acquired) {
      abort.signal.throwIfAborted();
      acquired = Number((await lockDb.execute('SELECT GET_LOCK(?,1) AS acquired', [`rag-course-${course}`]))[0][0].acquired) === 1;
    }
    let extraction;
    if(document.extraction_key==='db'){
      const [artifacts]=await lockDb.execute("SELECT du_lieu_trich_xuat FROM van_ban_pdf WHERE ma_tai_lieu=?",[document.id]);
      if(!artifacts.length)throw new Error('EXTRACTION_MISSING');
      extraction=JSON.parse(artifacts[0].payload);
    }else{
      if (!/^[a-f0-9-]{36}\.pdf\.json\.[a-f0-9-]{36}$/.test(document.extraction_key)) throw new Error('INVALID_EXTRACTION_KEY');
      extraction=JSON.parse(await readFile(join(config.UPLOAD_DIR,'extracted',document.extraction_key),'utf8'));
    }
    if (extraction.sourceSha256 !== document.sha256) throw new Error('EXTRACTION_INTEGRITY_FAILED');
    const prepared = await call('/chunks', { documentId: String(document.id), sha256: document.sha256, pages: extraction.pages }, abort.signal);
    await repository.persist(job, prepared); await repository.stage(job, 'embedding');
    const embedded = await call('/embed', { owner, course, document: String(document.id),
      chunks: prepared.chunks.map(chunk => ({ id: chunk.id, windows: chunk.windows })) }, abort.signal);
    if (JSON.stringify(embedded.contract) !== JSON.stringify(prepared.contract)) throw new Error('EMBEDDING_CONTRACT_CHANGED');
    await repository.vectors(job, embedded.vectorKey); await repository.stage(job, 'indexing');
    // Session advisory lock spans index I/O without a long SQL transaction.
    const [rows] = await lockDb.execute("SELECT DISTINCT ch.khoa_vector FROM doan_tai_lieu ch JOIN tai_lieu d ON d.ma=ch.ma_tai_lieu WHERE d.ma_nguoi_dung=? AND d.ma_mon_hoc=? AND d.luc_xoa IS NULL AND (d.trang_thai='ready' OR d.ma=?) AND ch.khoa_vector IS NOT NULL", [owner, course, document.id]);
    const built = await call('/indexes/build', { owner, course, keys: rows.map(row => row.vector_key) }, abort.signal);
    abort.signal.throwIfAborted(); await repository.publish(job, document, built, lockDb);
    log('worker', 'source-ready', { documentId: String(document.id), version: built.version });
  } catch (error) {
    if (!lost) { try { await repository.fail(job, signal.aborted); } catch { /* lease fence/reclaim owns recovery */ } }
    log('worker', 'source-interrupted', { documentId: String(document.id), code: error.code ?? 'RAG_PREPARATION_FAILED' });
  } finally {
    clearInterval(heartbeat); signal.removeEventListener('abort', cancel);
    if (lockDb) { try { if (acquired) await lockDb.execute('SELECT RELEASE_LOCK(?)', [`rag-course-${course}`]); } finally { lockDb.release(); } }
  }
}
