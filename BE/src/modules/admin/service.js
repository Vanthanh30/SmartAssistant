import { adminRepository, adminLists } from './repository.js';
import { audit, recentAudit } from './auditRepository.js';
import { userDto } from './mapper.js';
import { toDb, fromDb } from '../shared/values.js';
import { AppError } from '../../shared/AppError.js';
import { dashboardRange } from './dashboard/service.js';
import { documentService } from '../documents/service.js';
import { atomic, missing } from '../shared/repository.js';
import { assertActiveActor, revokeOwnerSessions } from '../auth/service.js';

async function embeddingConfiguration(pool) {
  const [rows] = await adminRepository.embeddingConfiguration(pool);
  return rows.map((row) => ({
    ...((typeof row.contract === 'string' ? JSON.parse(row.contract) : row.contract) || {}),
    model: row.ten_mo_hinh,
  }));
}
export function adminService(pool, config) {
  const documents = documentService(pool, config);
  const repository = adminLists(pool);
  const getUser = async (id) => {
    const [r] = await adminRepository.user(pool, [id]);
    if (!r.length) throw missing();
    return r[0];
  };
  const docRows = async (filters) => {
    const { rows, count } = await repository.documents(filters);
    return {
      data: await Promise.all(
        rows.map(async (d) => ({
          ...(await documents.dto(d)),
          courseName: d.ten_mon_hoc,
          uploadedBy: {
            id: String(d.ma_nguoi_dung),
            fullName: d.ho_ten,
            email: d.email,
            role: fromDb(d.vai_tro),
            status: fromDb(d.owner_status),
          },
        })),
      ),
      meta: { ...filters, total: Number(count[0].n) },
    };
  };
  const documentOwner = async (id) => {
    if (!/^[1-9][0-9]{0,19}$/.test(id)) throw missing();
    const [r] = await adminRepository.documentOwner(pool, [id]);
    if (!r.length) throw missing();
    return String(r[0].ma_nguoi_dung);
  };
  return {
    listUsers: async ({ filters }) => {
      const f = filters;
      const { rows: r, count } = await repository.users(filters);
      return {
        data: r.map(userDto),
        meta: { ...f, total: Number(count[0].n) },
      };
    },
    userDetail: async ({ ids }) => userDto(await getUser(ids.userId)),
    updateUserStatus: async ({ ids, auth, input }) => {
      const id = ids.userId;
      await atomic(pool, async (db) => {
        await adminRepository.lockAdmins(db);
        await assertActiveActor(db, config, auth, 'admin');
        const [r] = await adminRepository.lockUser(db, [id]);
        if (!r.length) throw missing();
        if (r[0].vai_tro === 'quản trị viên' && input.status === 'blocked') {
          const [admins] = await adminRepository.activeAdmins(db);
          if (Number(admins[0].n) <= 1)
            throw new AppError(409, 'LAST_ACTIVE_ADMIN', 'Không thể khóa quản trị viên cuối cùng.');
        }
        if (input.status === 'blocked') await revokeOwnerSessions(config, id);
        await adminRepository.setUserStatus(db, [toDb(input.status), id]);
      });
      await audit(config, auth, 'user.' + input.status, id);
      return userDto(await getUser(id));
    },
    listDocuments: async ({ filters }) => ({ ...(await docRows(filters)) }),
    listCourses: async ({ filters }) => {
      const f = filters;
      const { rows: r, count } = await repository.courses(filters);
      return {
        data: r.map((m) => ({
          id: String(m.ma_mon_hoc),
          name: m.ten_mon_hoc,
          userId: String(m.ma_nguoi_dung),
          ownerName: m.ho_ten,
        })),
        meta: { ...f, total: Number(count[0].n) },
      };
    },
    documentDetail: async ({ params }) => {
      const owner = await documentOwner(params.id);
      const rows = await docRows({
        documentId: params.id,
        page: 1,
        pageSize: 1,
      });
      return {
        ...rows.data[0],
        ...(await documents.get(owner, params.id)),
      };
    },
    documentContent: async ({ params }) =>
      await documents.content(await documentOwner(params.id), params.id),
    removeDocument: async ({ params, auth }) => {
      const owner = await documentOwner(params.id);
      const result = await documents.remove(
        {
          ...auth,
          user: { ...auth.user, id: owner },
          originalActor: auth,
        },
        params.id,
      );
      await audit(config, auth, 'document.delete', params.id);
      return result;
    },
    dashboard: async ({ query }) => {
      const range = dashboardRange(query);
      const u = await (await adminRepository.userTotals(pool, []))[0][0],
        courses = await (await adminRepository.courseTotal(pool, []))[0][0];
      const [states] = await adminRepository.documentStates(pool);
      const docs = {
        total: 0,
        ready: 0,
        processing: 0,
        failed: 0,
        unsupported: 0,
      };
      for (const s of states) {
        s.status = fromDb(s.status);
        docs.total += Number(s.count);
        if (s.status === 'uploaded' || s.status === 'processing')
          docs.processing += Number(s.count);
        else if (Object.hasOwn(docs, s.status)) docs[s.status] += Number(s.count);
      }
      const activity = await (await adminRepository.activity(pool, [range.from, range.to]))[0][0];
      const total = Number(activity.total),
        insufficient = Number(activity.insufficient || 0),
        origins = { grounded: 0, general: 0, unknown: total };
      const [originRows] = await adminRepository.answerOrigins(pool, [range.from, range.to]);
      for (const r of originRows)
        if (r.origin === 'có nguồn') {
          origins.grounded += Number(r.n);
          origins.unknown -= Number(r.n);
        }
      const [questions] = await adminRepository.questionsByDay(pool, [range.from, range.to]);
      const [uploads] = await adminRepository.uploadsByDay(pool, [range.from, range.to]);
      const fill = (rows) =>
        range.dates.map((day) => ({
          day,
          count: Number(rows.find((r) => r.day === day)?.count || 0),
        }));
      return {
        updatedAt: new Date().toISOString(),
        timezone: 'Asia/Ho_Chi_Minh',
        range: { start: range.start, end: range.end },
        totals: {
          users: Object.fromEntries(Object.entries(u).map(([k, v]) => [k, Number(v)])),
          courses: Number(courses.n),
          documents: docs,
        },
        activity: {
          total,
          answered: Number(activity.answered || 0),
          insufficient,
          processing: Number(activity.processing || 0),
          failed: Number(activity.failed || 0),
          averageLatencyMs: null,
          latencySamples: 0,
          insufficientRate: total ? insufficient / total : null,
          origins,
        },
        charts: {
          questions: fill(questions),
          uploads: fill(uploads),
          documentStates: states.map((s) => ({
            status: s.status,
            count: Number(s.count),
          })),
        },
        recentDocuments: (await docRows({ page: 1, pageSize: 10 })).data.map((d) => ({
          ...d,
          uploader: d.uploadedBy.fullName,
        })),
        audit: await recentAudit(config),
        configuration: {
          llmModel: config.LLM_MODEL || null,
          llmProvider: config.LLM_PROVIDER,
          embedding: await embeddingConfiguration(pool),
          ragTopK: config.RAG_TOP_K,
          ragScoreThreshold: config.RAG_SCORE_THRESHOLD,
          retrievalCandidates: 20,
        },
        notes: [
          'Cơ sở dữ liệu lưu phạm vi và ngữ cảnh theo lượt hỏi đáp; lỗi kỹ thuật và audit quản trị nằm trong log, không suy ra bằng 0.',
        ],
      };
    },
  };
}
