import { reconcileCloudOrphans } from '../integrations/cloudOrphans.js';
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
    await db.query("INSERT IGNORE INTO tac_vu_pdf(ma_tai_lieu,loai_tac_vu) SELECT ma,'delete_pdf' FROM tai_lieu WHERE trang_thai='deleting'");
    await db.query("UPDATE tac_vu_pdf j JOIN tai_lieu d ON d.ma=j.ma_tai_lieu SET j.trang_thai='queued',j.so_lan_thu=0,j.ma_tien_trinh_khoa=NULL,j.khoa_den_luc=NULL,j.luc_chay_tiep=UTC_TIMESTAMP(3) WHERE j.loai_tac_vu='delete_pdf' AND j.trang_thai='completed' AND d.trang_thai='deleting'");
    await db.query("INSERT IGNORE INTO tac_vu_pdf(ma_tai_lieu,loai_tac_vu) SELECT ma,'prepare_source' FROM tai_lieu WHERE luc_trich_xuat_xong IS NOT NULL AND luc_xoa IS NULL AND trang_thai IN ('extracting','chunking','embedding','indexing')");
    await db.query("INSERT IGNORE INTO tac_vu_pdf(ma_tai_lieu,loai_tac_vu) SELECT ma,'extract_pdf' FROM tai_lieu WHERE ma_tep_dam_may IS NOT NULL AND luc_trich_xuat_xong IS NULL AND luc_xoa IS NULL AND trang_thai IN ('queued','extracting')");
    await db.query("INSERT IGNORE INTO tac_vu_pdf(ma_tai_lieu,loai_tac_vu) SELECT ma,'upload_pdf' FROM tai_lieu WHERE ma_tep_dam_may IS NULL AND luc_xoa IS NULL AND trang_thai='queued'");
    await reconcileCloudOrphans(pool,config);
    const cutoff = Date.now() - config.ORPHAN_GRACE_SECONDS * 1000;
    if(localBound){
    await files(join(config.UPLOAD_DIR,'pending'), async name => {
      if(!/^[a-f0-9-]{36}\.pdf$/.test(name))return false;
      return !(await db.execute("SELECT d.ma FROM tai_lieu d JOIN tac_vu_pdf j ON j.ma_tai_lieu=d.ma WHERE d.khoa_luu_tru=? AND j.loai_tac_vu='upload_pdf' AND j.trang_thai IN ('queued','running') AND d.luc_xoa IS NULL",[name]))[0].length;
    },cutoff,signal);
    await files(config.UPLOAD_DIR, async name => {
      if (!/^[a-f0-9-]{36}\.pdf$/.test(name)) return false;
      return !(await db.execute("SELECT ma FROM tai_lieu WHERE khoa_luu_tru=? AND luc_xoa IS NULL", [name]))[0].length;
    }, cutoff, signal);
    await files(join(config.UPLOAD_DIR, 'temp'), async name => /^[a-f0-9-]{36}\.part$/.test(name), cutoff, signal);
    await files(join(config.UPLOAD_DIR, 'extracted'), async name => {
      if (!/^[a-f0-9-]{36}\.pdf\.json(?:\.[a-f0-9-]{36})?$/.test(name)) return false;
      const [references] = await db.execute("SELECT ma FROM tai_lieu WHERE khoa_trich_xuat=? AND luc_xoa IS NULL", [name]);
      if (references.length) return false;
      const [busy] = await db.execute("SELECT j.ma FROM tac_vu_pdf j JOIN tai_lieu d ON d.ma=j.ma_tai_lieu WHERE d.khoa_luu_tru=? AND j.loai_tac_vu='extract_pdf' AND j.trang_thai IN ('queued','running')", [name.slice(0, 40)]);
      return !busy.length;
    }, cutoff, signal);
    }
    const [courses] = await db.execute("SELECT ma,ma_nguoi_dung FROM mon_hoc WHERE ma>? ORDER BY ma LIMIT 50", [afterCourse]);
    for (const course of courses) {
      signal?.throwIfAborted(); last = String(course.id);
      const key = `rag-course-${course.id}`;
      const owns = Number((await db.execute('SELECT GET_LOCK(?,0) AS owned', [key]))[0][0].owned) === 1;
      if (!owns) continue;
      try {
        const [indexes] = await db.execute("SELECT khoa_manifest FROM chi_muc_tim_kiem WHERE ma_mon_hoc=? AND ma_nguoi_dung=?", [course.id, course.user_id]);
        const [vectors] = await db.execute("SELECT DISTINCT ch.khoa_vector FROM doan_tai_lieu ch JOIN tai_lieu d ON d.ma=ch.ma_tai_lieu WHERE d.ma_mon_hoc=? AND d.ma_nguoi_dung=? AND d.luc_xoa IS NULL AND ch.khoa_vector IS NOT NULL", [course.id, course.user_id]);
        const [busy] = await db.execute("SELECT DISTINCT d.ma FROM tai_lieu d JOIN tac_vu_pdf j ON j.ma_tai_lieu=d.ma WHERE d.ma_mon_hoc=? AND d.ma_nguoi_dung=? AND j.trang_thai IN ('queued','running')", [course.id, course.user_id]);
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
