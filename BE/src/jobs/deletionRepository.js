import { randomUUID } from "node:crypto";
export function deletionRepository(pool, config) {
  const fence = async (db, job) => {
    const [rows] = await db.execute(
      "SELECT id FROM processing_jobs WHERE id=? AND status='running' AND locked_by=? AND locked_until>UTC_TIMESTAMP(3) FOR UPDATE",
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
          "SELECT * FROM processing_jobs WHERE type='delete_pdf' AND ((status='queued' AND next_run_at<=UTC_TIMESTAMP(3)) OR (status='running' AND locked_until<=UTC_TIMESTAMP(3))) ORDER BY next_run_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",
        );
        if (!rows.length) {
          await db.commit();
          return null;
        }
        const job = rows[0];
        const document = (
          await db.execute("SELECT * FROM documents WHERE id=? FOR UPDATE", [
            job.document_id,
          ])
        )[0][0];
        if (document.status !== "deleting") {
          await db.execute(
            "UPDATE processing_jobs SET status='completed',locked_by=NULL,locked_until=NULL WHERE id=?",
            [job.id],
          );
          await db.commit();
          return null;
        }
        if (job.attempts >= config.JOB_MAX_ATTEMPTS) {
          await db.execute(
            "UPDATE processing_jobs SET status='failed',last_error='DELETE_ATTEMPTS_EXHAUSTED',locked_by=NULL,locked_until=NULL WHERE id=?",
            [job.id],
          );
          await db.execute(
            "UPDATE documents SET error_code='DELETE_ATTEMPTS_EXHAUSTED',error_message='Chưa xóa xong tài liệu. Chọn Thử xóa lại để tiếp tục.' WHERE id=?",
            [document.id],
          );
          await db.commit();
          return null;
        }
        job.locked_by = randomUUID();
        job.attempts++;
        await db.execute(
          "UPDATE processing_jobs SET status='running',attempts=?,locked_by=?,locked_until=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE id=?",
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
          "UPDATE processing_jobs SET locked_until=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE id=? AND status='running' AND locked_by=? AND locked_until>UTC_TIMESTAMP(3)",
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
              `INSERT INTO course_indexes(course_id,user_id,version,model,model_revision,dimension,metric,manifest_key) VALUES (?,?,?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE version=VALUES(version),model=VALUES(model),model_revision=VALUES(model_revision),dimension=VALUES(dimension),metric=VALUES(metric),manifest_key=VALUES(manifest_key)`,
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
              "DELETE FROM course_indexes WHERE course_id=? AND user_id=?",
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
          await connection.execute("DELETE FROM chunks WHERE document_id=?", [
            document.id,
          ]);
          await connection.execute(
            "UPDATE documents SET status='deleted',deleted_at=UTC_TIMESTAMP(3),error_code=NULL,error_message=NULL WHERE id=? AND status='deleting'",
            [document.id],
          );
          await connection.execute(
            "UPDATE processing_jobs SET status='completed',locked_by=NULL,locked_until=NULL,last_error=NULL WHERE id=?",
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
          "UPDATE processing_jobs SET status=?,attempts=GREATEST(attempts-?,0),locked_by=NULL,locked_until=NULL,last_error=?,next_run_at=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE id=?",
          [
            retry ? "queued" : "failed",
            aborted ? 1 : 0,
            aborted ? null : "DELETE_CLEANUP_FAILED",
            Math.min(60, 2 ** job.attempts),
            job.id,
          ],
        );
        await db.execute(
          "UPDATE documents SET error_code=?,error_message=? WHERE id=? AND status='deleting'",
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
