import { opendir, lstat, unlink, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ragClient } from '../rag/client.js';
import { log } from '../config/logger.js';
async function files(directory, inspect, cutoff, signal) {
  let entries;try{entries=await opendir(directory);}catch(error){if(error.code==='ENOENT')return;throw error;}
  for await (const entry of entries) {
    signal?.throwIfAborted();
    if (!entry.isFile() || entry.isSymbolicLink()) continue;
    const path = join(directory, entry.name); const info = await lstat(path);
    if (info.mtimeMs < cutoff && await inspect(entry.name)) { try { await unlink(path); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  }
}
export async function reconcileStorage(pool, config, signal, afterCourse = '0') {
  const binding = JSON.stringify({ host: config.DB_HOST, port: config.DB_PORT, database: config.DB_NAME });
  let localBound=false;try{if(await readFile(join(config.UPLOAD_DIR,'.storage-owner.json'),'utf8')!==binding)throw new Error('STORAGE_DATABASE_MISMATCH');localBound=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  const db = await pool.getConnection(); const call = ragClient(config);
  let locked = false; let last = '0';
  try {
    locked = Number((await db.execute('SELECT GET_LOCK(?,0) AS owned', [`rag-reconcile-${config.DB_NAME}`]))[0][0].owned) === 1;
    if (!locked) return null;
    // Repair missing durable work; never reset failed/exhausted jobs or completed source state.
    await db.query("INSERT IGNORE INTO processing_jobs(document_id,type) SELECT id,'delete_pdf' FROM documents WHERE status='deleting'");
    await db.query("UPDATE processing_jobs j JOIN documents d ON d.id=j.document_id SET j.status='queued',j.attempts=0,j.locked_by=NULL,j.locked_until=NULL,j.next_run_at=UTC_TIMESTAMP(3) WHERE j.type='delete_pdf' AND j.status='completed' AND d.status='deleting'");
    await db.query("INSERT IGNORE INTO processing_jobs(document_id,type) SELECT id,'prepare_source' FROM documents WHERE extraction_completed_at IS NOT NULL AND deleted_at IS NULL AND status IN ('extracting','chunking','embedding','indexing')");
    await db.query("INSERT IGNORE INTO processing_jobs(document_id,type) SELECT id,'extract_pdf' FROM documents WHERE extraction_completed_at IS NULL AND deleted_at IS NULL AND status IN ('queued','extracting')");
    const cutoff = Date.now() - config.ORPHAN_GRACE_SECONDS * 1000;
    if(localBound){
    await files(config.UPLOAD_DIR, async name => {
      if (!/^[a-f0-9-]{36}\.pdf$/.test(name)) return false;
      return !(await db.execute('SELECT id FROM documents WHERE storage_key=? AND deleted_at IS NULL', [name]))[0].length;
    }, cutoff, signal);
    await files(join(config.UPLOAD_DIR, 'temp'), async name => /^[a-f0-9-]{36}\.part$/.test(name), cutoff, signal);
    await files(join(config.UPLOAD_DIR, 'extracted'), async name => {
      if (!/^[a-f0-9-]{36}\.pdf\.json(?:\.[a-f0-9-]{36})?$/.test(name)) return false;
      const [references] = await db.execute('SELECT id FROM documents WHERE extraction_key=? AND deleted_at IS NULL', [name]);
      if (references.length) return false;
      const [busy] = await db.execute("SELECT j.id FROM processing_jobs j JOIN documents d ON d.id=j.document_id WHERE d.storage_key=? AND j.type='extract_pdf' AND j.status IN ('queued','running')", [name.slice(0, 40)]);
      return !busy.length;
    }, cutoff, signal);
    }
    const [courses] = await db.execute('SELECT id,user_id FROM courses WHERE id>? ORDER BY id LIMIT 50', [afterCourse]);
    for (const course of courses) {
      signal?.throwIfAborted(); last = String(course.id);
      const key = `rag-course-${course.id}`;
      const owns = Number((await db.execute('SELECT GET_LOCK(?,0) AS owned', [key]))[0][0].owned) === 1;
      if (!owns) continue;
      try {
        const [indexes] = await db.execute('SELECT manifest_key FROM course_indexes WHERE course_id=? AND user_id=?', [course.id, course.user_id]);
        const [vectors] = await db.execute('SELECT DISTINCT ch.vector_key FROM chunks ch JOIN documents d ON d.id=ch.document_id WHERE d.course_id=? AND d.user_id=? AND d.deleted_at IS NULL AND ch.vector_key IS NOT NULL', [course.id, course.user_id]);
        const [busy] = await db.execute("SELECT DISTINCT d.id FROM documents d JOIN processing_jobs j ON j.document_id=d.id WHERE d.course_id=? AND d.user_id=? AND j.status IN ('queued','running')", [course.id, course.user_id]);
        const result = await call('/storage/reconcile', { owner: String(course.user_id), course: String(course.id), keepIndexKeys: indexes.map(row => row.manifest_key),
          keepVectorKeys: vectors.map(row => row.vector_key), busyDocuments: busy.map(row => String(row.id)), graceSeconds: config.ORPHAN_GRACE_SECONDS }, signal);
        if (result.missingReferences) log('worker', 'storage-reference-missing', { courseId: String(course.id), count: result.missingReferences });
      } finally { await db.execute('SELECT RELEASE_LOCK(?)', [key]); }
    }
    return courses.length < 50 ? '0' : last;
  } finally {
    try { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [`rag-reconcile-${config.DB_NAME}`]); } finally { db.release(); }
  }
}
export function reportReconciliationFailure(error) { log('worker', 'reconciliation-interrupted', { code: error.code ?? 'STORAGE_RECONCILIATION_FAILED' }); }
