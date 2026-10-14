import { answerPolicy } from './answerPolicy.js';
import { conversationRepository } from './repository.js';
import { createHash } from 'node:crypto';
import { AppError } from '../../shared/AppError.js';
import { llmProvider } from './provider.js';
import { historyRepository } from './historyRepository.js';

const conversationDto = row => ({ id: String(row.id), courseId: String(row.course_id), title: row.title, createdAt: row.created_at, updatedAt: row.updated_at });
export function conversationService(pool, config) {
  const provider = llmProvider(config);
  const history = historyRepository(pool);
  async function activeActor(db, actor) {
    // Same lock order as account blocking: user first, then its exact session.
    const [users] = await conversationRepository(db).actor( [actor.user.id]);
    if (users[0]?.status !== 'active' || users[0]?.role !== 'student') throw new AppError(403, 'ACCOUNT_BLOCKED', 'Tài khoản không còn quyền hỏi đáp.');
    const [sessions] = await conversationRepository(db).session( [actor.user.id, actor.csrfToken]);
    if (!sessions.length) throw new AppError(401, 'SESSION_EXPIRED', 'Phiên đã bị thu hồi hoặc hết hạn. Kết quả chưa được lưu.');
  }
  async function owned(db, owner, id) {
    const [rows] = await conversationRepository(db).owned( [id, owner]);
    if (!rows.length) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Không tìm thấy hội thoại.');
    return rows[0];
  }
  async function batchCitations(db, messageIds) {
    const grouped = new Map();
    if (!messageIds.length) return grouped;
    const [rows] = await conversationRepository(db).citationRows(messageIds);
    for (const c of rows) {
      const id = String(c.message_id);
      if (!grouped.has(id)) grouped.set(id, []);
      grouped.get(id).push({ chunkId: c.chunk_id, documentId: c.document_id === null ? null : String(c.document_id), fileName: c.file_name,
        pageFrom: c.page_from, pageTo: c.page_to, excerpt: c.excerpt, sourceDeleted: !c.chunk_id || !c.document_id || c.document_status !== 'ready' });
    }
    return grouped;
  }
  async function citations(db, message) {
    return (await batchCitations(db, [message])).get(String(message)) ?? [];
  }
  async function existing(db, conversation, input, hash) {
    const [rows] = await conversationRepository(db).request( [conversation, input.requestId]);
    if (!rows.length) return null;
    const row = rows[0];
    if (row.payload_hash !== hash) throw new AppError(409, 'REQUEST_ID_CONFLICT', 'requestId đã được dùng với câu hỏi hoặc tài liệu khác.');
    if (row.status === 'processing') {
      await conversationRepository(db).interrupt( [row.id]);
      throw new AppError(409, 'REQUEST_INTERRUPTED', 'Yêu cầu bị gián đoạn. Không tự động gọi lại LLM; hãy gửi yêu cầu mới.', { newRequestRequired: true });
    }
    if (row.status === 'failed') throw new AppError(row.error_status || 502, row.error_code || 'QUESTION_FAILED', row.content ? 'Yêu cầu trước đã thất bại. Hãy gửi yêu cầu mới để thử lại.' : 'Không thể trả lời.', { newRequestRequired: true });
    const [answers] = await conversationRepository(db).answer( [conversation, input.requestId]);
    if (!answers.length) throw new AppError(409, 'REQUEST_INTERRUPTED', 'Kết quả chưa được xác nhận.');
    return { answer: answers[0].content, status: answers[0].status, messageId: String(answers[0].id), citations: await citations(db, answers[0].id) };
  }
  return {
    async create(owner, course, input) {
      const [rows] = await conversationRepository(pool).course( [course, owner]);
      if (!rows.length) throw new AppError(404, 'COURSE_NOT_FOUND', 'Không tìm thấy môn học.');
      const [result] = await conversationRepository(pool).insertConversation( [course, owner, input.title || 'Hội thoại mới']);
      return conversationDto(await owned(pool, owner, String(result.insertId)));
    },
    async list(owner, filters) {
      if (filters.courseId && !(await conversationRepository(pool).course([filters.courseId,owner]))[0].length) throw new AppError(404,'COURSE_NOT_FOUND','Không tìm thấy môn học.');
      const result = await history.list(owner,filters);
      return { data:result.rows.map(row => ({ ...conversationDto(row),courseName:row.course_name,messageCount:Number(row.message_count) })),meta:{ page:filters.page,pageSize:filters.pageSize,total:result.total } };
    },
    async get(owner, id, { beforeMessageId,limit=100 } = {}) {
      const db = await pool.getConnection();
      try {
        await conversationRepository(db).snapshot(); await db.beginTransaction();
        const conversation = await owned(db, owner, id);
        const [courses] = await conversationRepository(db).courseName([conversation.course_id,owner]);
        if (beforeMessageId && !(await conversationRepository(db).cursor([beforeMessageId,id]))[0].length) throw new AppError(422,'INVALID_MESSAGE_CURSOR','Mốc tin nhắn không thuộc hội thoại.');
        const [rows] = await conversationRepository(db).transcript(beforeMessageId, [id,...(beforeMessageId ? [beforeMessageId] : []),limit+1]);
        const page = rows.slice(0,limit).reverse();
        // IDs come only from this owned conversation's page, within the same snapshot.
        const sources = await batchCitations(db, page.filter(row => row.role === 'assistant').map(row => row.id));
        const messages = page.map(row => ({ id:String(row.id),requestId:row.request_id,role:row.role,content:row.content,status:row.status,errorCode:row.error_code,createdAt:row.created_at,citations:sources.get(String(row.id)) ?? [] }));
        await db.commit();
        return { conversation:{ ...conversationDto(conversation),courseName:courses[0].name },messages,hasOlderMessages:rows.length>limit,nextBeforeMessageId:rows.length>limit ? String(page[0].id) : null };
      } catch(error) { await db.rollback(); throw error; } finally { db.release(); }
    },
    async remove(owner,id) {
      const db = await pool.getConnection(); const lock = `qa-conversation-${id}`; let locked=false;
      try {
        await owned(db,owner,id);
        const [locks] = await conversationRepository(db).acquireLock([lock]); locked=Number(locks[0].acquired)===1;
        if (!locked) throw new AppError(409,'QUESTION_IN_PROGRESS','Hội thoại đang trả lời câu hỏi. Hãy chờ rồi thử xóa lại.');
        await db.beginTransaction();
        const [rows] = await conversationRepository(db).lockOwned([id,owner]);
        if (!rows.length) throw new AppError(404,'CONVERSATION_NOT_FOUND','Không tìm thấy hội thoại.');
        // Cascades only into messages/citations, never documents/chunks/course/index or usage.
        await conversationRepository(db).deleteConversation([id,owner]); await db.commit();
        return { success:true };
      } catch(error) { await db.rollback(); throw error; }
      finally { try { if(locked) await conversationRepository(db).releaseLock([lock]); } finally { db.release(); } }
    },
    async ask(actor, id, input) {
      const owner = actor.user.id;
      const requestStarted=Date.now();
      const answerMode = input.answerMode || 'auto';
      // Preserve legacy hashes for callers using the existing auto policy.
      const hash = createHash('sha256').update(JSON.stringify({ question: input.question, documentIds: input.documentIds ? [...input.documentIds].sort() : null,
        ...(answerMode !== 'auto' ? { answerMode } : {}) })).digest('hex');
      const db = await pool.getConnection(); const lock = `qa-conversation-${id}`; let locked = false; let reserved = false;
      try {
        let conversation = await owned(db, owner, id);
        const [locks] = await conversationRepository(db).acquireLock( [lock]); locked = Number(locks[0].acquired) === 1;
        if (!locked) throw new AppError(409, 'QUESTION_IN_PROGRESS', 'Hội thoại đang xử lý câu hỏi. Vui lòng chờ rồi thử lại với cùng requestId.');
        conversation = await owned(db, owner, id);
        await db.beginTransaction();
        try { await activeActor(db, actor); await db.commit(); }
        catch (error) { await db.rollback(); throw error; }
        const replay = await existing(db, id, input, hash); if (replay) return replay;
        if (input.documentIds) for (const documentId of input.documentIds) {
          const [docs] = await conversationRepository(db).readyDocument( [documentId, owner, conversation.course_id]);
          if (!docs.length) throw new AppError(422, 'INVALID_DOCUMENT_SCOPE', 'Tài liệu được chọn không thuộc môn học hoặc chưa sẵn sàng.');
        }
        await db.beginTransaction();
        try {
          await activeActor(db, actor);
          const [quota] = await conversationRepository(db).dailyUsage( [owner]);
          const [minute] = await conversationRepository(db).minuteUsage( [owner]);
          if (Number(quota[0].total) >= config.ASK_DAILY_LIMIT || Number(minute[0].total) >= config.ASK_RATE_LIMIT_PER_MINUTE) throw new AppError(429, 'ASK_QUOTA_EXCEEDED', 'Đã đạt giới hạn câu hỏi. Vui lòng thử lại sau.');
          await conversationRepository(db).reserveQuestion( [id, input.requestId, hash, input.question]);
          await conversationRepository(db).chargeUsage([owner]);
          await conversationRepository(db).initialTitle([[...input.question].slice(0,150).join(''),id,id]);
          await db.commit(); reserved = true;
        } catch (error) { await db.rollback(); throw error; }
        const { result, started } = await answerPolicy(db, config, provider)({ owner, conversation, id, input, answerMode });
        await db.beginTransaction();
        try {
          // Revocation during retrieval/provider work must win before any successful result writes.
          await activeActor(db, actor);
          // No provider I/O inside this transaction. Lock current documents before storing citations.
          for (const source of [...result.sources].sort((a,b) => a.documentId.localeCompare(b.documentId) || a.chunkId.localeCompare(b.chunkId))) {
            const [docs] = await conversationRepository(db).lockDocument( [source.documentId, owner, conversation.course_id]);
            const [chunks] = await conversationRepository(db).lockChunk( [source.chunkId, source.documentId]);
            if (!docs.length || !chunks.length) throw new AppError(409, 'SOURCE_CHANGED', 'Nguồn đã thay đổi trong lúc trả lời. Vui lòng gửi lại câu hỏi.');
          }
          const [answer] = await conversationRepository(db).insertAnswer( [id, input.requestId, hash, result.answer, result.status, result.model || null, Date.now() - started, result.answerOrigin]);
          for (const source of result.sources) await conversationRepository(db).insertCitation(
            [answer.insertId, source.chunkId, source.documentId, source.fileName, source.pageFrom, source.pageTo, source.content, source.score]);
          await conversationRepository(db).completeQuestion( [result.status, Date.now()-requestStarted, result.answerOrigin, id, input.requestId]);
          await conversationRepository(db).touchConversation( [id]);
          // Locks serialize concurrent revoke/block; check expiry again after source/citation writes.
          await activeActor(db, actor);
          await db.commit(); reserved = false;
          return { answer: result.answer, status: result.status, messageId: String(answer.insertId), citations: await citations(db, answer.insertId) };
        } catch (error) { await db.rollback(); throw error; }
      } catch (error) {
        if (reserved) await conversationRepository(db).failQuestion( [error.code || 'QUESTION_FAILED', error.status || 503, Date.now()-requestStarted, id, input.requestId]);
        if (reserved && error instanceof AppError) error.details = { ...error.details, newRequestRequired: true };
        throw error;
      } finally { try { if (locked) await conversationRepository(db).releaseLock( [lock]); } finally { db.release(); } }
    },
  };
}
