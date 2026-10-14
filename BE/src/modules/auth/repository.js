export function authRepository(pool) {
  const first = async (sql, values) => (await pool.execute(sql, values))[0][0];
  return {
    async createUser(user, passwordHash) {
      const db=await pool.getConnection();
      try {
        await db.beginTransaction();
        const [result]=await db.execute("INSERT INTO users(full_name,email,password_hash,role,status) VALUES(?,?,?,'student','active')",[user.fullName,user.email,passwordHash]);
        const id=String(result.insertId);
        await db.commit();return id;
      }catch(error){await db.rollback();throw error;}finally{db.release();}
    },
    findUserByEmail: email => first('SELECT u.* FROM users u WHERE email=?', [email]),
    findUserById: id => first('SELECT u.* FROM users u WHERE id=?', [id]),
    async createSession(userId, tokenHash, csrfToken, ttl) {
      // Serialize session issuance with account status changes by locking the user row.
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [users] = await connection.execute('SELECT status FROM users WHERE id=? FOR UPDATE', [userId]);
        if (users[0]?.status !== 'active') { await connection.rollback(); return false; }
        await connection.execute('INSERT INTO auth_sessions (user_id,token_hash,csrf_token,expires_at) VALUES (?,?,?,TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)))',
          [userId, tokenHash, csrfToken, ttl]);
        await connection.commit(); return true;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    findSession: tokenHash => first(`SELECT s.id AS session_id,s.csrf_token,u.* FROM auth_sessions s
      JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>UTC_TIMESTAMP(3)`, [tokenHash]),
    async revokeSession(tokenHash) {
      await pool.execute('UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE token_hash=? AND revoked_at IS NULL', [tokenHash]);
    },
    async revokeUserSessions(userId) {
      await pool.execute('UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL', [userId]);
    },
  };
}
