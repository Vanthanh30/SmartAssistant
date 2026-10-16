import { createHash } from 'node:crypto';
import { AppError } from '../../shared/AppError.js';
import { learningProvider } from './provider.js';
import { learningRepository } from './repository.js';
import { itemEvidencePage } from './evidencePage.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const missing = () => new AppError(404,'LEARNING_NOT_FOUND','Không tìm thấy bộ học hoặc lần làm bài.');
const setDto = row => ({ id: String(row.id), courseId: String(row.course_id), kind: row.kind, title: row.title,
  model: row.model, sourceCount: row.source_count, itemCount: Number(row.item_count), createdAt: row.created_at });
async function transaction(pool, work) {
  const db = await pool.getConnection();
  try { await db.beginTransaction(); const result = await work(db); await db.commit(); return result; }
  catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}
async function active(db, actor) {
  const [rows] = await learningRepository(db).actor([actor.user.id]);
  if (rows[0]?.status !== 'active' || rows[0]?.role !== 'student') throw new AppError(403,'ACCOUNT_BLOCKED','Tài khoản không còn được phép sử dụng.');
  const [sessions] = await learningRepository(db).session([actor.user.id,actor.csrfToken]);
  if (!sessions.length) throw new AppError(401,'SESSION_EXPIRED','Phiên đã hết hạn. Vui lòng đăng nhập lại.');
}
async function ownCourse(db, owner, courseId) {
  const [rows] = await learningRepository(db).course([courseId,owner]);
  if (!rows.length) throw missing();
}
async function ownSet(db, owner, id, lock = false) {
  const [rows] = await learningRepository(db).set([id,owner],lock);
  if (!rows.length) throw missing();
  return rows[0];
}
async function verify(db, owner, courseId, sources, lock = false) {
  for (const source of [...sources].sort((a,b) => a.documentId.localeCompare(b.documentId) || a.chunkId.localeCompare(b.chunkId))) {
    const [rows] = await learningRepository(db).verifySource([source.chunkId,source.documentId,owner,courseId],lock);
    if (!rows.length) throw new AppError(409,'SOURCE_CHANGED','Nguồn không còn sẵn sàng. Hãy chọn lại tài liệu.');
  }
}
export function learningService(pool, config) {
  const generate = learningProvider();
  async function detail(owner, id, reveal = false, db = pool) {
    if (db === pool) return transaction(pool,connection => detail(owner,id,reveal,connection));
    const set = await ownSet(db,owner,id);
    const [items] = await learningRepository(db).items([id]);
    const [citations] = await learningRepository(db).citations([id]);
    const ids = set.kind === 'quiz' && !reveal ? [] : [...new Set(citations.filter(c => c.chunk_id && c.document_id && c.document_status === 'ready' && !c.deleted_at).map(c => c.chunk_id))];
    const [chunks] = ids.length ? await learningRepository(db).citationChunks(ids,owner,set.course_id) : [[]];
    const chunkMap = new Map(chunks.map(chunk => [String(chunk.chunkId),chunk]));
    const pagesFor = (citation,item) => {
      const source = chunkMap.get(String(citation.chunk_id));
      return source && String(source.documentId) === String(citation.document_id)
        ? itemEvidencePage(source,item,set.kind) : null;
    };
    return { ...setDto(set), items: items.map(item => ({ id: String(item.id), position: item.position, prompt: item.prompt,
      ...(set.kind === 'quiz' ? { choices: typeof item.choices === 'string' ? JSON.parse(item.choices) : item.choices } : { answer: item.answer }),
      ...(reveal && set.kind === 'quiz' ? { correctIndex: item.correct_index, explanation: item.explanation } : {}),
      // A quiz's evidence/explanation is disclosed only after server grading.
      citations: set.kind === 'quiz' && !reveal ? [] : citations.filter(c => String(c.item_id) === String(item.id)).map(c => ({
        chunkId: c.chunk_id, documentId: c.document_id ? String(c.document_id) : null, fileName: c.file_name,
        pageFrom: c.page_from, pageTo: c.page_to, excerpt: c.excerpt,
        ...pagesFor(c,item),
        sourceDeleted: !c.chunk_id || !c.document_id || c.document_status !== 'ready' || !!c.deleted_at,
      })),
    })) };
  }
  async function attemptDetail(owner, id, db = pool) {
    if (db === pool) return transaction(pool,connection => attemptDetail(owner,id,connection));
    const [rows] = await learningRepository(db).attempt([id,owner]);
    if (!rows.length) throw missing();
    const row = rows[0];
    const [answers] = await learningRepository(db).answers([id]);
    return { id: String(row.id), setId: String(row.set_id), startedAt: row.started_at, completedAt: row.completed_at,
      score: row.score === null ? null : Number(row.score), correctCount: row.correct_count, totalQuestions: row.total_questions,
      answers: answers.map(a => ({ itemId: String(a.item_id), choice: a.choice, correct: !!a.is_correct })),
      set: await detail(owner,row.set_id,!!row.completed_at,db) };
  }
  return {
    detail, attemptDetail,
    async list(owner, courseId, filters) {
      return transaction(pool,async db => {
        await ownCourse(db,owner,courseId);
        const [count] = await learningRepository(db).countSets([courseId,owner]);
        const [rows] = await learningRepository(db).listSets([courseId,owner,filters.pageSize,(filters.page-1)*filters.pageSize]);
        return { data: rows.map(setDto), meta: { ...filters, total: Number(count[0].total) } };
      });
    },
    async create(actor, courseId, input) {
      const owner = actor.user.id;
      const payloadHash = hash({ ...input, courseId, documentIds: [...input.documentIds].sort() });
      // Reserve in a short transaction. The journal survives deleting a set and process crashes.
      const reserved = await transaction(pool,async db => {
        await active(db,actor); await ownCourse(db,owner,courseId);
        const [existing] = await learningRepository(db).generation([owner,input.requestId]);
        if (existing.length) {
          const row = existing[0];
          if (row.payload_hash !== payloadHash) throw new AppError(409,'REQUEST_CONFLICT','RequestId đã dùng với dữ liệu khác.');
          if (row.state === 'completed') { if (!row.set_id) throw missing(); return { setId: String(row.set_id) }; }
          if (row.state === 'failed') throw new AppError(row.error_status || 502,row.error_code || 'GENERATION_FAILED','Lần tạo này đã thất bại. Chọn tạo lượt mới để thử lại.');
          throw new AppError(409,'GENERATION_PROCESSING','Lần tạo đang xử lý hoặc đã bị gián đoạn. Không tự tạo lại; kiểm tra danh sách hoặc chủ động tạo lượt mới.');
        }
        const [documents] = await learningRepository(db).readyDocuments([...input.documentIds,owner,courseId]);
        if (documents.length !== input.documentIds.length) throw new AppError(422,'INVALID_DOCUMENTS','Chỉ chọn tài liệu sẵn sàng trong môn học của bạn.');
        const [counts] = await learningRepository(db).chunkCounts(input.documentIds);
        if (counts.length !== input.documentIds.length) throw new AppError(422,'INSUFFICIENT_SOURCE','Một tài liệu chưa có trích đoạn.');
        const [usage] = await learningRepository(db).dailyUsage([owner]);
        if (Number(usage[0].total) >= config.LEARNING_DAILY_LIMIT) throw new AppError(429,'LEARNING_DAILY_LIMIT','Đã hết hạn mức tạo bộ học hôm nay (UTC).');
        const [recent] = await learningRepository(db).recentUsage([owner]);
        if (Number(recent[0].total) >= 3) throw new AppError(429,'LEARNING_RATE_LIMIT','Tối đa 3 lượt tạo mỗi phút.');
        const [result] = await learningRepository(db).reserveGeneration([owner,courseId,input.requestId,payloadHash]);
        return { requestId: String(result.insertId) };
      });
      if (reserved.setId) return detail(owner,reserved.setId);
      let savedId;
      try {
        // Seeded samples across document page/order strata, with a bounded text payload.
        const sources = [];
        const perDocument = [];
        for (const documentId of input.documentIds) {
          const [rows] = await learningRepository(pool).sampleChunks([documentId,owner,courseId,input.requestId]);
          perDocument.push(rows.map(r => ({ ...r, documentId: String(r.documentId) })));
        }
        for (let i=0;i<32;i++) for (const rows of perDocument) if (rows[i]) sources.push(rows[i]);
        if (!sources.length) throw new AppError(422,'INSUFFICIENT_SOURCE','Không còn trích đoạn khả dụng.');
        const generated = await generate(input,sources,selected => verify(pool,owner,courseId,selected));
        savedId = await transaction(pool,async db => {
          await active(db,actor); await verify(db,owner,courseId,generated.sources,true);
          const [created] = await learningRepository(db).insertSet([courseId,owner,input.kind,input.title || (input.kind === 'quiz' ? 'Quiz ôn tập từ tài liệu' : 'Flashcard ôn tập từ tài liệu'),generated.model,generated.sources.length]);
          const id = String(created.insertId);
          for (const [position,item] of generated.items.entries()) {
            const [entry] = await learningRepository(db).insertItem([id,position+1,item.prompt,input.kind === 'quiz' ? item.choices[item.correctIndex] : item.answer,input.kind === 'quiz' ? JSON.stringify(item.choices) : null,item.correctIndex ?? null,item.explanation ?? null]);
            for (const chunkId of item.citedChunkIds) {
              const source = generated.sources.find(s => s.chunkId === chunkId);
              const page = itemEvidencePage(source,item,input.kind) || source;
              await learningRepository(db).insertCitation([String(entry.insertId),source.chunkId,source.documentId,source.fileName,page.pageFrom,page.pageTo,source.content]);
            }
          }
          await learningRepository(db).completeGeneration([id,reserved.requestId]);
          return id;
        });
      } catch (error) {
        await learningRepository(pool).failGeneration([error.code || 'GENERATION_FAILED',error.status || 500,reserved.requestId])
          .catch(() => console.error(JSON.stringify({ code: 'LEARNING_JOURNAL_UPDATE_FAILED', requestId: input.requestId })));
        throw error;
      }
      return detail(owner,savedId);
    },
    async remove(actor, id) {
      await transaction(pool,async db => { await active(db,actor); await ownSet(db,actor.user.id,id,true); await learningRepository(db).deleteSet([id]); });
      return { deleted: true };
    },
    async start(actor, id, input) {
      const attemptId = await transaction(pool,async db => {
        await active(db,actor);
        const set = await ownSet(db,actor.user.id,id,true);
        if (set.kind !== 'quiz') throw new AppError(422,'NOT_A_QUIZ','Bộ này là flashcard.');
        const [existing] = await learningRepository(db).attemptRequest([actor.user.id,input.requestId]);
        if (existing.length) { if (String(existing[0].set_id) !== String(id)) throw new AppError(409,'REQUEST_CONFLICT','RequestId đã dùng cho bộ khác.'); return String(existing[0].id); }
        const [result] = await learningRepository(db).insertAttempt([id,actor.user.id,input.requestId,set.item_count]);
        return String(result.insertId);
      });
      return attemptDetail(actor.user.id,attemptId);
    },
    async attempts(owner, id) {
      await ownSet(pool,owner,id);
      const [rows] = await learningRepository(pool).listAttempts([id,owner]);
      return rows.map(row => ({ id: String(row.id), score: row.score === null ? null : Number(row.score), correctCount: row.correct_count, totalQuestions: row.total_questions, startedAt: row.started_at, completedAt: row.completed_at }));
    },
    async submit(actor, id, input) {
      const canonical = [...input.answers].sort((a,b) => a.itemId.localeCompare(b.itemId));
      const submissionHash = hash(canonical);
      await transaction(pool,async db => {
        await active(db,actor);
        // Set before attempt matches deletion's cascade lock order.
        const [lookup] = await learningRepository(db).lookupAttempt([id,actor.user.id]);
        if (!lookup.length) throw missing();
        await ownSet(db,actor.user.id,lookup[0].set_id,true);
        const [rows] = await learningRepository(db).lockAttempt([id,actor.user.id]);
        if (!rows.length) throw missing();
        const attempt = rows[0];
        if (attempt.completed_at) { if (attempt.submission_hash !== submissionHash) throw new AppError(409,'ATTEMPT_COMPLETED','Bài đã nộp, không thể đổi đáp án.'); return; }
        const [items] = await learningRepository(db).gradeItems([attempt.set_id]);
        const map = new Map(canonical.map(a => [a.itemId,a.choice]));
        if (map.size !== canonical.length || map.size !== items.length || items.some(item => !map.has(String(item.id)))) throw new AppError(422,'INVALID_ANSWERS',"Gửi đúng mỗi câu một lần; câu bỏ qua có lua_chon=null.");
        let correct = 0;
        for (const item of items) {
          const choice = map.get(String(item.id)); const isCorrect = choice === item.correct_index;
          if (isCorrect) correct++;
          await learningRepository(db).insertAnswer([id,String(item.id),choice,isCorrect]);
        }
        await learningRepository(db).completeAttempt([(100*correct/items.length).toFixed(2),correct,submissionHash,id]);
      });
      return attemptDetail(actor.user.id,id);
    },
  };
}
