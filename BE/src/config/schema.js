import { assertExpectedDatabaseSchema } from './expectedDatabaseSchema.js';
export async function assertDatabaseSchema(db) {
  if (db.schemaVersion !== 16) throw new Error('DATABASE_SCHEMA_VERSION_UNSUPPORTED');
  return assertExpectedDatabaseSchema(db);
}
