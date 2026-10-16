import { randomUUID } from "node:crypto";
export function deletionRepository(pool, config) {
  const fence = async (db, job) => {
    const [rows] = await db.execute(
      "SELECT ma FROM tac_vu_pdf WHERE ma=? AND trang_thai='running' AND ma_tien_trinh_khoa=? AND khoa_den_luc>UTC_TIMESTAMP(3) FOR UPDATE",
      [job.id, job.locked_by],
    );
    if (!rows.length) throw new Error("DELETE_LEASE_LOST");
  };
  const run = async (job, action, dedicated = null) => {
    const db = dedicated ?? (await pool.getConnection());
    try {
      await db.beginTransaction();
      await fence(db, job);
      await action(db);
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    } finally {
      if (!dedicated) db.release();
    }
  };
  const courseFence = async (db, document) => {
    const [rows] = await db.execute(
      "SELECT IS_USED_LOCK(?)=CONNECTION_ID() AS owned",
      [`rag-course-${document.course_id}`],
    );
    if (Number(rows[0].owned) !== 1) throw new Error("COURSE_LOCK_LOST");
  };
  return {
    async claim() {
      const db = await pool.getConnection();
      try {
        await db.beginTransaction();
        const [rows] = await db.query(
          "SELECT * FROM tac_vu_pdf WHERE loai_tac_vu='delete_pdf' AND ((trang_thai='queued' AND luc_chay_tiep<=UTC_TIMESTAMP(3)) OR (trang_thai='running' AND khoa_den_luc<=UTC_TIMESTAMP(3))) ORDER BY luc_chay_tiep,ma LIMIT 1 FOR UPDATE SKIP LOCKED",
        );
        if (!rows.length) {
          await db.commit();
          return null;
        }
        const job = rows[0];
        const document = (
          await db.execute("SELECT * FROM tai_lieu WHERE ma=? FOR UPDATE", [
            job.document_id,
          ])
        )[0][0];
        if (document.status !== "deleting") {
          await db.execute(
            "UPDATE tac_vu_pdf SET trang_thai='completed',ma_tien_trinh_khoa=NULL,khoa_den_luc=NULL WHERE ma=?",
            [job.id],
          );
          await db.commit();
          return null;
        }
        if (job.attempts >= config.JOB_MAX_ATTEMPTS) {
          await db.execute(
            "UPDATE tac_vu_pdf SET trang_thai='failed',loi_gan_nhat='DELETE_ATTEMPTS_EXHAUSTED',ma_tien_trinh_khoa=NULL,khoa_den_luc=NULL WHERE ma=?",
            [job.id],
          );
          await db.execute(
            "UPDATE tai_lieu SET ma_loi='DELETE_ATTEMPTS_EXHAUSTED',thong_bao_loi='Chưa xóa xong tài liệu. Chọn Thử xóa lại để tiếp tục.' WHERE ma=?",
            [document.id],
          );
          await db.commit();
          return null;
        }
        job.locked_by = randomUUID();
        job.attempts++;
        await db.execute(
          "UPDATE tac_vu_pdf SET trang_thai='running',so_lan_thu=?,ma_tien_trinh_khoa=?,khoa_den_luc=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE ma=?",
          [job.attempts, job.locked_by, config.JOB_LEASE_SECONDS, job.id],
        );
        await db.commit();
        return { job, document };
      } catch (error) {
        await db.rollback();
        throw error;
      } finally {
        db.release();
      }
    },
    renew: async (job) =>
      (
        await pool.execute(
          "UPDATE tac_vu_pdf SET khoa_den_luc=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE ma=? AND trang_thai='running' AND ma_tien_trinh_khoa=? AND khoa_den_luc>UTC_TIMESTAMP(3)",
          [config.JOB_LEASE_SECONDS, job.id, job.locked_by],
        )
      )[0].affectedRows === 1,
    async publish(job, document, built, db) {
      await run(
        job,
        async (connection) => {
          await courseFence(connection, document);
          if (built)
            await connection.execute(
              `INSERT INTO chi_muc_tim_kiem(ma_mon_hoc,ma_nguoi_dung,phien_ban,mo_hinh,phien_ban_mo_hinh,so_chieu,phep_do,khoa_manifest) VALUES (?,?,?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE phien_ban=VALUES(phien_ban),mo_hinh=VALUES(mo_hinh),phien_ban_mo_hinh=VALUES(phien_ban_mo_hinh),so_chieu=VALUES(so_chieu),phep_do=VALUES(phep_do),khoa_manifest=VALUES(khoa_manifest)`,
              [
                document.course_id,
                document.user_id,
                built.version,
                built.model,
                built.revision,
                built.dimension,
                built.metric,
                built.manifestKey,
              ],
            );
          else
            await connection.execute(
              "DELETE FROM chi_muc_tim_kiem WHERE ma_mon_hoc=? AND ma_nguoi_dung=?",
              [document.course_id, document.user_id],
            );
        },
        db,
      );
    },
    async complete(job, document, db) {
      await run(
        job,
        async (connection) => {
          await courseFence(connection, document);
          // F07 adds nullable citation FKs/snapshots; never cascade-delete history here.
          await connection.execute("DELETE FROM doan_tai_lieu WHERE ma_tai_lieu=?", [
            document.id,
          ]);
          await connection.execute(
            "UPDATE tai_lieu SET trang_thai='deleted',luc_xoa=UTC_TIMESTAMP(3),ma_loi=NULL,thong_bao_loi=NULL WHERE ma=? AND trang_thai='deleting'",
            [document.id],
          );
          await connection.execute(
            "UPDATE tac_vu_pdf SET trang_thai='completed',ma_tien_trinh_khoa=NULL,khoa_den_luc=NULL,loi_gan_nhat=NULL WHERE ma=?",
            [job.id],
          );
        },
        db,
      );
    },
    async fail(job, aborted) {
      await run(job, async (db) => {
        const retry = aborted || job.attempts < config.JOB_MAX_ATTEMPTS;
        await db.execute(
          "UPDATE tac_vu_pdf SET trang_thai=?,so_lan_thu=GREATEST(so_lan_thu-?,0),ma_tien_trinh_khoa=NULL,khoa_den_luc=NULL,loi_gan_nhat=?,luc_chay_tiep=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE ma=?",
          [
            retry ? "queued" : "failed",
            aborted ? 1 : 0,
            aborted ? null : "DELETE_CLEANUP_FAILED",
            Math.min(60, 2 ** job.attempts),
            job.id,
          ],
        );
        await db.execute(
          "UPDATE tai_lieu SET ma_loi=?,thong_bao_loi=? WHERE ma=? AND trang_thai='deleting'",
          [
            aborted ? null : "DELETE_CLEANUP_FAILED",
            aborted
              ? null
              : retry
                ? "Chưa xóa xong. Hệ thống đang thử lại."
                : "Chưa xóa xong. Chọn Thử xóa lại để tiếp tục.",
            job.document_id,
          ],
        );
      });
    },
  };
}
