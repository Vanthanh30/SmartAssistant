import { sessionChatScope } from './sessionChatScope.js';
import { matchesScopedSource, snapshotUnavailable } from './sourceIntegrity.js';
import { dto, text } from './mapper.js';
import { conversationRepository } from './repository.js';
import { createHash } from 'node:crypto';
import { log } from '../../config/logger.js';
import { AppError } from '../../shared/AppError.js';
import { studyAssistantRepository, atomic, json } from '../shared/repository.js';
import { toDb, fromDb } from '../shared/values.js';
import { assertActiveActor } from '../auth/service.js';
import { retrieveDocumentSources } from '../../rag/documentRetrieval.js';
import { groundedAi } from './aiService.js';
import { compoundAnswer } from './compoundAnswer.js';
import { persistFormulaImages } from '../documents/formulaService.js';
import { sourceFor, presentationBlocks } from './presentation.js';
import {
  resolveFollowup,
  clarificationAnswer,
  isDocumentSummary,
  regenerateSummary,
  normalizeUserQuestion,
  understandFromSources,
} from './questionUnderstanding.js';
import { isStudyGuidance } from './studyGuidance.js';
import { documentSummaries } from '../documents/summaryService.js';
import { resilientSummary } from '../documents/summaryResilience.js';
import { placeSourceMedia, placeFormulaReference } from './sourceMedia.js';
import { formulaVisualAnswer } from './formulaVisualAnswer.js';

