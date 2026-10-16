export function authRepository(pool) {
  const first = async (sql, values) => (await pool.execute(sql, values))[0][0];
  return {
    async createUser(user, passwordHash) {
      const db=await pool.getConnection();
      try {
        await db.beginTransaction();
        const [result]=await db.execute("INSERT INTO nguoi_dung(ho_ten,email,mat_khau_bam,vai_tro,trang_thai) VALUES(?,?,?,'student','active')",[user.fullName,user.email,passwordHash]);
        const id=String(result.insertId);
        await db.commit();return id;
      }catch(error){await db.rollback();throw error;}finally{db.release();}
    },
    findUserByEmail: email => first("SELECT u.* FROM nguoi_dung u WHERE email=?", [email]),
    findUserById: id => first("SELECT u.* FROM nguoi_dung u WHERE ma=?", [id]),
    async createSession(userId, tokenHash, csrfToken, ttl) {
      // Serialize session issuance with account status changes by locking the user row.
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [users] = await connection.execute("SELECT trang_thai FROM nguoi_dung WHERE ma=? FOR UPDATE", [userId]);
        if (users[0]?.status !== 'active') { await connection.rollback(); return false; }
        await connection.execute("INSERT INTO phien_dang_nhap (ma_nguoi_dung,ma_bam_token,token_chong_csrf,luc_het_han) VALUES (?,?,?,TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)))",
          [userId, tokenHash, csrfToken, ttl]);
        await connection.commit(); return true;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    findSession: tokenHash => first(`SELECT s.ma AS session_id,s.token_chong_csrf,u.* FROM phien_dang_nhap s
      JOIN nguoi_dung u ON u.ma=s.ma_nguoi_dung WHERE s.ma_bam_token=? AND s.luc_thu_hoi IS NULL AND s.luc_het_han>UTC_TIMESTAMP(3)`, [tokenHash]),
    async revokeSession(tokenHash) {
      await pool.execute("UPDATE phien_dang_nhap SET luc_thu_hoi=UTC_TIMESTAMP(3) WHERE ma_bam_token=? AND luc_thu_hoi IS NULL", [tokenHash]);
    },
    async revokeUserSessions(userId) {
      await pool.execute("UPDATE phien_dang_nhap SET luc_thu_hoi=UTC_TIMESTAMP(3) WHERE ma_nguoi_dung=? AND luc_thu_hoi IS NULL", [userId]);
    },
  };
}
