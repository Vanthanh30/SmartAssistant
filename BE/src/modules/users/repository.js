import { enqueueCloudAsset } from '../../integrations/cloudinary.js';
import { AppError } from '../../shared/AppError.js';
export function userRepository(pool) {
  return {
    reserveAvatar: (id,key,size,sha256,config)=>enqueueCloudAsset(pool,config,{key,owner:id,size,sha256}),
    abandonAvatar: (id,key)=>pool.execute("UPDATE cloud_assets SET state='deleting',locked_until=NULL,next_run_at=UTC_TIMESTAMP(3) WHERE user_id=? AND storage_key=?",[id,key]),
    async get(id) { return (await pool.execute('SELECT u.*,(SELECT state FROM cloud_assets WHERE storage_key=u.avatar_key AND user_id=u.id) avatar_storage_status FROM users u WHERE id=?', [id]))[0][0]; },
    async asset(id,key){return (await pool.execute('SELECT * FROM cloud_assets WHERE user_id=? AND storage_key=?',[id,key]))[0][0];},
    async updateName(id, name) {
      await pool.execute('UPDATE users SET full_name=? WHERE id=?', [name, id]);
      return this.get(id);
    },
    async replaceAvatar(id, key, _size, _sha256, _config) {
      const connection = await pool.getConnection();
      let committing=false;
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute('SELECT avatar_key,status FROM users WHERE id=? FOR UPDATE', [id]);
        if(rows[0]?.status!=='active')throw new AppError(403,'ACCOUNT_BLOCKED','Tài khoản không còn hoạt động.');
        const [assets]=await connection.execute('SELECT public_id FROM cloud_assets WHERE user_id=? AND storage_key=?',[id,key]);
        if(!assets.length)throw new AppError(503,'CLOUD_FILE_UNAVAILABLE','Chưa có upload Cloudinary.');
        await connection.execute("UPDATE cloud_assets SET state='uploaded',uploaded_at=UTC_TIMESTAMP(3),locked_until=NULL WHERE user_id=? AND storage_key=?",[id,key]);
        if(rows[0].avatar_key)await connection.execute("UPDATE cloud_assets SET state='deleting',attempts=0,next_run_at=UTC_TIMESTAMP(3) WHERE storage_key=? AND user_id=?",[rows[0].avatar_key,id]);
        await connection.execute('UPDATE users SET avatar_key=? WHERE id=?', [key, id]);
        committing=true;await connection.commit(); return rows[0].avatar_key;
      } catch (error) { error.commitOutcomeUnknown=committing;await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
  };
}
