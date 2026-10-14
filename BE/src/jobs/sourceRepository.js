import { queueDocumentMail } from '../integrations/email.js';
import { randomUUID } from 'node:crypto';
export function sourceRepository(pool, config) {
  const owns = async (db, job) => (await db.execute("SELECT id FROM processing_jobs WHERE id=? AND status='running' AND locked_by=? AND locked_until>UTC_TIMESTAMP(3) FOR UPDATE", [job.id, job.locked_by]))[0].length > 0;
  const transaction = async (job, action, dedicated = null) => {
    const db = dedicated ?? await pool.getConnection();
    try { await db.beginTransaction(); if (!await owns(db, job)) throw new Error('JOB_LEASE_LOST'); const result = await action(db); await db.commit(); return result; }
    catch (error) { await db.rollback(); throw error; } finally { if (!dedicated) db.release(); }
  };
  return {
    async claim() {
      const db = await pool.getConnection();
      try {
        await db.beginTransaction();
        const [jobs] = await db.query("SELECT * FROM processing_jobs WHERE type='prepare_source' AND ((status='queued' AND next_run_at<=UTC_TIMESTAMP(3)) OR (status='running' AND locked_until<=UTC_TIMESTAMP(3))) ORDER BY next_run_at,id LIMIT 1 FOR UPDATE SKIP LOCKED");
        if (!jobs.length) { await db.commit(); return null; }
        const job = jobs[0]; const document = (await db.execute('SELECT * FROM documents WHERE id=? FOR UPDATE', [job.document_id]))[0][0];
        if (!document.extraction_completed_at || document.deleted_at || ['ready','unsupported','deleting','deleted'].includes(document.status)) {
          await db.execute("UPDATE processing_jobs SET status='completed',locked_by=NULL,locked_until=NULL WHERE id=?", [job.id]); await db.commit(); return null;
        }
        if (job.attempts >= config.JOB_MAX_ATTEMPTS) {
          await db.execute("UPDATE processing_jobs SET status='failed',last_error='RAG_ATTEMPTS_EXHAUSTED',locked_by=NULL,locked_until=NULL WHERE id=?", [job.id]);
          await db.execute("UPDATE documents SET status='failed',error_code='RAG_ATTEMPTS_EXHAUSTED',error_message='Chuẩn bị nguồn đã hết số lần thử.' WHERE id=?", [document.id]); await queueDocumentMail(db,document.id,'failed',config); await db.commit(); return null;
        }
        job.locked_by = randomUUID(); job.attempts++;
        await db.execute("UPDATE processing_jobs SET status='running',attempts=?,locked_by=?,locked_until=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE id=?", [job.attempts, job.locked_by, config.JOB_LEASE_SECONDS, job.id]);
        await db.execute("UPDATE documents SET status='chunking',error_code=NULL,error_message=NULL WHERE id=?", [document.id]);
        await db.commit(); return { job, document };
      } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
    },
    renew: async job => (await pool.execute("UPDATE processing_jobs SET locked_until=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE id=? AND status='running' AND locked_by=? AND locked_until>UTC_TIMESTAMP(3)", [config.JOB_LEASE_SECONDS, job.id, job.locked_by]))[0].affectedRows === 1,
    stage: (job, status) => transaction(job, db => db.execute('UPDATE documents SET status=? WHERE id=? AND deleted_at IS NULL', [status, job.document_id])),
    persist: (job, result) => transaction(job, async db => {
      const [existing] = await db.execute('SELECT id,chunk_order FROM chunks WHERE document_id=?', [job.document_id]);
      const expected = new Map(result.chunks.map(chunk => [chunk.id, chunk.order]));
      if (existing.some(row => expected.get(row.id) !== row.chunk_order)) throw new Error('CHUNK_CONTRACT_CHANGED');
      // Stable IDs/order make a reclaimed job replace its own work, never duplicate it.
      for (const chunk of result.chunks) await db.execute(`INSERT INTO chunks(id,document_id,chunk_order,content,page_from,page_to,token_count,source_start,source_end,page_map,embedding_model,embedding_revision)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE content=VALUES(content),page_map=VALUES(page_map)`,
      [chunk.id, job.document_id, chunk.order, chunk.content, chunk.pageFrom, chunk.pageTo, chunk.tokenCount, chunk.start, chunk.end, JSON.stringify(chunk.pageMap), result.contract.model, result.contract.revision]);
    }),
    vectors: (job, key) => transaction(job, db => db.execute('UPDATE chunks SET vector_key=? WHERE document_id=?', [key, job.document_id])),
    async publish(job, document, build, lockDb) {
      await transaction(job, async db => {
        const [locks] = await db.execute('SELECT IS_USED_LOCK(?)=CONNECTION_ID() AS owned', [`rag-course-${document.course_id}`]);
        if (Number(locks[0].owned) !== 1) throw new Error('COURSE_LOCK_LOST');
        const [docs] = await db.execute("SELECT id FROM documents WHERE id=? AND user_id=? AND course_id=? AND deleted_at IS NULL AND status='indexing' FOR UPDATE", [job.document_id, document.user_id, document.course_id]);
        if (!docs.length) throw new Error('DOCUMENT_STATE_CHANGED');
        await db.execute(`INSERT INTO course_indexes(course_id,user_id,version,model,model_revision,dimension,metric,manifest_key) VALUES (?,?,?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE version=VALUES(version),model=VALUES(model),model_revision=VALUES(model_revision),dimension=VALUES(dimension),metric=VALUES(metric),manifest_key=VALUES(manifest_key)`,
        [document.course_id, document.user_id, build.version, build.model, build.revision, build.dimension, build.metric, build.manifestKey]);
        await db.execute("UPDATE documents SET status='ready',error_code=NULL,error_message=NULL WHERE id=?", [job.document_id]);
        await queueDocumentMail(db,job.document_id,'ready',config);
        await db.execute('DELETE FROM document_extractions WHERE document_id=?',[document.id]);
        await db.execute("UPDATE processing_jobs SET status='completed',last_error=NULL,locked_by=NULL,locked_until=NULL WHERE id=?", [job.id]);
      }, lockDb);
    },
    async fail(job, aborted = false) {
      await transaction(job, async db => {
        const retry = aborted || job.attempts < config.JOB_MAX_ATTEMPTS;
        await db.execute("UPDATE processing_jobs SET status=?,attempts=GREATEST(attempts-?,0),last_error=?,locked_by=NULL,locked_until=NULL,next_run_at=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE id=?", [retry ? 'queued' : 'failed', aborted ? 1 : 0, aborted ? null : 'RAG_PREPARATION_FAILED', 2 ** job.attempts, job.id]);
        await db.execute("UPDATE documents SET status=?,error_code=?,error_message=? WHERE id=? AND deleted_at IS NULL", [retry ? 'chunking' : 'failed', aborted ? null : 'RAG_PREPARATION_FAILED', aborted ? null : 'Chuẩn bị nguồn bị gián đoạn. Hệ thống thử lại trong giới hạn cho phép.', job.document_id]);
        if(!retry)await queueDocumentMail(db,job.document_id,'failed',config);
      });
    },
  };
}
