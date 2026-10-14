import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const migrationProblem = (code, name) => Object.assign(
  new Error(`${code}: ${name}. Xem docs/MIGRATION_RECOVERY.md; không tự chạy lại bước có kết quả chưa xác định.`), { code });
export async function migrationFiles() {
  const directory = new URL('../database/migrations/', import.meta.url);
  return Promise.all((await readdir(directory)).filter(name => name.endsWith('.sql')).sort().map(async name => {
    const sql = await readFile(new URL(name, directory), 'utf8');
    return { name, sql, checksum: createHash('sha256').update(sql).digest('hex'),
      statements: sql.split(';').filter(statement => statement.trim()) };
  }));
}
async function tableExists(db, name) {
  return (await db.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [name]))[0].length > 0;
}
export async function existingCreateTables(db, sql) {
  // A common legacy partial-run signal, not proof that the whole migration was applied.
  const names = [...sql.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-zA-Z0-9_]+)`?/gi)].map(match => match[1]);
  const present = [];
  for (const name of names) if (await tableExists(db, name)) present.push(name);
  return present;
}
export async function migrationStatus(pool) {
  const db = await pool.getConnection();
  try {
    const hasApplied = await tableExists(db, 'schema_migrations');
    const hasJournal = await tableExists(db, 'schema_migration_runs');
    const [applied] = hasApplied ? await db.query('SELECT name,checksum FROM schema_migrations') : [[]];
    const [runs] = hasJournal ? await db.query('SELECT name,checksum,state,statement_count,completed_steps,inflight_step,error_code FROM schema_migration_runs') : [[]];
    const installed = new Map(applied.map(row => [row.name, row]));
    const journal = new Map(runs.map(row => [row.name, row]));
    const result = [];
    for (const file of await migrationFiles()) {
      const appliedRow = installed.get(file.name); const run = journal.get(file.name);
      const preexistingTables = !appliedRow && !run ? await existingCreateTables(db, file.sql) : [];
      const mismatch = (appliedRow && appliedRow.checksum !== file.checksum) || (run && run.checksum !== file.checksum);
      const state = mismatch ? 'checksum_mismatch' : appliedRow
        ? run && run.state !== 'completed' ? 'applied_journal_incomplete' : 'applied'
        : run ? run.state === 'completed' ? 'journal_without_applied_record' : 'partial_or_uncertain'
        : preexistingTables.length ? 'untracked_schema_present' : 'pending_unverified';
      result.push({ name: file.name, checksum: file.checksum, state, statementCount: file.statements.length,
        completedSteps: run?.completed_steps ?? null, inflightStep: run?.inflight_step ?? null,
        errorCode: run?.error_code ?? null, preexistingTables });
    }
    return result;
  } finally { db.release(); }
}
export async function prepareMigrationJournal(db) {
  // Only an explicit migrate call creates this metadata table; --status never creates tables.
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migration_runs (
    name VARCHAR(255) PRIMARY KEY, checksum CHAR(64) NOT NULL,
    state ENUM('running','failed','completed') NOT NULL,
    statement_count INT UNSIGNED NOT NULL, completed_steps INT UNSIGNED NOT NULL DEFAULT 0,
    inflight_step INT UNSIGNED NULL, error_code VARCHAR(80) NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`);
}
