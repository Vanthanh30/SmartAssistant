import { assertSchema } from './config/schema.js';
import { loadConfig } from "./config/env.js";
import { createPool } from "./config/db.js";
import { createApp } from "./app.js";
import { log } from "./config/logger.js";
import { prepareStorage } from "./modules/documents/storage.js";
let pool;
try {
  const config = loadConfig();
  pool = createPool(config);
  await assertSchema(pool);
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
