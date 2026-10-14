import { AppError } from '../../shared/AppError.js';
export const courseDto = row => ({ id: String(row.id), name: row.name, description: row.description, readyDocumentCount: Number(row.ready_count ?? 0), createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() });
export function courseService(repository) {
  return {
    async get(owner, id) {
      const row = await repository.get(owner, id);
      if (!row) throw new AppError(404, 'COURSE_NOT_FOUND', 'Không tìm thấy môn học.');
      return courseDto(row);
    },
    async create(owner, input) { return courseDto(await repository.create(owner, input)); },
    async patch(owner, id, input) {
      const row = await repository.patch(owner, id, input);
      if (!row) throw new AppError(404, 'COURSE_NOT_FOUND', 'Không tìm thấy môn học.');
      return courseDto(row);
    },
    async list(owner, query) {
      const result = await repository.list(owner, query);
      return { data: result.rows.map(courseDto), meta: { page: query.page, pageSize: query.pageSize, total: result.total } };
    },
  };
}
