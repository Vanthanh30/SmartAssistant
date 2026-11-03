import { readFile } from 'node:fs/promises';

// Hợp đồng vật lý theo ERD; không tự tạo hoặc sửa database khi kiểm tra.
export async function assertExpectedDatabaseSchema(db) {
  const { tables } = JSON.parse(
    await readFile(new URL('../../database/schema-contract/model.json', import.meta.url), 'utf8'),
  );
  const [actual] = await db.query(
    'SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA,ORDINAL_POSITION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()',
  );
  const [physical] = await db.query(
    "SELECT TABLE_NAME,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'",
  );
  const expected = Object.entries(tables).flatMap(([name, t]) =>
    t.columns.map((c, i) => ({ ...c, table: name, position: i + 1 })),
  );
  const fail = (reason) => {
    throw new Error('DATABASE_SCHEMA_MISMATCH_' + reason);
  };
  if (
    physical.length !== 16 ||
    expected.length !== 124 ||
    actual.length !== 124 ||
    physical.some((t) => !tables[t.TABLE_NAME] || t.TABLE_COLLATION !== 'utf8mb4_0900_ai_ci')
  )
    fail('TABLES');
  for (const col of expected) {
    const found = actual.find((r) => r.TABLE_NAME === col.table && r.COLUMN_NAME === col.name);
    const type = col.type.toLowerCase().replace('boolean', 'tinyint(1)');
    const defaultValue = col.default?.replace(/^'|'$/g, '').toLowerCase() ?? null;
    if (
      !found ||
      found.COLUMN_TYPE.toLowerCase() !== type ||
      found.IS_NULLABLE !== (col.nullable ? 'YES' : 'NO') ||
      found.ORDINAL_POSITION !== col.position ||
      found.EXTRA.includes('auto_increment') !== col.autoIncrement ||
      String(found.COLUMN_DEFAULT ?? '').toLowerCase() !== String(defaultValue ?? '')
    )
      fail('COLUMN_' + col.table + '.' + col.name);
  }
  const [keys] = await db.query(
    'SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL',
  );
  const links = Object.entries(tables).flatMap(([name, t]) =>
    t.foreignKeys.map((f) => [name, f.column, f.table, f.key].join('.')),
  );
  if (
    keys.length !== 21 ||
    keys.some(
      (k) =>
        !links.includes(
          [k.TABLE_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME].join(
            '.',
          ),
        ),
    )
  )
    fail('FOREIGN_KEYS');
  const [indexes] = await db.query(
    'SELECT TABLE_NAME,INDEX_NAME,COLUMN_NAME,SEQ_IN_INDEX,NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY SEQ_IN_INDEX',
  );
  for (const [name, t] of Object.entries(tables)) {
    const grouped = Map.groupBy(
      indexes.filter((i) => i.TABLE_NAME === name && !i.NON_UNIQUE),
      (i) => i.INDEX_NAME,
    );
    if (
      JSON.stringify((grouped.get('PRIMARY') || []).map((i) => i.COLUMN_NAME)) !==
      JSON.stringify(t.primary)
    )
      fail('PRIMARY_' + name);
    const unique = [...grouped.entries()]
      .filter(([key]) => key !== 'PRIMARY')
      .map(([, cols]) => JSON.stringify(cols.map((i) => i.COLUMN_NAME)))
      .sort();
    if (
      JSON.stringify(unique) !== JSON.stringify(t.unique.map((cols) => JSON.stringify(cols)).sort())
    )
      fail('UNIQUE_' + name);
  }
  const [rules] = await db.query(
    'SELECT DELETE_RULE,UPDATE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()',
  );
  if (rules.some((r) => r.DELETE_RULE !== 'RESTRICT' || r.UPDATE_RULE !== 'RESTRICT'))
    fail('DELETE_RULES');
  return { tables: 16, columns: 124, foreignKeys: 21 };
}
