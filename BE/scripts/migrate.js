import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/env.js';
import { createPool } from '../src/config/db.js';
import { migrationFiles, migrationProblem, migrationStatus, existingCreateTables, prepareMigrationJournal } from './migration-state.js';
export async function migrate(pool) {
  const connection = await pool.getConnection();
  let locked = false;
  try {
    const [locks] = await connection.query("SELECT GET_LOCK('study_auth_migration',10) AS acquired");
    if (Number(locks[0].acquired) !== 1) throw new Error('Không lấy được migration lock');
    locked = true;
    await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    await prepareMigrationJournal(connection);
    for (const { name, sql, checksum, statements } of await migrationFiles()) {
      const [existing] = await connection.execute('SELECT checksum FROM schema_migrations WHERE name=?', [name]);
      const [runs] = await connection.execute('SELECT checksum,state FROM schema_migration_runs WHERE name=?', [name]);
      const run = runs[0];
      if ((existing.length && existing[0].checksum !== checksum) || (run && run.checksum !== checksum)) throw migrationProblem('MIGRATION_CHECKSUM_MISMATCH', name);
      if (existing.length) {
        if (run && run.state !== 'completed') throw migrationProblem('MIGRATION_JOURNAL_INCONSISTENT', name);
        continue;
      }
      if (run) throw migrationProblem('MIGRATION_PARTIAL_OR_UNCERTAIN', name);
      if ((await existingCreateTables(connection, sql)).length) throw migrationProblem('MIGRATION_UNTRACKED_SCHEMA', name);
      await connection.execute("INSERT INTO schema_migration_runs(name,checksum,state,statement_count) VALUES(?,?,'running',?)", [name, checksum, statements.length]);
      try {
        for (const [index, statement] of statements.entries()) {
          // Persist intent BEFORE SQL. DDL may commit before this process can acknowledge it.
          await connection.execute('UPDATE schema_migration_runs SET inflight_step=? WHERE name=?', [index + 1, name]);
          await connection.query(statement);
          await connection.execute('UPDATE schema_migration_runs SET completed_steps=?,inflight_step=NULL WHERE name=?', [index + 1, name]);
        }
        // These metadata writes are atomic; the preceding MySQL DDL is NOT transactional.
        await connection.beginTransaction();
        await connection.execute('INSERT INTO schema_migrations(name,checksum) VALUES (?,?)', [name, checksum]);
        await connection.execute("UPDATE schema_migration_runs SET state='completed',error_code=NULL WHERE name=?", [name]);
        await connection.commit();
      } catch (error) {
        await connection.rollback().catch(() => {});
        await connection.execute("UPDATE schema_migration_runs SET state='failed',error_code=? WHERE name=? AND state='running'",
          [String(error.code || 'MIGRATION_INTERRUPTED').slice(0, 80), name]).catch(() => {});
        throw migrationProblem('MIGRATION_PARTIAL_OR_UNCERTAIN', name);
      }
    }
  } finally {
    try { if (locked) await connection.query("SELECT RELEASE_LOCK('study_auth_migration')"); }
    finally { connection.release(); }
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 1 && args[0] === '--status')) throw new Error('Chỉ hỗ trợ migrate hoặc --status; không có force/skip/checksum override.');
  const pool = createPool(loadConfig());
  try {
    if (args[0] === '--status') console.log(JSON.stringify(await migrationStatus(pool), null, 2));
    else { await migrate(pool); console.log('Migrations đã áp dụng.'); }
  }
  finally { await pool.end(); }
}
