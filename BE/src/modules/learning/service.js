import { sessionPracticeScope } from './sessionScope.js';
import { setDto } from './mapper.js';
import { learningRepository } from './repository.js';
import { toDb, fromDb } from '../shared/values.js';
import { learningAi } from './aiService.js';
import { createHash } from 'node:crypto';
import { AppError } from '../../shared/AppError.js';
import { studyAssistantRepository, atomic, json, missing } from '../shared/repository.js';
import { assertActiveActor } from '../auth/service.js';
import { learningFingerprint, withLearningLock } from './reuse.js';
import { itemEvidencePage } from './evidencePage.js';
import { mapRetrievedSource } from '../../rag/documentRetrieval.js';
import { withOwnerLock } from '../studyCalendar/locks.js';
const requestId = (owner, request, kind) =>
  BigInt(
    '0x' +
      createHash('sha256').update(`erd16:${kind}:${owner}:${request}`).digest('hex').slice(0, 15),
  ).toString();

export function learningService(pool, config, { generate } = {}) {
  const repo = studyAssistantRepository(pool);
  async function detail(owner, id, revealed = new Set(), db = pool) {
    const r = studyAssistantRepository(db),
      set = await r.set(owner, id),
      items = await r.items(id);
    return {
      ...setDto(
        {
          ...set,
          source_count: new Set(
            items
              .flatMap((i) => (json(i.nguon_tham_khao)?.sources || []).map((s) => s.ma_doan_goc))
              .filter(Boolean),
          ).size,
        },
        items.length,
      ),
      items: await Promise.all(
        items.map(async (i) => {
          const allowed = set.loai_bai === 'thẻ ghi nhớ' || revealed.has(String(i.ma_cau_hoi)),
            sources = json(i.nguon_tham_khao)?.sources || [];
          const citations = allowed
            ? await Promise.all(
                sources.map(async (s) => {
                  let unavailable = true;
                  try {
                    await r.document(owner, String(s.ma_tai_lieu_goc), true);
                    const [chunks] = await learningRepository.findCitationChunk(db, [
                      s.ma_doan_goc,
                      s.ma_tai_lieu_goc,
                    ]);
                    unavailable = !chunks.length;
                  } catch {
                    /* snapshots remain available */
                  }
                  return {
                    chunkId: s.ma_doan_goc,
                    documentId: String(s.ma_tai_lieu_goc),
                    fileName: s.ten_tep,
                    pageFrom: s.tu_trang,
                    pageTo: s.den_trang,
                    excerpt: s.doan_trich,
                    sourceDeleted: unavailable,
                  };
                }),
              )
            : [];
          return {
            id: String(i.ma_cau_hoi),
            position: i.thu_tu,
            prompt: i.noi_dung_cau_hoi,
            ...(set.loai_bai === 'trắc nghiệm'
              ? {
                  choices: json(i.phuong_an).map((v) => v.content),
                  ...(allowed
                    ? {
                        correctIndex: json(i.phuong_an).findIndex((v) => v.symbol === i.dap_an),
                        explanation: i.giai_thich,
                      }
                    : {}),
                }
              : { answer: i.dap_an }),
            citations,
          };
        }),
      ),
    };
  }
  async function attemptDetail(owner, id, db = pool) {
    const r = studyAssistantRepository(db),
      a = await r.attempt(owner, id),
      [answers] = await learningRepository.attemptAnswers(db, [id]);
    const set = await detail(
      owner,
      String(a.ma_bai_on_tap),
      new Set(answers.map((v) => String(v.ma_cau_hoi))),
      db,
    );
    return {
      id: String(a.ma_lan_lam_bai),
      setId: String(a.ma_bai_on_tap),
      startedAt: a.bat_dau_luc,
      completedAt: a.hoan_thanh_luc,
      score: a.diem == null ? null : Number(a.diem),
      correctCount: answers.filter((v) => v.tra_loi_dung === 1).length,
      totalQuestions: set.items.length,
      answers: answers.map((v) => ({
        itemId: String(v.ma_cau_hoi),
        choice: v.tra_loi_nguoi_dung == null ? null : 'ABCD'.indexOf(v.tra_loi_nguoi_dung),
        correct: v.tra_loi_dung == null ? null : !!v.tra_loi_dung,
        memory: fromDb(v.muc_do_ghi_nho),
        locked: true,
      })),
      set,
    };
  }
  async function saveAnswer(db, owner, attemptId, input) {
    const r = studyAssistantRepository(db),
      a = await r.attempt(owner, attemptId, true);
    const [itemRows] = await learningRepository.findItem(db, [input.itemId, a.ma_bai_on_tap]);
    const item = itemRows[0];
    if (!item) throw missing();
    const set = await r.set(owner, String(a.ma_bai_on_tap)),
      isQuiz = set.loai_bai === 'trắc nghiệm';
    const choices = json(item.phuong_an),
      symbol = isQuiz ? (input.choice == null ? null : choices[input.choice]?.symbol) : null;
    if ((isQuiz && !Object.hasOwn(input, 'choice')) || (!isQuiz && Object.hasOwn(input, 'choice')))
      throw new AppError(422, 'INVALID_ANSWER_KIND', 'Dữ liệu trả lời không đúng hình thức bài.');
    if (isQuiz && input.choice != null && !symbol)
      throw new AppError(422, 'INVALID_CHOICE', 'Phương án không thuộc câu hỏi.');
    if (!isQuiz && !['again', 'hard', 'good', 'easy'].includes(input.memory))
      throw new AppError(422, 'INVALID_MEMORY', 'Chọn mức ghi nhớ hợp lệ.');
    const [prior] = await learningRepository.findAnswer(db, [attemptId, input.itemId]);
    if (prior.length) {
      if (
        prior[0].tra_loi_nguoi_dung !== symbol ||
        (!isQuiz && prior[0].muc_do_ghi_nho !== toDb(input.memory))
      )
        throw new AppError(409, 'ANSWER_LOCKED', 'Câu đã xác nhận, không thể thay đổi.');
      return;
    }
    if (a.trang_thai === 'hoàn thành')
      throw new AppError(409, 'ATTEMPT_COMPLETED', 'Lần làm đã hoàn thành.');
    await learningRepository.insertAnswer(db, [
      attemptId,
      input.itemId,
      symbol,
      isQuiz ? symbol === item.dap_an : null,
      isQuiz ? null : toDb(input.memory),
    ]);
  }
  return {
    detail,
    attemptDetail,
    async list(owner, course, filters) {
      await repo.course(owner, course);
      const [[count]] = await learningRepository.countSets(pool, [course]);
      const [rows] = await learningRepository.listSets(pool, [
        course,
        filters.pageSize,
        (filters.page - 1) * filters.pageSize,
      ]);
      return {
        data: rows.map((b) => setDto(b, Number(b.n))),
        meta: { ...filters, total: Number(count.n) },
      };
    },
    async create(actor, course, input) {
      await repo.course(actor.user.id, course);
      const mode = input.generationMode || 'ai';
      if (mode !== 'ai')
        throw new AppError(
          422,
          'INVALID_GENERATION_MODE',
          'Chỉ hỗ trợ tạo bộ học kết hợp từ tài liệu.',
        );
      const id = requestId(actor.user.id, input.requestId, 'set');
      const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const [existing] = await learningRepository.findOwnedSet(pool, [id, actor.user.id]);
      if (existing.length) {
        if (json(existing[0].cau_hinh_tao).requestHash !== hash)
          throw new AppError(409, 'REQUEST_CONFLICT', 'Mã yêu cầu đã dùng với nội dung khác.');
        return detail(actor.user.id, id);
      }
      const title =
        input.title ||
        (input.kind === 'quiz' ? 'Trắc nghiệm ôn tập từ tài liệu' : 'Thẻ ghi nhớ ôn tập');
      let generated;
      async function loadSources(db) {
        const repo = studyAssistantRepository(db);
        const sources = [],
          documents = [];
        const lessonResources = await sessionPracticeScope(repo, actor.user.id, course, input);
        if (!input.documentIds?.length)
          throw new AppError(422, 'DOCUMENT_REQUIRED', 'Chọn tài liệu nguồn.');
        for (const docId of [...input.documentIds].sort()) {
          const doc = await repo.document(actor.user.id, docId, true);
          if (String(doc.ma_mon_hoc) !== String(course)) throw missing();
          documents.push([String(doc.ma_tai_lieu), doc.ma_bam_tap_tin, doc.so_trang]);
          const ranges = lessonResources?.filter((r) => r.documentId === docId);
          const from = ranges?.length
              ? Math.min(...ranges.map((r) => r.pageFrom))
              : input.pageFrom || 1,
            to = ranges?.length
              ? Math.max(...ranges.map((r) => r.pageTo))
              : input.pageTo || doc.so_trang;
          if (from < 1 || to < from || to > doc.so_trang)
            throw new AppError(422, 'INVALID_PAGES', 'Khoảng trang không hợp lệ.');
          const chunks = await repo.chunks(actor.user.id, docId, from, to);
          if (chunks.length > 128)
            throw new AppError(
              422,
              'LEARNING_SCOPE_TOO_LARGE',
              'Tài liệu quá lớn cho một bộ học. Hãy chọn khoảng trang nhỏ hơn.',
            );
          for (const ch of chunks) {
            const matched = ranges?.filter(
              (r) => !r.chunkIds || r.chunkIds.includes(String(ch.ma_doan_tai_lieu)),
            );
            if (ranges && !matched.length) continue;
            const source = mapRetrievedSource({ ...ch, ten_tai_lieu: doc.ten_tai_lieu }),
              position = json(ch.vi_tri_tren_trang),
              pages = position.pageMap.filter(
                (p) =>
                  p.page >= from &&
                  p.page <= to &&
                  (!matched || matched.some((r) => p.page >= r.pageFrom && p.page <= r.pageTo)),
              );
            if (!pages.length) continue;
            const begin = Math.max(position.sourceStart, Math.min(...pages.map((p) => p.start))),
              end = Math.min(
                position.sourceStart + ch.noi_dung.length,
                Math.max(...pages.map((p) => p.end)),
              );
            sources.push({
              ...source,
              content: ch.noi_dung.slice(begin - position.sourceStart, end - position.sourceStart),
              sourceStart: begin,
              pageMap: pages,
              pageFrom: Math.max(from, ch.trang_bat_dau),
              pageTo: Math.min(to, ch.trang_ket_thuc),
            });
          }
        }
        return { sources, documents };
      }
      const snapshot = await loadSources(pool),
        sources = snapshot.sources;
      const fingerprint = learningFingerprint(input, snapshot, config);
      if (!sources.length)
        throw new AppError(422, 'INSUFFICIENT_SOURCE', 'Chưa đủ nội dung nguồn.');
      if (sources.reduce((length, source) => length + source.content.length, 0) > 128000)
        throw new AppError(
          422,
          'LEARNING_SCOPE_TOO_LARGE',
          'Nội dung vượt giới hạn một bộ học. Hãy chọn khoảng trang nhỏ hơn.',
        );
      return withLearningLock(pool, actor.user.id, fingerprint, async () => {
        if (!input.forceNew) {
          const cached = await atomic(pool, async (db) => {
            await assertActiveActor(db, config, actor, 'student');
            const current = await loadSources(db);
            if (learningFingerprint(input, current, config) !== fingerprint)
              throw new AppError(
                409,
                'SOURCE_CHANGED',
                'Tài liệu đã thay đổi, hãy tạo lại bộ học.',
              );
            const [rows] = await learningRepository.findReusable(db, [
              course,
              actor.user.id,
              fingerprint,
            ]);
            return rows[0]?.ma_bai_on_tap;
          });
          if (cached) return detail(actor.user.id, String(cached));
        }
        generated = await (generate || learningAi(config))(input, sources, async (retained) => {
          if (retained.some((s) => !sources.some((p) => p.chunkId === s.chunkId)))
            throw new AppError(502, 'INVALID_CITATION', 'Nguồn không thuộc phần đã chọn.');
        });
        if (generated.items.length !== input.count)
          throw new AppError(422, 'INSUFFICIENT_SOURCE', 'Tài liệu chưa đủ số câu yêu cầu.');
        const settings = {
          schemaVersion: 16,
          pipeline: 'hybrid-learning-v1',
          reuseFingerprint: fingerprint,
          verified: true,
          requestHash: hash,
          requestId: input.requestId,
          documentIds: input.documentIds || [],
          sessionId: input.sessionId,
          topic: input.topic,
          topics: input.topics,
          pageFrom: input.pageFrom,
          pageTo: input.pageTo,
          count: generated.items.length,
        };
        return withOwnerLock(pool, actor.user.id, async (db) => {
          await db.beginTransaction();
          try {
            await assertActiveActor(db, config, actor, 'student');
            await studyAssistantRepository(db).course(actor.user.id, course);
            const current = await loadSources(db);
            if (learningFingerprint(input, current, config) !== fingerprint)
              throw new AppError(
                409,
                'SOURCE_CHANGED',
                'Tài liệu đã thay đổi trong lúc tạo bộ học; kết quả không được lưu.',
              );
            const [dupe] = await learningRepository.findSet(db, [id]);
            if (dupe.length)
              throw new AppError(
                409,
                'REQUEST_IN_PROGRESS',
                'Bộ học đã được tạo đồng thời, tải lại.',
              );
            await learningRepository.insertSet(db, [
              id,
              course,
              title,
              toDb(input.kind),
              toDb(mode),
              generated.model,
              JSON.stringify(settings),
            ]);
            for (const [index, item] of generated.items.entries()) {
              const snapshots = [];
              for (const cited of item.citedChunkIds) {
                const source = sources.find((s) => s.chunkId === cited);
                if (!source) throw new AppError(502, 'INVALID_CITATION', 'Nguồn không hợp lệ.');
                const page = itemEvidencePage(source, item, input.kind) || source;
                snapshots.push({
                  ma_doan_goc: source.chunkId,
                  ma_tai_lieu_goc: source.documentId,
                  ten_tep: source.fileName,
                  tu_trang: page.pageFrom,
                  den_trang: page.pageTo,
                  doan_trich: source.content,
                });
              }
              if (!snapshots.length)
                throw new AppError(502, 'INVALID_CITATION', 'Câu hỏi cần nguồn.');
              const quiz = input.kind === 'quiz';
              if (
                quiz &&
                (!Array.isArray(item.choices) ||
                  item.choices.length !== 4 ||
                  !Number.isInteger(item.correctIndex) ||
                  item.correctIndex < 0 ||
                  item.correctIndex > 3)
              )
                throw new AppError(
                  502,
                  'INVALID_GENERATED_QUIZ',
                  'Bốn phương án hoặc đáp án chưa hợp lệ.',
                );
              await learningRepository.insertItem(db, [
                id,
                index + 1,
                item.prompt,
                quiz
                  ? JSON.stringify(
                      item.choices.map((content, n) => ({ symbol: 'ABCD'[n], content })),
                    )
                  : null,
                quiz ? 'ABCD'[item.correctIndex] : item.answer,
                item.explanation || null,
                JSON.stringify({ schemaVersion: 16, sources: snapshots }),
              ]);
            }
            await db.commit();
            return detail(actor.user.id, id);
          } catch (e) {
            await db.rollback();
            throw e;
          }
        });
      });
    },
    async start(actor, id, input) {
      const attemptId = requestId(actor.user.id, input.requestId, 'attempt');
      await atomic(pool, async (db) => {
        await assertActiveActor(db, config, actor, 'student');
        await studyAssistantRepository(db).set(actor.user.id, id, true);
        const [existing] = await learningRepository.findAttempt(db, [attemptId]);
        if (existing.length) {
          if (
            String(existing[0].ma_bai_on_tap) !== String(id) ||
            String(existing[0].ma_nguoi_dung) !== actor.user.id
          )
            throw new AppError(409, 'REQUEST_CONFLICT', 'Mã yêu cầu đã sử dụng.');
          return;
        }
        await learningRepository.insertAttempt(db, [attemptId, id, actor.user.id]);
      });
      return attemptDetail(actor.user.id, attemptId);
    },
    async confirm(actor, id, input) {
      await atomic(pool, async (db) => {
        await assertActiveActor(db, config, actor, 'student');
        await saveAnswer(db, actor.user.id, id, input);
      });
      return attemptDetail(actor.user.id, id);
    },
    async submit(actor, id, input) {
      await atomic(pool, async (db) => {
        await assertActiveActor(db, config, actor, 'student');
        const r = studyAssistantRepository(db),
          a = await r.attempt(actor.user.id, id, true),
          set = await r.set(actor.user.id, String(a.ma_bai_on_tap)),
          items = await r.items(String(a.ma_bai_on_tap));
        if (set.loai_bai === 'trắc nghiệm') {
          const map = new Map(input.answers.map((v) => [v.itemId, v]));
          if (
            map.size !== input.answers.length ||
            map.size !== items.length ||
            items.some((i) => !map.has(String(i.ma_cau_hoi)))
          )
            throw new AppError(422, 'INVALID_ANSWERS', 'Mỗi câu cần đúng một đáp án hoặc bỏ qua.');
          for (const item of items)
            await saveAnswer(db, actor.user.id, id, map.get(String(item.ma_cau_hoi)));
        }
        const [answers] = await learningRepository.submittedAnswers(db, [id]);
        if (answers.length !== items.length)
          throw new AppError(422, 'INCOMPLETE_ATTEMPT', 'Chưa đánh giá đủ các thẻ.');
        if (a.trang_thai !== 'hoàn thành') {
          const score =
            set.loai_bai === 'trắc nghiệm'
              ? ((100 * answers.filter((v) => v.tra_loi_dung === 1).length) / items.length).toFixed(
                  2,
                )
              : null;
          await learningRepository.completeAttempt(db, [score, id]);
        }
      });
      return attemptDetail(actor.user.id, id);
    },
    async attempts(owner, id) {
      await repo.set(owner, id);
      const [rows] = await learningRepository.listAttempts(pool, [id, owner]);
      return rows.map((a) => ({
        id: String(a.ma_lan_lam_bai),
        score: a.diem == null ? null : Number(a.diem),
        correctCount: Number(a.correct),
        totalQuestions: Number(a.total),
        startedAt: a.bat_dau_luc,
        completedAt: a.hoan_thanh_luc,
      }));
    },
    async remove(actor, id) {
      await atomic(pool, async (db) => {
        await assertActiveActor(db, config, actor, 'student');
        await studyAssistantRepository(db).set(actor.user.id, id, true);
        await learningRepository.deleteAttemptDetails(db, [id, id]);
        await learningRepository.deleteAttempts(db, [id]);
        await learningRepository.deleteItems(db, [id]);
        await learningRepository.deleteSet(db, [id]);
      });
      return { deleted: true };
    },
  };
}
