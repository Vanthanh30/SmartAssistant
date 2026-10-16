import mapping from '../../database/vietnamese-mapping.json' with {type:'json'};
export async function assertSchema(db) {
  const [rows]=await db.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'");
  const expected=Object.values(mapping.tables).sort();const found=rows.map(row=>row.TABLE_NAME).sort();
  if(JSON.stringify(expected)!==JSON.stringify(found)) throw new Error('SCHEMA_VI_19_REQUIRED');
  const [allColumns]=await db.query('SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()');
  for(const [table,fields] of Object.entries(mapping.columns)) {
    const columns=allColumns.filter(column=>column.TABLE_NAME===table);
    if(Object.values(fields).some(name=>!columns.some(column=>column.COLUMN_NAME===name))) throw new Error('SCHEMA_VI_COLUMNS_REQUIRED');
  }
}
