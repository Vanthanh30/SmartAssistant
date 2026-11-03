import { json, missing } from '../shared/repository.js';
import { AppError } from '../../shared/AppError.js';

export async function sessionPracticeScope(repo, owner, course, input) {
  if (!input.sessionId) return undefined;
  const session = await repo.session(owner, input.sessionId);
  if (String(session.ma_mon_hoc) !== String(course) || session.trang_thai === 'đã hủy')
    throw missing();
  const saved = json(session.dieu_kien_hoc).sessions?.[input.sessionId];
  const resources =
    saved?.lesson?.resources ||
    (Number.isInteger(saved?.pageFrom) &&
    Number.isInteger(saved?.pageTo) &&
    saved.pageFrom > 0 &&
    saved.pageTo >= saved.pageFrom
      ? [
          {
            documentId: String(session.ma_tai_lieu),
            pageFrom: saved.pageFrom,
            pageTo: saved.pageTo,
            chunkIds: null,
          },
        ]
      : undefined);
  if (!resources?.length)
    throw new AppError(
      422,
      'LESSON_REQUIRED',
      'Buổi học chưa có nội dung chi tiết. Hãy tạo kế hoạch AI mới.',
    );
  if (
    input.documentIds.some((id) => !resources.some((r) => r.documentId === id)) ||
    resources.some((r) => !input.documentIds.includes(r.documentId))
  )
    throw new AppError(422, 'LESSON_SCOPE', 'Bài luyện phải dùng đúng tài liệu của buổi học.');
  return resources;
}
