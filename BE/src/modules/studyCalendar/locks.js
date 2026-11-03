import { AppError } from '../../shared/AppError.js';
export async function withOwnerLock(pool,owner,work) {
  const db=await pool.getConnection();const name=`study-calendar:${owner}`;let acquired=false;
  try {
    const [rows]=await db.execute('SELECT GET_LOCK(?,1) acquired',[name]);
    if(Number(rows[0].acquired)!==1)throw new AppError(409,'CALENDAR_BUSY','Lịch đang được cập nhật/đồng bộ. Thử lại sau.');
    acquired=true;return await work(db);
  } finally {
    try { if(acquired)await db.execute('SELECT RELEASE_LOCK(?)',[name]); }
    catch { db.destroy(); acquired=false; }
    if(acquired)db.release();else { try{db.release();}catch{/* already destroyed */} }
  }
}
export async function transaction(db,work) {
  await db.beginTransaction();
  try{const result=await work();await db.commit();return result;}catch(error){await db.rollback();throw error;}
}
