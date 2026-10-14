// Call inside the business transaction; metadata must contain only server-selected fields.
export async function writeAudit(db,{actorId,action,entityType,entityId,metadata}){
 await db.execute('INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,?)',[actorId,action,entityType,entityId,JSON.stringify(metadata)]);
}