export function conversationService(
  pool,
  config,
  {
    retrieve = retrieveDocumentSources(pool, config),
    ai = groundedAi(config),
    images = persistFormulaImages,
    readFormula = formulaVisualAnswer(config),
  } = {},
) {
  const repo = studyAssistantRepository(pool);
  const summarize = documentSummaries(config, {
    generate: resilientSummary(config, (sources, signal, budget, model) =>
      (model === config.LLM_MODEL ? ai : groundedAi({ ...config, LLM_MODEL: model })).answer(
        'tóm tắt tài liệu',
        sources,
        [],
        { signal, budget },
      ),
    ),
  });
  function citationDtos(rows) {
    return rows.map((n) => ({
      ...json(n.thong_tin_nguon),
      chunkId: String(n.ma_doan_tai_lieu),
      documentId: String(n.ma_tai_lieu),
      excerpt: n.noi_dung_ngu_canh,
      sourceDeleted: snapshotUnavailable(n),
    }));
  }
  async function citations(db, id) {
    const [rows] = await conversationRepository.citations(db, [id]);
    return citationDtos(rows);
  }
  async function result(db, row, loadedCitations) {
    const payload = json(row.noi_dung_tra_loi) || {},
      blocks = (payload.blocks || []).map((b) =>
        b.cloudImage
          ? {
              ...b,
              imagePath: `/conversations/${row.ma_hoi_thoai}/formulas/${row.ma_luot_hoi_dap}/${b.id}`,
            }
          : b,
      );
    return {
      answer: text(blocks),
      blocks,
      status: fromDb(row.trang_thai),
      verification: row.ket_qua_kiem_chung,
      model: row.mo_hinh_llm,
      messageId: String(row.ma_luot_hoi_dap),
      citations: loadedCitations ?? (await citations(db, String(row.ma_luot_hoi_dap))),
    };
  }
  async function validSources(db, owner, course, sources) {
    if (!sources.length) return;
    const [rows] = await conversationRepository.currentSources(
      db,
      [...sources.map((s) => s.chunkId), owner, course],
      sources,
    );
    const current = new Map(rows.map((row) => [String(row.ma_doan_tai_lieu), row]));
    if (
      sources.some((s) => {
        const row = current.get(s.chunkId);
        const position = row ? json(row.current_position) : null;
        return (
          !row ||
          String(row.ma_tai_lieu) !== s.documentId ||
          (s.scopeSnapshot
            ? !matchesScopedSource(row.noi_dung, position, s)
            : row.noi_dung !== s.content) ||
          (s.documentSha256 && s.documentSha256 !== row.current_document_hash) ||
          (!s.scopeSnapshot &&
            s.pageMap &&
            (JSON.stringify(s.pageMap) !== JSON.stringify(position?.pageMap) ||
              s.sourceStart !== position?.sourceStart))
        );
      })
    )
      throw new AppError(409, 'SOURCE_CHANGED', 'Nguồn đã thay đổi.');
  }
  return {
    async create(owner, course, input) {
      await repo.course(owner, course);
      const [r] = await conversationRepository.insertConversation(pool, [
        course,
        input.title || 'Hội thoại mới',
      ]);
      return dto(await repo.conversation(owner, String(r.insertId)));
    },
    async list(owner, f) {
      if (f.courseId) await repo.course(owner, f.courseId);
      const { rows, count } = await conversationRepository.history(pool, owner, f);
      return {
        data: rows.map((h) => ({ ...dto(h), messageCount: Number(h.n) })),
        meta: { page: f.page, pageSize: f.pageSize, total: Number(count.n) },
      };
    },
    async get(owner, id, { beforeMessageId, limit = 100 } = {}) {
      const h = await repo.conversation(owner, id);
      if (beforeMessageId) {
        const [cursor] = await conversationRepository.findCursor(pool, [id, beforeMessageId]);
        if (!cursor.length) throw new AppError(422, 'INVALID_CURSOR', 'Mốc không thuộc hội thoại.');
      }
      const size = Math.max(1, Math.floor(limit / 2));
      const [rows] = await conversationRepository.transcript(
        pool,
        [id, ...(beforeMessageId ? [beforeMessageId] : []), size + 1],
        beforeMessageId,
      );
      const messages = [];
      const selected = rows.slice(0, size).reverse();
      const byTurn = new Map();
      if (selected.length) {
        const [sources] = await conversationRepository.citationsForTurns(
          pool,
          selected.map((row) => String(row.ma_luot_hoi_dap)),
        );
        for (const source of sources) {
          const key = String(source.ma_luot_hoi_dap);
          if (!byTurn.has(key)) byTurn.set(key, []);
          byTurn.get(key).push(source);
        }
      }
      for (const row of selected) {
        const a = await result(
            pool,
            row,
            citationDtos(byTurn.get(String(row.ma_luot_hoi_dap)) || []),
          ),
          p = json(row.noi_dung_tra_loi);
        messages.push(
          {
            id: row.ma_luot_hoi_dap + ':user',
            requestId: p?.metadata?.requestId,
            role: 'user',
            content: row.cau_hoi,
            status: a.status,
            createdAt: row.thoi_diem_hoi,
            citations: [],
          },
          {
            id: String(row.ma_luot_hoi_dap),
            requestId: p?.metadata?.requestId,
            role: 'assistant',
            content: a.answer,
            blocks: a.blocks,
            status: a.status,
            model: a.model,
            verification: a.verification,
            createdAt: row.thoi_diem_tra_loi,
            citations: a.citations,
          },
        );
      }
      return {
        conversation: dto(h),
        messages,
        hasOlderMessages: rows.length > size,
        nextBeforeMessageId: rows.length > size ? String(rows[size - 1].ma_luot_hoi_dap) : null,
      };
    },
    async ask(actor, id, input) {
      const started = performance.now(),
        db = await pool.getConnection(),
        lock = 'erd16-chat-' + id;
      let locked = false,
        turn,
        stage = 'prepare';
      try {
        const h = await studyAssistantRepository(db).conversation(actor.user.id, id);
        locked =
          Number((await conversationRepository.acquireConversationLock(db, [lock]))[0][0].n) === 1;
        if (!locked) throw new AppError(409, 'QUESTION_IN_PROGRESS', 'Hội thoại đang trả lời.');
        const lessonResources = await sessionChatScope(
          studyAssistantRepository(db),
          actor.user.id,
          String(h.ma_mon_hoc),
          input.sessionId,
          input.documentIds,
          id,
        );
        const lessonScopeHash = lessonResources
          ? createHash('sha256').update(JSON.stringify(lessonResources)).digest('hex')
          : null;
        const hash = createHash('sha256')
          .update(
            JSON.stringify({
              question: input.question,
              documents: [...(input.documentIds || [])].sort(),
              mode: input.answerMode || 'auto',
              ...(input.sessionId ? { sessionId: input.sessionId } : {}),
            }),
          )
          .digest('hex');
        const [prior] = await conversationRepository.findRequest(db, [id, input.requestId]);
        if (prior.length) {
          if (json(prior[0].noi_dung_tra_loi)?.metadata?.payloadHash !== hash)
            throw new AppError(409, 'REQUEST_CONFLICT', 'Mã yêu cầu đã dùng cho nội dung khác.');
          return result(db, prior[0]);
        }
        const [ready] = await conversationRepository.readyDocuments(db, [
          actor.user.id,
          h.ma_mon_hoc,
        ]);
        const documents =
          input.documentIds ||
          (lessonResources
            ? [...new Set(lessonResources.map((r) => r.documentId))]
            : ready.map((d) => String(d.ma_tai_lieu)));
        for (const document of documents) {
          const d = await studyAssistantRepository(db).document(actor.user.id, document, true);
          if (String(d.ma_mon_hoc) !== String(h.ma_mon_hoc))
            throw new AppError(422, 'INVALID_DOCUMENTS', 'Tài liệu không thuộc môn.');
        }
        const payload = {
          schemaVersion: 16,
          blocks: [],
          metadata: {
            requestId: input.requestId,
            payloadHash: hash,
            origin: 'chưa xác định',
            ...(input.sessionId ? { sessionId: input.sessionId, lessonScopeHash } : {}),
          },
        };
        await db.beginTransaction();
        await assertActiveActor(db, config, actor, 'student');
        const [created] = await conversationRepository.insertTurn(db, [
          id,
          input.question,
          JSON.stringify(payload),
        ]);
        turn = String(created.insertId);
        for (const document of documents)
          await conversationRepository.insertScope(db, [turn, document]);
        await db.commit();
        const [historyRows] = await conversationRepository.recentAnswers(db, [id, turn]);
        const history = historyRows
          .filter(
            (r) =>
              !input.sessionId ||
              (json(r.noi_dung_tra_loi)?.metadata?.sessionId === input.sessionId &&
                json(r.noi_dung_tra_loi)?.metadata?.lessonScopeHash === lessonScopeHash),
          )
          .reverse()
          .flatMap((r) => [
            { role: 'user', content: r.cau_hoi },
            {
              role: 'assistant',
              content: text(json(r.noi_dung_tra_loi)?.blocks || []).slice(0, 1500),
            },
          ]);
        stage = 'rewrite';
        let stageStarted = performance.now();
        const advanceStage = (next) => {
          log('qa', 'pipeline-stage-finished', {
            stage,
            elapsedMs: Math.round(performance.now() - stageStarted),
          });
          stage = next;
          stageStarted = performance.now();
        };
        const followup = resolveFollowup(normalizeUserQuestion(input.question), history);
        let query = followup.needsClarification
          ? input.question
          : documents.length && followup.query === normalizeUserQuestion(input.question)
            ? await ai.rewrite(followup.query, history)
            : followup.query;
        advanceStage(isDocumentSummary(query) ? 'summary' : 'retrieval');
        const summary =
          !input.sessionId && isDocumentSummary(query)
            ? await summarize(db, actor, String(h.ma_mon_hoc), documents, regenerateSummary(query))
            : null;
        let sources = summary
          ? summary.sources
          : (followup.needsClarification
              ? []
              : await retrieve(
                  actor.user.id,
                  String(h.ma_mon_hoc),
                  query,
                  20,
                  documents,
                  lessonResources,
                )
            ).filter(
              (s) =>
                Number.isFinite(s.score) &&
                documents.includes(s.documentId) &&
                (s.retrievalMethod === 'hybrid' ||
                  s.retrievalMethod === 'context' ||
                  s.score >= config.RAG_SCORE_THRESHOLD),
            );
        let clarification, interpretation;
        if (!summary && !isStudyGuidance(query) && !followup.needsClarification && sources.length) {
          const understood = understandFromSources(query, sources);
          if (understood.clarification) clarification = understood.clarification;
          else if (understood.changes.length && understood.query !== query) {
            const resolved = resolveFollowup(understood.query, history);
            if (resolved.needsClarification)
              clarification = `Bạn muốn hỏi “${understood.query}” của khái niệm hoặc đối tượng nào trong tài liệu?`;
            else {
              interpretation = { ...understood, query: resolved.query };
              query = resolved.query;
              // One corrected retrieval, inside the same authorized document scope.
              sources = (
                await retrieve(
                  actor.user.id,
                  String(h.ma_mon_hoc),
                  query,
                  20,
                  documents,
                  lessonResources,
                )
              ).filter(
                (s) =>
                  Number.isFinite(s.score) &&
                  documents.includes(s.documentId) &&
                  (s.retrievalMethod === 'hybrid' ||
                    s.retrievalMethod === 'context' ||
                    s.score >= config.RAG_SCORE_THRESHOLD),
              );
              payload.metadata.interpretation = { query, changes: understood.changes };
            }
          }
        }
        advanceStage('answer');
        const formulaOriginal =
          !summary &&
          !clarification &&
          !followup.needsClarification &&
          /công thức|biểu thức|số mol/i.test(query)
            ? compoundAnswer(sources, query)
            : null;
        const sourceFormulas =
          formulaOriginal?.blocks.filter((b) => b.type === 'formula_image' && b.source) || [];
        const preferVisual =
          formulaOriginal?.status === 'answered' &&
          sourceFormulas.length === 1 &&
          !/\s(?:và|đồng thời|cũng như)\s/iu.test(query) &&
          /[=≈∝]\s*[=≈∝]|[\uFFFD\uE000-\uF8FF]/u.test(sourceFormulas[0].source.anchor);
        let answer =
          summary ||
          (followup.needsClarification || clarification
            ? clarificationAnswer(clarification)
            : preferVisual
              ? {
                  answer: '',
                  status: 'insufficient_context',
                  sources: [],
                  model: null,
                  verification: 'không đủ ngữ cảnh',
                }
              : await ai.answer(query, sources, history));
        if (answer.sources.some((s) => !sources.some((p) => p.chunkId === s.chunkId)))
          throw new AppError(502, 'INVALID_CITATION', 'Nguồn trả lời ngoài phạm vi.');
        let blocks = answer.answer
          .split(/\n\s*\n/)
          .filter(Boolean)
          .map((t, i) => ({
            id: createHash('sha256').update(`${turn}:${i}:${t}`).digest('hex').slice(0, 24),
            type: 'paragraph',
            text: t,
          }));
        advanceStage('formula');
        if (
          !clarification &&
          !followup.needsClarification &&
          answer.status === 'insufficient_context' &&
          /công thức|biểu thức|số mol/i.test(query)
        ) {
          const original = formulaOriginal || compoundAnswer(sources, query);
          const candidates = original.blocks
            .filter((b) => b.type === 'formula_image' && b.source)
            .slice(0, 6);
          if (candidates.length) {
            const message = 'Công thức theo tài liệu:';
            blocks = [{ id: `${turn}-source-formula`, type: 'paragraph', text: message }];
            for (const block of candidates) {
              try {
                const [image] = await images(pool, config, actor.user.id, [block]);
                blocks.push(image);
              } catch (error) {
                if (
                  ![
                    'FORMULA_SOURCE_MISSING',
                    'FORMULA_CROP_FAILED',
                    'FORMULA_CROP_TIMEOUT',
                  ].includes(error.code)
                )
                  throw error;
              }
            }
            const cited = new Set(candidates.map((b) => b.source.chunkId));
            answer = {
              ...answer,
              answer: message,
              sources: original.sources.filter((s) => cited.has(s.chunkId)),
              evidence: candidates.map((b) => ({
                chunkId: b.source.chunkId,
                quote: b.source.anchor,
              })),
              verification: 'không đủ ngữ cảnh',
            };
            const imageBlocks = blocks.filter((b) => b.type === 'formula_image' && b.cloudImage);
            let visual;
            try {
              visual = await readFormula(query, imageBlocks, answer.sources);
            } catch (error) {
              log('qa', 'formula-reading-unavailable', {
                code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
              });
            }
            if (visual) {
              const used = imageBlocks.filter((b) => visual.imageIds.includes(b.id));
              const sourceIds = new Set(used.map((b) => b.source.chunkId));
              answer = {
                ...answer,
                answer: visual.answer,
                status: 'answered',
                verification: 'đạt',
                model: visual.model,
                sources: answer.sources.filter((s) => sourceIds.has(s.chunkId)),
                evidence: used.map((b) => ({ chunkId: b.source.chunkId, quote: b.source.anchor })),
              };
              blocks = [
                ...visual.answer
                  .split(/\n\s*\n/)
                  .filter(Boolean)
                  .map((text, index) => ({
                    id: `${turn}-visual-${index}`,
                    type: 'paragraph',
                    text,
                  })),
                ...used,
              ];
            }
          }
        }
        if (answer.status === 'answered') {
          const direct = presentationBlocks(answer.answer, answer.sources).filter(
            (b) => b.type === 'formula_image' && b.source,
          );
          const focused = compoundAnswer(answer.sources, query).blocks.filter(
            (b) => b.type === 'formula_image' && b.source,
          );
          const seen = new Set();
          const candidates = [...direct, ...focused]
            .filter((block) => {
              const key = JSON.stringify([
                block.source.documentId,
                block.source.pageFrom,
                block.source.anchor.replace(/\s/gu, ''),
              ]);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .slice(0, 6);
          const place = (current, media) =>
            placeSourceMedia(current, media) || placeFormulaReference(current, media, candidates);
          for (const block of candidates) {
            if (!place(blocks, block)) continue;
            try {
              const [image] = await images(pool, config, actor.user.id, [block]);
              blocks = place(blocks, image) || blocks;
            } catch (e) {
              if (
                !['FORMULA_SOURCE_MISSING', 'FORMULA_CROP_FAILED', 'FORMULA_CROP_TIMEOUT'].includes(
                  e.code,
                )
              )
                throw e;
              blocks =
                place(blocks, {
                  id: block.id,
                  type: 'paragraph',
                  text: 'Xem công thức đầy đủ tại trang nguồn trích dẫn.',
                  source: block.source,
                }) || blocks;
            }
          }
        }
        if (interpretation)
          blocks.unshift({
            id: `${turn}-interpretation`,
            type: 'paragraph',
            text: `Mình hiểu câu hỏi là: ${query}`,
          });
        payload.blocks = blocks;
        payload.metadata.origin = answer.sources.length ? 'có nguồn' : 'chưa xác định';
        advanceStage('save');
        await db.beginTransaction();
        await assertActiveActor(db, config, actor, 'student');
        if (input.sessionId) {
          const currentScope = await sessionChatScope(
            studyAssistantRepository(db),
            actor.user.id,
            String(h.ma_mon_hoc),
            input.sessionId,
            input.documentIds,
            id,
          );
          if (JSON.stringify(currentScope) !== JSON.stringify(lessonResources))
            throw new AppError(
              409,
              'SESSION_SCOPE_CHANGED',
              'Nội dung buổi học đã thay đổi. Tải lại buổi học để hỏi tiếp.',
            );
        }
        await validSources(db, actor.user.id, h.ma_mon_hoc, sources);
        for (const [rank, s] of sources.entries()) {
          const cited = answer.sources.findIndex((p) => p.chunkId === s.chunkId),
            quotes = (answer.evidence || [])
              .filter((e) => e.chunkId === s.chunkId)
              .map((e) => sourceFor(e.quote, [s]))
              .filter(Boolean);
          const pageFrom = quotes.length ? Math.min(...quotes.map((q) => q.pageFrom)) : s.pageFrom,
            pageTo = quotes.length ? Math.max(...quotes.map((q) => q.pageTo)) : s.pageTo;
          await conversationRepository.insertContext(db, [
            turn,
            s.chunkId,
            Math.max(-1, Math.min(1, s.score)),
            rank + 1,
            cited < 0 ? null : cited + 1,
            s.content,
            JSON.stringify({
              documentId: s.documentId,
              fileName: s.fileName,
              pageFrom,
              pageTo,
              ...(s.retrievalMethod
                ? {
                    retrievalMethod: s.retrievalMethod,
                    similarityMeasured: s.scoreMeasured === true,
                  }
                : {}),
            }),
            JSON.stringify({
              ...(s.scopeSnapshot ? { scopeSnapshot: s.scopeSnapshot } : {}),
              pageMap: s.pageMap,
              sourceStart: s.sourceStart,
              ...(s.documentSha256 ? { documentSha256: s.documentSha256 } : {}),
              quotes,
              formulas: blocks.filter((b) => b.source?.chunkId === s.chunkId).map((b) => b.source),
            }),
          ]);
        }
        await conversationRepository.completeTurn(db, [
          query,
          JSON.stringify(payload),
          answer.model,
          answer.verification,
          toDb(answer.status),
          turn,
        ]);
        await conversationRepository.touchConversation(db, [input.question.slice(0, 255), id]);
        await db.commit();
        log('qa', 'answered', {
          conversationId: id,
          status: answer.status,
          elapsedMs: Math.round(performance.now() - started),
        });
        return result(db, (await conversationRepository.findTurn(db, [turn]))[0][0]);
      } catch (e) {
        log('qa', 'failed', {
          conversationId: id,
          requestId: input.requestId,
          stage,
          code: e.code || 'INTERNAL_ERROR',
          errorType: e.name,
          ...(e.details?.provider === 'gemini'
            ? { providerHttpStatus: e.details.httpStatus, providerStatus: e.details.providerStatus }
            : {}),
          elapsedMs: Math.round(performance.now() - started),
        });
        await db.rollback();
        if (turn) {
          const failure = {
            schemaVersion: 16,
            blocks: [
              {
                id: 'loi',
                type: 'paragraph',
                text:
                  e instanceof AppError
                    ? e.message
                    : 'Không thể hoàn thành yêu cầu. Vui lòng thử lại.',
              },
            ],
            metadata: {
              requestId: input.requestId,
              payloadHash: createHash('sha256')
                .update(
                  JSON.stringify({
                    question: input.question,
                    documents: [...(input.documentIds || [])].sort(),
                    mode: input.answerMode || 'auto',
                    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
                  }),
                )
                .digest('hex'),
              origin: 'chưa xác định',
              failureCode: /^[A-Z][A-Z0-9_]{0,63}$/.test(e.code || '') ? e.code : 'INTERNAL_ERROR',
              failureStage: stage,
            },
          };
          await conversationRepository.failTurn(db, [JSON.stringify(failure), turn]);
        }
        throw e;
      } finally {
        if (locked) await conversationRepository.releaseConversationLock(db, [lock]);
        db.release();
      }
    },
    async remove(owner, id) {
      await atomic(pool, async (db) => {
        await studyAssistantRepository(db).conversation(owner, id);
        for (const table of ['ngu_canh_hoi_dap', 'pham_vi_hoi_dap'])
          await conversationRepository.deleteTurnRelations(db, [id], table);
        await conversationRepository.deleteTurns(db, [id]);
        await conversationRepository.deleteConversation(db, [id]);
      });
      return { success: true };
    },
  };
}
