// Call inside the business transaction; metadata must contain only server-selected fields.
export async function writeAudit(db,{actorId,action,entityType,entityId,metadata}){
 await db.execute("INSERT INTO nhat_ky_quan_tri(ma_nguoi_thuc_hien,hanh_dong,loai_doi_tuong,ma_doi_tuong,du_lieu_bo_sung) VALUES(?,?,?,?,?)",[actorId,action,entityType,entityId,JSON.stringify(metadata)]);
}
