import { loadConfig } from "./config/env.js";
import { createPool } from "./config/db.js";
import { createApp } from "./app.js";
import { log } from "./config/logger.js";
import { prepareStorage } from "./modules/documents/storage.js";
let pool;
try {
  const config = loadConfig();
  pool = createPool(config);
  await pool.query("SELECT 1");
  await pool.query("SELECT public_id FROM cloud_assets LIMIT 1");
  await pool.query("SELECT id FROM mail_outbox LIMIT 1");
  for (const table of [
    "learning_sets",
    "learning_items",
    "learning_citations",
    "learning_attempts",
    "learning_generation_requests",
  ])
    await pool.query(`SELECT id FROM ${table} LIMIT 1`);
  await pool.query("SELECT attempt_id FROM learning_answers LIMIT 1");
  await pool.query("SELECT id FROM auth_sessions LIMIT 1");
  await pool.query("SELECT id FROM courses LIMIT 1");
  await pool.query("SELECT id FROM documents LIMIT 1");
  await pool.query("SELECT id FROM processing_jobs LIMIT 1");
  await pool.query("SELECT id FROM conversations LIMIT 1");
  await pool.query("SELECT id FROM qa_messages LIMIT 1");
  await pool.query("SELECT answer_origin FROM qa_messages LIMIT 1");
  await pool.query("SELECT id FROM citations LIMIT 1");
  await pool.query("SELECT id FROM ask_usage LIMIT 1");
  await pool.query("SELECT id FROM audit_logs LIMIT 1");
  if (
    !(await pool.query("SELECT id FROM admin_status_guard WHERE id=1"))[0]
      .length
  )
    throw new Error("ADMIN_STATUS_GUARD_MISSING");
  if (
    !(
      await pool.execute("SELECT name FROM schema_migrations WHERE name=?", [
        "015_answer_origin.sql",
      ])
    )[0].length
  )
    throw new Error("Cần áp dụng migration014 trước khi khởi động API.");
  await prepareStorage(config);
  const server = createApp(pool, config).listen(config.PORT, "127.0.0.1", () =>
    log("api", "ready", { port: config.PORT }),
  );
  server.on("error", async (error) => {
    log("api", "listen-failed", { code: error.code });
    await pool.end();
    process.exit(1);
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
  process.on("message", (message) => {
    if (message?.type === "shutdown") stop();
  });
  if (process.send) process.on("disconnect", stop);
} catch (error) {
  console.error(`Không thể khởi động API: ${error.code ?? error.message}`);
  await pool?.end();
  process.exitCode = 1;
}
