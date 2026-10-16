import { deleteDocumentCloud } from './cloudWorker.js';
import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { pdfPath } from "../modules/documents/storage.js";
import { ragClient } from "../rag/client.js";
import { log } from "../config/logger.js";
async function remove(path) {
  try {
    await unlink(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
export async function processDeletion(
  { job, document },
  repository,
  pool,
  config,
  signal,
) {
  const abort = new AbortController();
  let lost = false;
  let renewing = false;
  let db;
  let locked = false;
  const cancel = () => abort.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  const heartbeat = setInterval(
    async () => {
      if (renewing || lost) return;
      renewing = true;
      try {
        if (!(await repository.renew(job))) {
          lost = true;
          cancel();
        }
      } catch {
        lost = true;
        cancel();
      } finally {
        renewing = false;
      }
    },
    (config.JOB_LEASE_SECONDS * 1000) / 3,
  );
  const owner = String(document.user_id);
  const course = String(document.course_id);
  const call = ragClient(config);
  try {
    db = await pool.getConnection();
    while (!locked) {
      abort.signal.throwIfAborted();
      locked =
        Number(
          (
            await db.execute("SELECT GET_LOCK(?,1) AS owned", [
              `rag-course-${course}`,
            ])
          )[0][0].owned,
        ) === 1;
    }
    const [rows] = await db.execute(
      "SELECT DISTINCT ch.khoa_vector FROM doan_tai_lieu ch JOIN tai_lieu d ON d.ma=ch.ma_tai_lieu WHERE d.ma_nguoi_dung=? AND d.ma_mon_hoc=? AND d.trang_thai='ready' AND d.luc_xoa IS NULL AND ch.khoa_vector IS NOT NULL",
      [owner, course],
    );
    const built = rows.length
      ? await call(
        "/indexes/build",
        { owner, course, keys: rows.map((row) => row.vector_key) },
        abort.signal,
      )
      : null;
    abort.signal.throwIfAborted();
    await repository.publish(job, document, built, db);
    // The new DB pointer excludes the source before any destructive storage cleanup.
    await call(
      "/documents/purge",
      {
        owner,
        course,
        document: String(document.id),
        keepIndexKey: built?.manifestKey ?? null,
      },
      abort.signal,
    );
    abort.signal.throwIfAborted();
    await deleteDocumentCloud(pool,config,document.id);
    await remove(pdfPath(config, document.storage_key));
    const extracted = join(config.UPLOAD_DIR, "extracted");
    for (const name of await readdir(extracted).catch(error=>{if(error.code==='ENOENT')return [];throw error;})) {
      if (
        name === document.storage_key + ".json" ||
        (name.startsWith(document.storage_key + ".json.") &&
          /^[a-f0-9-]{36}\.pdf\.json\.[a-f0-9-]{36}$/.test(name))
      )
        await remove(join(extracted, name));
    }
    abort.signal.throwIfAborted();
    await db.execute("DELETE FROM van_ban_pdf WHERE ma_tai_lieu=?",[document.id]);
    await repository.complete(job, document, db);
    log("worker", "document-deleted", { documentId: String(document.id) });
  } catch (error) {
    if (!lost) {
      try {
        await repository.fail(job, signal.aborted);
      } catch {
        /* expired lease/unknown commit is recovered by the durable job */
      }
    }
    log("worker", "deletion-interrupted", {
      documentId: String(document.id),
      code: error.code ?? "DELETE_CLEANUP_FAILED",
    });
  } finally {
    clearInterval(heartbeat);
    signal.removeEventListener("abort", cancel);
    if (db) {
      try {
        if (locked)
          await db.execute("SELECT RELEASE_LOCK(?)", [`rag-course-${course}`]);
      } finally {
        db.release();
      }
    }
  }
}
