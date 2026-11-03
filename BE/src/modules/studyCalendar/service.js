import { isFullStudyGoal, coverageReport } from './planCoverage.js';
import { assertDeletableSession, deleteCancelledSession } from './deleteSession.js';
import { moveMetadata } from './moveHistory.js';
import { conversationRepository } from '../conversations/repository.js';
import { dto as conversationDto } from '../conversations/mapper.js';
import { notificationInbox, notificationInboxForDb } from './notifications.js';
import { revision, decorate, dto } from './sessionMapper.js';
import { sessionRepository } from './sessionRepository.js';
import { toDb, translate } from '../shared/values.js';
import { splitStudyPages } from '../shared/studyPages.js';
import { createHash } from 'node:crypto';
import { AppError } from '../../shared/AppError.js';
import { studyAssistantRepository, json } from '../shared/repository.js';
import { assertActiveActor } from '../auth/service.js';
import { withOwnerLock } from './locks.js';
import { suggest } from './scheduler.js';
import { weekBounds, overlap } from './time.js';
import {
  googleAdapter,
  googleConfigured,
  googleFailure,
} from '../../integrations/google/adapter.js';
import { ownedEvent, eventPayload } from './google/eventMapper.js';
import { lessonPlanner } from './lessonPlan.js';
import { mapRetrievedSource } from '../../rag/documentRetrieval.js';
const normalize = (s) => ({
  ...s,
  start: new Date(Math.floor(+new Date(s.start) / 1000) * 1000).toISOString(),
  end: new Date(Math.floor(+new Date(s.end) / 1000) * 1000).toISOString(),
});
const stableId = (owner, uuid) =>
  BigInt(
    '0x' + createHash('sha256').update(`erd16-session:${owner}:${uuid}`).digest('hex').slice(0, 15),
  ).toString();

