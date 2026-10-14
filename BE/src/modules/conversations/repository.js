// SQL stays on the connection supplied by service/policy; no hidden transactions or connections.
export function conversationRepository(db) {
  return {
    actor: (params = []) => db.execute('SELECT status,role FROM users WHERE id=? FOR UPDATE', params),
    session: (params = []) => db.execute('SELECT id FROM auth_sessions WHERE user_id=? AND csrf_token=? AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE', params),
    owned: (params = []) => db.execute('SELECT * FROM conversations WHERE id=? AND user_id=?', params),
    citationRows: (messageIds) => db.execute(`SELECT c.*,d.status document_status FROM citations c LEFT JOIN documents d ON d.id=c.document_id WHERE c.message_id IN (${messageIds.map(() => '?').join(',')}) ORDER BY c.id`, messageIds),
    request: (params = []) => db.execute("SELECT * FROM qa_messages WHERE conversation_id=? AND request_id=? AND role='user'", params),
    interrupt: (params = []) => db.execute("UPDATE qa_messages SET status='failed',error_code='REQUEST_INTERRUPTED',error_status=409 WHERE id=?", params),
    answer: (params = []) => db.execute("SELECT * FROM qa_messages WHERE conversation_id=? AND request_id=? AND role='assistant'", params),
    course: (params = []) => db.execute('SELECT id FROM courses WHERE id=? AND user_id=?', params),
    insertConversation: (params = []) => db.execute('INSERT INTO conversations(course_id,user_id,title) VALUES(?,?,?)', params),
    snapshot: (params = []) => db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', params),
    courseName: (params = []) => db.execute('SELECT name FROM courses WHERE id=? AND user_id=?', params),
    cursor: (params = []) => db.execute('SELECT id FROM qa_messages WHERE id=? AND conversation_id=?', params),
    transcript: (beforeMessageId, params = []) => db.query(`SELECT * FROM qa_messages WHERE conversation_id=?${beforeMessageId ? ' AND id<?' : ''} ORDER BY id DESC LIMIT ?`, params),
    acquireLock: (params = []) => db.execute('SELECT GET_LOCK(?,0) acquired', params),
    lockOwned: (params = []) => db.execute('SELECT id FROM conversations WHERE id=? AND user_id=? FOR UPDATE', params),
    deleteConversation: (params = []) => db.execute('DELETE FROM conversations WHERE id=? AND user_id=?', params),
    releaseLock: (params = []) => db.execute('SELECT RELEASE_LOCK(?)', params),
    readyDocument: (params = []) => db.execute("SELECT id FROM documents WHERE id=? AND user_id=? AND course_id=? AND status='ready' AND deleted_at IS NULL", params),
    dailyUsage: (params = []) => db.execute('SELECT COUNT(*) total FROM ask_usage WHERE user_id=? AND charged_at>=UTC_DATE()', params),
    minuteUsage: (params = []) => db.execute('SELECT COUNT(*) total FROM ask_usage WHERE user_id=? AND charged_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE)', params),
    reserveQuestion: (params = []) => db.execute("INSERT INTO qa_messages(conversation_id,request_id,payload_hash,role,content,status) VALUES(?,?,?,'user',?,'processing')", params),
    chargeUsage: (params = []) => db.execute('INSERT INTO ask_usage(user_id) VALUES(?)', params),
    initialTitle: (params = []) => db.execute("UPDATE conversations SET title=? WHERE id=? AND title='Hội thoại mới' AND (SELECT COUNT(*) FROM qa_messages WHERE conversation_id=?)=1", params),
    recentTurns: (params = []) => db.query("SELECT role,content FROM qa_messages WHERE conversation_id=? AND status='answered' ORDER BY id DESC LIMIT 6", params),
    verifyContext: (ids, owner, course) => db.execute(`SELECT ch.id FROM chunks ch JOIN documents d ON d.id=ch.document_id
                WHERE ch.id IN (${ids.map(() => '?').join(',')}) AND d.user_id=? AND d.course_id=? AND d.status='ready' AND d.deleted_at IS NULL`, [...ids,owner,course]),
    lockDocument: (params = []) => db.execute("SELECT id FROM documents WHERE id=? AND user_id=? AND course_id=? AND status='ready' AND deleted_at IS NULL FOR UPDATE", params),
    lockChunk: (params = []) => db.execute('SELECT id FROM chunks WHERE id=? AND document_id=? FOR UPDATE', params),
    insertAnswer: (params = []) => db.execute("INSERT INTO qa_messages(conversation_id,request_id,payload_hash,role,content,status,model,latency_ms,answer_origin) VALUES(?,?,?,'assistant',?,?,?,?,?)", params),
    insertCitation: (params = []) => db.execute('INSERT INTO citations(message_id,chunk_id,document_id,file_name,page_from,page_to,excerpt,score) VALUES(?,?,?,?,?,?,?,?)', params),
    completeQuestion: (params = []) => db.execute("UPDATE qa_messages SET status=?,latency_ms=?,answer_origin=? WHERE conversation_id=? AND request_id=? AND role='user'", params),
    touchConversation: (params = []) => db.execute('UPDATE conversations SET updated_at=CURRENT_TIMESTAMP(3) WHERE id=?', params),
    failQuestion: (params = []) => db.execute("UPDATE qa_messages SET status='failed',error_code=?,error_status=?,latency_ms=? WHERE conversation_id=? AND request_id=? AND role='user' AND status='processing'", params),
    neighbours: (conditions, params) => db.execute(`SELECT ch.*,d.original_name FROM chunks ch JOIN documents d ON d.id=ch.document_id
      WHERE d.user_id=? AND d.course_id=? AND d.status='ready' AND d.deleted_at IS NULL
      AND (${conditions.join(' OR ')}) ORDER BY ch.document_id,ch.chunk_order`, params),
  };
}
