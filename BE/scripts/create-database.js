import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { loadConfig } from "../src/config/env.js";
import { sqlStatements } from "./sql-statements.js";
const c = loadConfig();
const name = process.argv[2] || "tro_ly_hoc_tap";
if (
  c.NODE_ENV !== "development" ||
  !["localhost", "127.0.0.1", "::1"].includes(c.DB_HOST) ||
  name !== "tro_ly_hoc_tap"
)
  throw new Error("LOCAL_DEV_TARGET_REQUIRED");
const db = await mysql.createConnection({
  host: c.DB_HOST,
  port: c.DB_PORT,
  user: c.DB_USER,
  password: c.DB_PASSWORD,
});
try {
  const [exists] = await db.execute(
    "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?",
    [name],
  );
  if (exists.length) throw new Error("TARGET_EXISTS_NOT_OVERWRITTEN");
  await db.query(
    "CREATE DATABASE `tro_ly_hoc_tap` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci",
  );
  await db.query("USE `tro_ly_hoc_tap`");
  for (const statement of sqlStatements(
    await readFile(new URL("../database/schema.sql", import.meta.url), "utf8"),
  ))
    await db.query(statement);
  const [tables] = await db.query("SHOW TABLES");
  if (tables.length !== 19) throw new Error("SCHEMA_TABLE_COUNT_MISMATCH");
  console.log(
    "Đã tạo tro_ly_hoc_tap với19 bảng. Không đổi DB_NAME hoặc xóa DB cũ.",
  );
} finally {
  await db.end();
}
