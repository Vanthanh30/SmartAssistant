// Parameterized SQL; callers supply the pool or their short-lived transaction connection.
export function learningRepository(db) {
  return {
    actor: (params) => db.execute('SELECT status,role FROM users WHERE id=? FOR UPDATE',params),
    session: (params) => db.execute('SELECT id FROM auth_sessions WHERE user_id=? AND csrf_token=? AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE',params),
    course: (params) => db.execute('SELECT id FROM courses WHERE id=? AND user_id=?',params),
    set: (params, lock = false) => db.execute(`SELECT s.*,(SELECT COUNT(*) FROM learning_items WHERE set_id=s.id) item_count FROM learning_sets s WHERE s.id=? AND s.user_id=?${lock ? ' FOR UPDATE' : ''}`,params),
    verifySource: async ([chunkId,documentId,owner,courseId], lock = false) => {
      // Document before chunk, matching deletion finalization's lock order.
      const [documents] = await db.execute(`SELECT id FROM documents WHERE id=? AND user_id=? AND course_id=? AND status='ready' AND deleted_at IS NULL${lock ? ' FOR UPDATE' : ''}`,[documentId,owner,courseId]);
      if (!documents.length) return [[],[]];
      return db.execute(`SELECT id FROM chunks WHERE id=? AND document_id=?${lock ? ' FOR UPDATE' : ''}`,[chunkId,documentId]);
    },
    items: (params) => db.execute('SELECT * FROM learning_items WHERE set_id=? ORDER BY position',params),
    citations: (params) => db.execute(`SELECT c.*,d.status document_status,d.deleted_at FROM learning_citations c
      JOIN learning_items i ON i.id=c.item_id LEFT JOIN documents d ON d.id=c.document_id WHERE i.set_id=? ORDER BY c.id`,params),
    attempt: (params) => db.execute('SELECT * FROM learning_attempts WHERE id=? AND user_id=?',params),
    answers: (params) => db.execute('SELECT item_id,choice,is_correct FROM learning_answers WHERE attempt_id=?',params),
    countSets: (params) => db.execute('SELECT COUNT(*) total FROM learning_sets WHERE course_id=? AND user_id=?',params),
    listSets: (params) => db.query(`SELECT s.*,(SELECT COUNT(*) FROM learning_items WHERE set_id=s.id) item_count FROM learning_sets s
          WHERE course_id=? AND user_id=? ORDER BY id DESC LIMIT ? OFFSET ?`,params),
    generation: (params) => db.execute('SELECT * FROM learning_generation_requests WHERE user_id=? AND request_id=?',params),
    readyDocuments: (params) => db.execute(`SELECT id FROM documents WHERE id IN (${params.slice(0,-2).map(() => '?').join(',')}) AND user_id=? AND course_id=? AND status='ready' AND deleted_at IS NULL`,params),
    chunkCounts: (params) => db.execute(`SELECT document_id,COUNT(*) total FROM chunks WHERE document_id IN (${params.map(() => '?').join(',')}) GROUP BY document_id`,params),
    dailyUsage: (params) => db.execute('SELECT COUNT(*) total FROM learning_generation_requests WHERE user_id=? AND created_at>=UTC_DATE()',params),
    recentUsage: (params) => db.execute('SELECT COUNT(*) total FROM learning_generation_requests WHERE user_id=? AND created_at>=UTC_TIMESTAMP(3)-INTERVAL 1 MINUTE',params),
    reserveGeneration: (params) => db.execute("INSERT INTO learning_generation_requests(user_id,course_id,request_id,payload_hash,state) VALUES(?,?,?,?,'processing')",params),
    sampleChunks: ([documentId,owner,courseId,seed]) => db.execute(`WITH sections AS (
      SELECT ch.id, NTILE(16) OVER (ORDER BY ch.page_from,ch.chunk_order,ch.id) section_bin
      FROM chunks ch JOIN documents d ON d.id=ch.document_id
      WHERE ch.document_id=? AND d.user_id=? AND d.course_id=? AND d.status='ready' AND d.deleted_at IS NULL
    ), samples AS (
      SELECT id,section_bin,ROW_NUMBER() OVER (PARTITION BY section_bin ORDER BY CRC32(CONCAT(id,?)),id) pick FROM sections
    ) SELECT ch.id chunkId,ch.document_id documentId,LEFT(ch.content,4000) content,
      ch.page_from pageFrom,ch.page_to pageTo,d.original_name fileName,s.section_bin sectionBin
      FROM samples s JOIN chunks ch ON ch.id=s.id JOIN documents d ON d.id=ch.document_id
      WHERE s.pick<=2 AND d.user_id=? AND d.course_id=? AND d.status='ready' AND d.deleted_at IS NULL
      ORDER BY s.section_bin,s.pick,ch.id LIMIT 32`,[documentId,owner,courseId,seed,owner,courseId]),
    insertSet: (params) => db.execute('INSERT INTO learning_sets(course_id,user_id,kind,title,model,source_count) VALUES(?,?,?,?,?,?)',params),
    insertItem: (params) => db.execute('INSERT INTO learning_items(set_id,position,prompt,answer,choices,correct_index,explanation) VALUES(?,?,?,?,?,?,?)',params),
    insertCitation: (params) => db.execute('INSERT INTO learning_citations(item_id,chunk_id,document_id,file_name,page_from,page_to,excerpt) VALUES(?,?,?,?,?,?,?)',params),
    completeGeneration: (params) => db.execute("UPDATE learning_generation_requests SET state='completed',set_id=? WHERE id=?",params),
    failGeneration: (params) => db.execute("UPDATE learning_generation_requests SET state='failed',error_code=?,error_status=? WHERE id=? AND state='processing'",params),
    deleteSet: (params) => db.execute('DELETE FROM learning_sets WHERE id=?',params),
    attemptRequest: (params) => db.execute('SELECT id,set_id FROM learning_attempts WHERE user_id=? AND request_id=?',params),
    insertAttempt: (params) => db.execute('INSERT INTO learning_attempts(set_id,user_id,request_id,total_questions) VALUES(?,?,?,?)',params),
    listAttempts: (params) => db.execute('SELECT id,score,correct_count,total_questions,started_at,completed_at FROM learning_attempts WHERE set_id=? AND user_id=? ORDER BY id DESC LIMIT 50',params),
    lookupAttempt: (params) => db.execute('SELECT set_id FROM learning_attempts WHERE id=? AND user_id=?',params),
    lockAttempt: (params) => db.execute('SELECT * FROM learning_attempts WHERE id=? AND user_id=? FOR UPDATE',params),
    gradeItems: (params) => db.execute('SELECT id,correct_index FROM learning_items WHERE set_id=? ORDER BY position',params),
    insertAnswer: (params) => db.execute('INSERT INTO learning_answers(attempt_id,item_id,choice,is_correct) VALUES(?,?,?,?)',params),
    completeAttempt: (params) => db.execute('UPDATE learning_attempts SET score=?,correct_count=?,submission_hash=?,completed_at=UTC_TIMESTAMP(3) WHERE id=?',params),
  };
}
