import { randomUUID } from 'node:crypto';
export function sourceRepository(pool, config) {
  const owns = async (db, job) => (await db.execute("SELECT ma FROM tac_vu_pdf WHERE ma=? AND trang_thai='running' AND ma_tien_trinh_khoa=? AND khoa_den_luc>UTC_TIMESTAMP(3) FOR UPDATE", [job.id, job.locked_by]))[0].length > 0;
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
        const [jobs] = await db.query("SELECT * FROM tac_vu_pdf WHERE loai_tac_vu='prepare_source' AND ((trang_thai='queued' AND luc_chay_tiep<=UTC_TIMESTAMP(3)) OR (trang_thai='running' AND khoa_den_luc<=UTC_TIMESTAMP(3))) ORDER BY luc_chay_tiep,ma LIMIT 1 FOR UPDATE SKIP LOCKED");
        if (!jobs.length) { await db.commit(); return null; }
        const job = jobs[0]; const document = (await db.execute("SELECT * FROM tai_lieu WHERE ma=? FOR UPDATE", [job.document_id]))[0][0];
        if (!document.extraction_completed_at || document.deleted_at || ['ready','unsupported','deleting','deleted'].includes(document.status)) {
          await db.execute("UPDATE tac_vu_pdf SET trang_thai='completed',ma_tien_trinh_khoa=NULL,khoa_den_luc=NULL WHERE ma=?", [job.id]); await db.commit(); return null;
        }
        if (job.attempts >= config.JOB_MAX_ATTEMPTS) {
          await db.execute("UPDATE tac_vu_pdf SET trang_thai='failed',loi_gan_nhat='RAG_ATTEMPTS_EXHAUSTED',ma_tien_trinh_khoa=NULL,khoa_den_luc=NULL WHERE ma=?", [job.id]);
          await db.execute("UPDATE tai_lieu SET trang_thai='failed',ma_loi='RAG_ATTEMPTS_EXHAUSTED',thong_bao_loi='Chuẩn bị nguồn đã hết số lần thử.' WHERE ma=?", [document.id]);  await db.commit(); return null;
        }
        job.locked_by = randomUUID(); job.attempts++;
        await db.execute("UPDATE tac_vu_pdf SET trang_thai='running',so_lan_thu=?,ma_tien_trinh_khoa=?,khoa_den_luc=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE ma=?", [job.attempts, job.locked_by, config.JOB_LEASE_SECONDS, job.id]);
        await db.execute("UPDATE tai_lieu SET trang_thai='chunking',ma_loi=NULL,thong_bao_loi=NULL WHERE ma=?", [document.id]);
        await db.commit(); return { job, document };
      } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
    },
    renew: async job => (await pool.execute("UPDATE tac_vu_pdf SET khoa_den_luc=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE ma=? AND trang_thai='running' AND ma_tien_trinh_khoa=? AND khoa_den_luc>UTC_TIMESTAMP(3)", [config.JOB_LEASE_SECONDS, job.id, job.locked_by]))[0].affectedRows === 1,
    stage: (job, status) => transaction(job, db => db.execute("UPDATE tai_lieu SET trang_thai=? WHERE ma=? AND luc_xoa IS NULL", [status, job.document_id])),
    persist: (job, result) => transaction(job, async db => {
      const [existing] = await db.execute("SELECT ma,thu_tu_doan FROM doan_tai_lieu WHERE ma_tai_lieu=?", [job.document_id]);
      const expected = new Map(result.chunks.map(chunk => [chunk.id, chunk.order]));
      if (existing.some(row => expected.get(row.id) !== row.chunk_order)) throw new Error('CHUNK_CONTRACT_CHANGED');
      // Stable IDs/order make a reclaimed job replace its own work, never duplicate it.
      for (const chunk of result.chunks) await db.execute(`INSERT INTO doan_tai_lieu(ma,ma_tai_lieu,thu_tu_doan,noi_dung,tu_trang,den_trang,so_token,vi_tri_dau,vi_tri_cuoi,anh_xa_trang,mo_hinh_embedding,phien_ban_embedding)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE noi_dung=VALUES(noi_dung),anh_xa_trang=VALUES(anh_xa_trang)`,
      [chunk.id, job.document_id, chunk.order, chunk.content, chunk.pageFrom, chunk.pageTo, chunk.tokenCount, chunk.start, chunk.end, JSON.stringify(chunk.pageMap), result.contract.model, result.contract.revision]);
    }),
    vectors: (job, key) => transaction(job, db => db.execute("UPDATE doan_tai_lieu SET khoa_vector=? WHERE ma_tai_lieu=?", [key, job.document_id])),
    async publish(job, document, build, lockDb) {
      await transaction(job, async db => {
        const [locks] = await db.execute('SELECT IS_USED_LOCK(?)=CONNECTION_ID() AS owned', [`rag-course-${document.course_id}`]);
        if (Number(locks[0].owned) !== 1) throw new Error('COURSE_LOCK_LOST');
        const [docs] = await db.execute("SELECT ma FROM tai_lieu WHERE ma=? AND ma_nguoi_dung=? AND ma_mon_hoc=? AND luc_xoa IS NULL AND trang_thai='indexing' FOR UPDATE", [job.document_id, document.user_id, document.course_id]);
        if (!docs.length) throw new Error('DOCUMENT_STATE_CHANGED');
        await db.execute(`INSERT INTO chi_muc_tim_kiem(ma_mon_hoc,ma_nguoi_dung,phien_ban,mo_hinh,phien_ban_mo_hinh,so_chieu,phep_do,khoa_manifest) VALUES (?,?,?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE phien_ban=VALUES(phien_ban),mo_hinh=VALUES(mo_hinh),phien_ban_mo_hinh=VALUES(phien_ban_mo_hinh),so_chieu=VALUES(so_chieu),phep_do=VALUES(phep_do),khoa_manifest=VALUES(khoa_manifest)`,
        [document.course_id, document.user_id, build.version, build.model, build.revision, build.dimension, build.metric, build.manifestKey]);
        await db.execute("UPDATE tai_lieu SET trang_thai='ready',ma_loi=NULL,thong_bao_loi=NULL WHERE ma=?", [job.document_id]);

        await db.execute("DELETE FROM van_ban_pdf WHERE ma_tai_lieu=?",[document.id]);
        await db.execute("UPDATE tac_vu_pdf SET trang_thai='completed',loi_gan_nhat=NULL,ma_tien_trinh_khoa=NULL,khoa_den_luc=NULL WHERE ma=?", [job.id]);
      }, lockDb);
    },
    async fail(job, aborted = false) {
      await transaction(job, async db => {
        const retry = aborted || job.attempts < config.JOB_MAX_ATTEMPTS;
        await db.execute("UPDATE tac_vu_pdf SET trang_thai=?,so_lan_thu=GREATEST(so_lan_thu-?,0),loi_gan_nhat=?,ma_tien_trinh_khoa=NULL,khoa_den_luc=NULL,luc_chay_tiep=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE ma=?", [retry ? 'queued' : 'failed', aborted ? 1 : 0, aborted ? null : 'RAG_PREPARATION_FAILED', 2 ** job.attempts, job.id]);
        await db.execute("UPDATE tai_lieu SET trang_thai=?,ma_loi=?,thong_bao_loi=? WHERE ma=? AND luc_xoa IS NULL", [retry ? 'chunking' : 'failed', aborted ? null : 'RAG_PREPARATION_FAILED', aborted ? null : 'Chuẩn bị nguồn bị gián đoạn. Hệ thống thử lại trong giới hạn cho phép.', job.document_id]);

      });
    },
  };
}