export function studyCalendarService(
  pool,
  config,
  {
    adapter = googleAdapter(config),
    clock = () => new Date(),
    planLessons = lessonPlanner(config),
  } = {},
) {
  async function range(db, owner, from, to, filters = {}) {
    const [rows] = await sessionRepository.range(
      db,
      [
        owner,
        owner,
        new Date(to),
        new Date(from),
        ...(filters.courseId ? [filters.courseId] : []),
        ...(filters.status ? [toDb(filters.status)] : []),
      ],
      filters,
    );
    if (rows.length > 500) throw new AppError(422, 'RANGE_TOO_DENSE', 'Thu hẹp khoảng lịch.');
    return rows.map(decorate);
  }
  async function planSources(db, owner, goal) {
    const sources = [];
    for (const documentId of [...new Set(goal.documentIds)]) {
      const doc = await studyAssistantRepository(db).document(owner, documentId, true);
      if (String(doc.ma_mon_hoc) !== String(goal.courseId))
        throw new AppError(422, 'INVALID_COURSE', 'Các PDF phải thuộc cùng môn đã chọn.');
      const chunks = await studyAssistantRepository(db).chunks(owner, documentId, 1, doc.so_trang);
      if (!chunks.length)
        throw new AppError(
          422,
          'DOCUMENT_NOT_INDEXED',
          'Tài liệu chưa có nội dung đã xử lý để chia buổi học.',
        );
      if (isFullStudyGoal(goal.goal)) {
        const pages = new Set(
          chunks.flatMap((ch) =>
            Array.from(
              { length: Math.max(0, ch.trang_ket_thuc - ch.trang_bat_dau + 1) },
              (_, i) => ch.trang_bat_dau + i,
            ),
          ),
        );
        const missing = Array.from({ length: doc.so_trang }, (_, i) => i + 1).filter(
          (page) => !pages.has(page),
        );
        if (missing.length)
          throw new AppError(
            422,
            'DOCUMENT_COVERAGE_INCOMPLETE',
            'Tài liệu chưa có đủ nội dung đã xử lý cho tất cả các trang. Cần xử lý lại tài liệu trước khi lên lịch học toàn bộ.',
            { documentId, missingPages: missing },
          );
      }
      sources.push(
        ...chunks.map((ch) => mapRetrievedSource({ ...ch, ten_tai_lieu: doc.ten_tai_lieu })),
      );
    }
    return sources;
  }
  async function scope(db, owner, input) {
    if (!input.documentId)
      throw new AppError(422, 'DOCUMENT_REQUIRED', 'Chọn tài liệu và khoảng trang cần học.');
    const d = await studyAssistantRepository(db).document(owner, input.documentId, true);
    if (input.courseId && String(d.ma_mon_hoc) !== String(input.courseId))
      throw new AppError(422, 'INVALID_COURSE', 'Tài liệu không thuộc môn đã chọn.');
    const from = input.pageFrom,
      to = input.pageTo;
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 1 ||
      to < from ||
      to > d.so_trang
    )
      throw new AppError(422, 'INVALID_PAGES', 'Chọn khoảng trang hợp lệ trong tài liệu.');
    return d;
  }
  async function collision(db, owner, slots, exclude) {
    const from = new Date(Math.min(...slots.map((s) => +new Date(s.start)))),
      to = new Date(Math.max(...slots.map((s) => +new Date(s.end))));
    const existing = (await range(db, owner, from, to))
      .filter((b) => b.trang_thai !== 'cancelled' && String(b.ma_buoi_hoc) !== exclude)
      .map(dto);
    if (
      slots.some(
        (s, i) =>
          existing.some((o) => overlap(s, o)) || slots.slice(0, i).some((o) => overlap(s, o)),
      )
    )
      throw new AppError(409, 'CALENDAR_CONFLICT', 'Buổi học bị trùng giờ.');
  }
  async function checkLesson(db, owner, s) {
    if (!s.lesson) return;
    if (
      !s.lesson.resources.some(
        (r) => r.documentId === s.documentId && r.pageFrom === s.pageFrom && r.pageTo === s.pageTo,
      )
    )
      throw new AppError(422, 'LESSON_SCOPE', 'Nguồn chính phải thuộc nội dung buổi học.');
    if (
      s.lesson.activities.reduce((n, a) => n + a.minutes, 0) !==
      Math.round((new Date(s.end) - new Date(s.start)) / 60000)
    )
      throw new AppError(
        422,
        'LESSON_DURATION',
        'Tổng thời lượng hoạt động phải bằng thời lượng buổi học.',
      );
    for (const resource of s.lesson.resources) {
      await scope(db, owner, { ...resource, courseId: s.courseId });
      const chunks = await studyAssistantRepository(db).chunks(
        owner,
        resource.documentId,
        resource.pageFrom,
        resource.pageTo,
      );
      if (resource.chunkIds.some((id) => !chunks.some((ch) => String(ch.ma_doan_tai_lieu) === id)))
        throw new AppError(422, 'INVALID_CITATION', 'Đoạn nguồn buổi học không còn hợp lệ.');
    }
  }
  async function mutate(actor, work) {
    return withOwnerLock(pool, actor.user.id, (db) =>
      atomicConnection(db, async () => {
        await assertActiveActor(db, config, actor, 'student');
        await notificationInboxForDb(db, actor.user.id, clock());
        const result = await work(db);
        await notificationInboxForDb(db, actor.user.id, clock());
        return result;
      }),
    );
  }
  async function atomicConnection(db, work) {
    await db.beginTransaction();
    try {
      const r = await work();
      await db.commit();
      return r;
    } catch (e) {
      await db.rollback();
      throw e;
    }
  }
  function checkVersion(row, version) {
    if (revision(row) !== version)
      throw new AppError(409, 'STALE_VERSION', 'Lịch đã thay đổi, tải lại trước khi chỉnh.');
  }
  async function get(owner, id, db = pool) {
    const b = await studyAssistantRepository(db).session(owner, id);
    const [p] = await sessionRepository.planConditions(db, [b.ma_ke_hoach]);
    return decorate({ ...b, dieu_kien_hoc: p[0].dieu_kien_hoc });
  }
  async function createPlan(db, owner, course, slots, constraints = {}, existingId) {
    const first = slots[0],
      localDate = (s) => new Date(+new Date(s) + 7 * 3600000).toISOString().slice(0, 10);
    const conditions = {
      schemaVersion: 16,
      constraints: translate(constraints),
      timezone: 'Asia/Ho_Chi_Minh',
      requestIds: Object.fromEntries(
        slots.map((s) => [existingId || stableId(owner, s.requestId), s.requestId]),
      ),
      sessions: Object.fromEntries(
        slots.map((s) => [
          existingId || stableId(owner, s.requestId),
          { pageFrom: s.pageFrom, pageTo: s.pageTo, ...(s.lesson ? { lesson: s.lesson } : {}) },
        ]),
      ),
    };
    const starts = slots.map((s) => s.start).sort(),
      ends = slots.map((s) => s.end).sort();
    const [r] = await sessionRepository.insertPlan(db, [
      owner,
      course,
      first.title,
      first.goal,
      localDate(starts[0]),
      localDate(ends.at(-1)),
      slots.length,
      JSON.stringify(conditions),
    ]);
    return String(r.insertId);
  }
  async function sync(actor, id, intent = 'sync', expectedVersion) {
    if (!googleConfigured(config))
      throw new AppError(503, 'GOOGLE_NOT_CONFIGURED', 'Google Calendar chưa được cấu hình.');
    return withOwnerLock(pool, actor.user.id, async (db) => {
      await assertActiveActor(db, config, actor, 'student');
      const b = await get(actor.user.id, id, db),
        connection = await studyAssistantRepository(db).connection(actor.user.id);
      if (expectedVersion !== undefined) checkVersion(b, expectedVersion);
      if (connection?.connectionStatus !== 'connected')
        throw new AppError(409, 'GOOGLE_RECONNECT_REQUIRED', 'Cần kết nối Google Calendar.');
      const deleting = intent === 'delete' || b.trang_thai === 'cancelled',
        session = { ...dto(b), sessionStatus: b.trang_thai };
      let eventId = b.dinh_danh_su_kien_google;
      // Deterministic provider ID makes an insert retry safe after a lost response.
      if (!eventId && !deleting) {
        eventId = createHash('sha256')
          .update(config.STUDY_CALENDAR_INSTANCE_ID + ':erd16:' + actor.user.id + ':' + id)
          .digest('hex')
          .slice(0, 40);
        await sessionRepository.setGoogleEvent(db, [eventId, id]);
      }
      const signal = AbortSignal.timeout(20000);
      let event;
      try {
        if (eventId)
          try {
            event = await adapter.get(actor.user.id, connection, eventId, signal);
          } catch (e) {
            if (![404, 410].includes(googleFailure(e).status)) throw e;
          }
        if (event && !ownedEvent(event, session, config))
          throw new AppError(409, 'GOOGLE_EVENT_OWNERSHIP', 'Sự kiện không thuộc ứng dụng.');
        if (deleting) {
          if (event) await adapter.delete(actor.user.id, connection, eventId, signal);
          await sessionRepository.clearGoogleEvent(db, [id]);
          return {
            ...dto(await get(actor.user.id, id, db)),
            syncStatus: 'local',
            googleConfirmed: true,
          };
        }
        const payload = eventPayload(session, config);
        let written;
        if (event)
          written = await adapter.patch(actor.user.id, connection, eventId, payload, signal);
        else
          try {
            written = await adapter.insert(actor.user.id, connection, eventId, payload, signal);
          } catch (e) {
            if (googleFailure(e).status !== 409) throw e;
            const found = await adapter.get(actor.user.id, connection, eventId, signal);
            if (!ownedEvent(found, session, config))
              throw new AppError(409, 'GOOGLE_EVENT_OWNERSHIP', 'Không thể xác minh sự kiện.');
            written = await adapter.patch(actor.user.id, connection, eventId, payload, signal);
          }
        if (
          written?.id !== eventId ||
          !ownedEvent(written, session, config) ||
          written.extendedProperties?.private?.studyRevision !== String(session.version)
        )
          throw new AppError(502, 'GOOGLE_RESPONSE_MISMATCH', 'Google chưa xác nhận đúng sự kiện.');
        await atomicConnection(db, async () => {
          await assertActiveActor(db, config, actor, 'student');
          const conditions = json(b.dieu_kien_hoc);
          conditions.googleSync ||= {};
          conditions.googleSync[id] = {
            phien_ban: session.version,
            trang_thai: 'đã đồng bộ',
            thoi_diem: new Date().toISOString(),
          };
          await sessionRepository.saveSyncConditions(db, [
            JSON.stringify(conditions),
            b.ma_ke_hoach,
          ]);
          await sessionRepository.saveGoogleEvent(db, [eventId, id]);
        });
        return {
          ...dto(await get(actor.user.id, id, db)),
          syncStatus: 'synced',
          googleConfirmed: true,
        };
      } catch (e) {
        if (googleFailure(e).reconnect)
          await sessionRepository.requireReconnect(db, [actor.user.id]);
        throw e instanceof AppError
          ? e
          : new AppError(
              502,
              'GOOGLE_SYNC_FAILED',
              'Google chưa xác nhận đồng bộ. Bạn có thể thử lại; lịch nội bộ vẫn được giữ.',
            );
      }
    });
  }
  return {
    sync,
    async syncCandidates(owner) {
      const [rows] = await pool.execute(
        'SELECT b.*,p.dieu_kien_hoc,d.ma_mon_hoc FROM buoi_hoc b JOIN ke_hoach_hoc p USING(ma_ke_hoach) JOIN tai_lieu d USING(ma_tai_lieu) JOIN mon_hoc m ON m.ma_mon_hoc=p.ma_mon_hoc WHERE p.ma_nguoi_dung=? AND m.ma_nguoi_dung=? AND d.ma_mon_hoc=p.ma_mon_hoc ORDER BY b.bat_dau_luc DESC LIMIT 501',
        [owner, owner],
      );
      if (rows.length > 500)
        throw new AppError(
          422,
          'RANGE_TOO_DENSE',
          'Có hơn 500 buổi đã lưu. Hãy đồng bộ theo từng khoảng lịch đang xem.',
        );
      return {
        sessions: rows
          .map(decorate)
          .map(dto)
          .filter((s) => s.status !== 'cancelled' && s.syncStatus !== 'synced'),
      };
    },
    async list(owner, filters) {
      const rows = await range(pool, owner, filters.from, filters.to, filters);
      return {
        sessions: rows.map(dto),
        summary: {
          total: rows.filter((b) => b.trang_thai !== 'cancelled').length,
          completed: rows.filter((b) => b.trang_thai === 'completed').length,
        },
        serverNow: clock().toISOString(),
        limit: 500,
      };
    },
    async detail(owner, id) {
      return dto(await get(owner, id));
    },
    async propose(owner, plan) {
      const bounds = weekBounds(plan.week);
      const proposal = suggest(
        plan,
        (await range(pool, owner, bounds.from, bounds.to)).map(dto),
        clock(),
      );
      if (!proposal.slots.length) return proposal;
      const partitions = new Map();
      for (const goal of plan.goals) {
        if (goal.documentIds?.length) {
          const sources = await planSources(pool, owner, goal);
          partitions.set(goal, await planLessons(goal, sources));
          continue;
        }
        const d = await scope(pool, owner, goal);
        const chunks = await studyAssistantRepository(pool).chunks(
          owner,
          goal.documentId,
          goal.pageFrom,
          goal.pageTo,
        );
        try {
          partitions.set(goal, splitStudyPages(chunks, goal.pageFrom, goal.pageTo, goal.sessions));
        } catch {
          throw new AppError(
            422,
            'TOO_MANY_SESSIONS',
            'Số buổi phải phù hợp với khoảng trang đã chọn.',
          );
        }
        partitions.get(goal).documentName = d.ten_tai_lieu;
      }
      const used = new Map();
      proposal.slots = proposal.slots.map((slot) => {
        const goal = plan.goals.find((g) => g.courseId === slot.courseId);
        const at = used.get(goal) || 0;
        used.set(goal, at + 1);
        if (slot.locked) return slot;
        const part = partitions.get(goal)[at];
        if (part?.lesson) {
          const primary = part.lesson.resources[0];
          return {
            ...slot,
            title: part.title,
            lesson: part.lesson,
            documentId: primary.documentId,
            pageFrom: primary.pageFrom,
            pageTo: primary.pageTo,
            goal: part.lesson.objectives.join('\n'),
            reason:
              'AI chia theo chủ đề và độ khó; giờ học được kiểm tra với lịch rảnh và các buổi đã lưu.',
          };
        }
        return {
          ...slot,
          documentId: goal.documentId,
          ...part,
          goal: `${goal.goal} · ${partitions.get(goal).documentName}, trang ${part.pageFrom}–${part.pageTo}`,
        };
      });
      proposal.coverage = [];
      for (const goal of plan.goals.filter(
        (g) => g.documentIds?.length && isFullStudyGoal(g.goal),
      )) {
        const sources = await planSources(pool, owner, goal);
        const lessons = proposal.slots
          .filter((s) => s.courseId === goal.courseId && s.lesson)
          .map((s) => ({ lesson: s.lesson }));
        const report = coverageReport(lessons, sources);
        if (!report.complete || lessons.length !== goal.sessions)
          throw new AppError(
            422,
            'INCOMPLETE_LESSON_COVERAGE',
            'Chưa đủ giờ để xếp toàn bộ nội dung vào số buổi đã yêu cầu. Hãy bổ sung giờ rảnh; hệ thống không tự bỏ chương.',
            { coverage: report },
          );
        proposal.coverage.push({ ...report, courseId: goal.courseId });
      }
      proposal.unscheduledLessons = plan.goals.flatMap((goal) =>
        (partitions.get(goal) || [])
          .slice(used.get(goal) || 0)
          .filter((part) => part.lesson)
          .map((part) => ({
            courseId: goal.courseId,
            title: part.title,
            objectives: part.lesson.objectives,
          })),
      );
      return proposal;
    },
    async move(owner, id, input) {
      const b = await get(owner, id);
      if (b.trang_thai !== 'planned')
        throw new AppError(409, 'SESSION_LOCKED', 'Chỉ dời buổi chưa hoàn thành/hủy.');
      const plan = {
        ...input.constraints,
        locked: [],
        goals: [
          {
            courseId: String(b.ma_mon_hoc),
            goal: b.noi_dung_can_hoc,
            sessions: 3,
            duration: input.duration,
            priority: 'normal',
            documentId: String(b.ma_tai_lieu),
            pageFrom: b.trang_bat_dau,
            pageTo: b.trang_ket_thuc,
          },
        ],
      };
      const bounds = weekBounds(plan.week),
        existing = (await range(pool, owner, bounds.from, bounds.to))
          .filter((r) => String(r.ma_buoi_hoc) !== id)
          .map(dto);
      return { ...suggest(plan, existing, clock()), version: revision(b) };
    },
    async confirm(actor, input) {
      input = { ...input, slots: input.slots.map(normalize) };
      return mutate(actor, async (db) => {
        for (const goal of (input.constraints.goals || []).filter(
          (g) => g.documentIds?.length && isFullStudyGoal(g.goal),
        )) {
          const sources = await planSources(db, actor.user.id, goal);
          const slots = input.slots.filter((s) => s.courseId === goal.courseId);
          const report = coverageReport(
            slots.filter((s) => s.lesson).map((s) => ({ lesson: s.lesson })),
            sources,
          );
          if (slots.length !== goal.sessions || !report.complete)
            throw new AppError(
              422,
              'INCOMPLETE_LESSON_COVERAGE',
              'Bản nháp đã thay đổi và không còn đủ số buổi hoặc thiếu nội dung tài liệu. Hãy giữ đủ các buổi cho yêu cầu học toàn bộ.',
              { coverage: report },
            );
        }
        for (const s of input.slots) {
          const document = await scope(db, actor.user.id, s);
          s.courseId = String(document.ma_mon_hoc);
          await checkLesson(db, actor.user.id, s);
          if (new Date(s.end) <= new Date(s.start))
            throw new AppError(422, 'INVALID_TIME', 'Buổi học phải dài hơn 0 giây.');
          if (new Date(s.start) <= clock())
            throw new AppError(422, 'PAST_SESSION', 'Chọn thời gian tương lai.');
        }
        const ids = input.slots.map((s) => stableId(actor.user.id, s.requestId));
        for (const id of ids) {
          const [deleted] = await db.execute(
            "SELECT ma_ke_hoach FROM ke_hoach_hoc WHERE ma_nguoi_dung=? AND JSON_CONTAINS_PATH(dieu_kien_hoc,'one',?) LIMIT 1",
            [actor.user.id, `$.deletedSessions."${id}"`],
          );
          if (deleted.length)
            throw new AppError(
              410,
              'SESSION_DELETED',
              'Buổi học thuộc yêu cầu này đã bị xóa. Hãy tạo bản nháp mới.',
            );
        }
        if (new Set(ids).size !== ids.length)
          throw new AppError(422, 'DUPLICATE_REQUEST', 'Không lặp mã yêu cầu trong bản nháp.');
        const [found] = await sessionRepository.findRequestedSessions(
          db,
          [...ids, actor.user.id],
          ids,
        );
        const old = found.map(decorate);
        if (old.length) {
          if (old.length !== ids.length)
            throw new AppError(409, 'REQUEST_CONFLICT', 'Batch yêu cầu bị trùng một phần.');
          for (const s of input.slots) {
            const b = old.find(
              (b) => String(b.ma_buoi_hoc) === stableId(actor.user.id, s.requestId),
            );
            if (
              !b ||
              b.tieu_de !== s.title ||
              +new Date(b.bat_dau_luc) !== +new Date(s.start) ||
              +new Date(b.ket_thuc_luc) !== +new Date(s.end) ||
              String(b.ma_tai_lieu) !== s.documentId ||
              b.trang_bat_dau !== s.pageFrom ||
              b.trang_ket_thuc !== s.pageTo ||
              b.noi_dung_can_hoc !== s.goal ||
              b.nhac_truoc_phut !== s.reminderMinutes ||
              JSON.stringify(b.lesson || null) !== JSON.stringify(s.lesson || null)
            )
              throw new AppError(409, 'REQUEST_CONFLICT', 'UUID có nội dung khác.');
          }
          return { sessions: old.map(dto), replayed: true };
        }
        await collision(db, actor.user.id, input.slots);
        const groups = Map.groupBy(input.slots, (s) => s.courseId);
        for (const [course, slots] of groups) {
          const planId = await createPlan(db, actor.user.id, course, slots, input.constraints);
          for (const s of slots)
            await sessionRepository.insertSession(db, [
              stableId(actor.user.id, s.requestId),
              planId,
              s.documentId,
              s.title,
              s.goal,
              new Date(s.start),
              new Date(s.end),
              s.reminderMinutes,
            ]);
        }
        return {
          sessions: await Promise.all(ids.map(async (id) => dto(await get(actor.user.id, id, db)))),
          replayed: false,
        };
      });
    },
    async remove(actor, id, version) {
      const row = await get(actor.user.id, id);
      assertDeletableSession(row, version);
      if (row.dinh_danh_su_kien_google) await sync(actor, id, 'delete', version);
      return mutate(actor, async (db) =>
        deleteCancelledSession(db, actor.user.id, await get(actor.user.id, id, db), version),
      );
    },
    async conversation(actor, id, newConversation = false) {
      return mutate(actor, async (db) => {
        const row = await get(actor.user.id, id, db),
          conditions = json(row.dieu_kien_hoc),
          scope = conditions.sessions?.[id];
        if (!scope) throw new AppError(422, 'LESSON_SCOPE', 'Buổi học chưa có phạm vi tài liệu.');
        if (scope.chatConversationId && !newConversation) {
          try {
            const h = await studyAssistantRepository(db).conversation(
              actor.user.id,
              scope.chatConversationId,
            );
            if (String(h.ma_mon_hoc) === String(row.ma_mon_hoc)) return conversationDto(h);
          } catch (e) {
            if (e.status !== 404) throw e;
          }
        }
        const [created] = await conversationRepository.insertConversation(db, [
          row.ma_mon_hoc,
          `Hỏi buổi: ${row.tieu_de}`.slice(0, 150),
        ]);
        scope.chatConversationId = String(created.insertId);
        await sessionRepository.savePlanConditions(db, [
          JSON.stringify(conditions),
          row.ma_ke_hoach,
        ]);
        return conversationDto(
          await studyAssistantRepository(db).conversation(actor.user.id, scope.chatConversationId),
        );
      });
    },
    async create(actor, input) {
      const r = await this.confirm(actor, { slots: [input], constraints: {} });
      return r.sessions[0];
    },
    async patch(actor, id, { session: s, version }) {
      s = normalize(s);
      return mutate(actor, async (db) => {
        const b = await get(actor.user.id, id, db);
        checkVersion(b, version);
        if (b.trang_thai !== 'planned')
          throw new AppError(409, 'SESSION_LOCKED', 'Chỉ sửa buổi chưa hoàn thành/hủy.');
        const doc = await scope(db, actor.user.id, s);
        s.courseId = String(doc.ma_mon_hoc);
        await checkLesson(db, actor.user.id, s);
        if (+new Date(s.start) !== +new Date(b.bat_dau_luc) && new Date(s.start) <= clock())
          throw new AppError(422, 'PAST_SESSION', 'Chọn thời gian tương lai.');
        await collision(db, actor.user.id, [s], id);
        let planId = b.ma_ke_hoach;
        const movement = moveMetadata(b, s, json(b.dieu_kien_hoc)?.sessions?.[id], clock());
        if (String(doc.ma_mon_hoc) !== String(b.ma_mon_hoc)) {
          planId = await createPlan(db, actor.user.id, String(doc.ma_mon_hoc), [s], {}, id);
        }
        {
          const c =
            planId === b.ma_ke_hoach
              ? json(b.dieu_kien_hoc)
              : json((await sessionRepository.planConditions(db, [planId]))[0][0].dieu_kien_hoc);
          c.sessions[id] = {
            pageFrom: s.pageFrom,
            pageTo: s.pageTo,
            ...(s.lesson ? { lesson: s.lesson } : {}),
            ...(planId === b.ma_ke_hoach &&
            json(b.dieu_kien_hoc)?.sessions?.[id]?.chatConversationId
              ? { chatConversationId: json(b.dieu_kien_hoc).sessions[id].chatConversationId }
              : {}),
            ...movement,
          };
          await sessionRepository.savePlanConditions(db, [JSON.stringify(c), planId]);
        }
        await sessionRepository.updateSession(db, [
          planId,
          s.documentId,
          s.title,
          s.goal,
          new Date(s.start),
          new Date(s.end),
          s.reminderMinutes,
          id,
        ]);
        return dto(await get(actor.user.id, id, db));
      });
    },
    async status(actor, id, version, status) {
      return mutate(actor, async (db) => {
        const b = await get(actor.user.id, id, db);
        checkVersion(b, version);
        if (b.trang_thai !== status) await sessionRepository.setStatus(db, [toDb(status), id]);
        return dto(await get(actor.user.id, id, db));
      });
    },
    async retry(actor, id, input) {
      const b = await get(actor.user.id, id);
      checkVersion(b, input.version);
      return sync(actor, id, input.intent || 'sync', input.version);
    },
    async stopSync(actor, id, version) {
      return this.retry(actor, id, { version, intent: 'delete' });
    },
    async inbox(owner, cursor) {
      return notificationInbox(pool, owner, clock(), undefined, cursor);
    },
    async read(actor, id) {
      return mutate(actor, (db) => notificationInboxForDb(db, actor.user.id, clock(), id ?? null));
    },
  };
}
