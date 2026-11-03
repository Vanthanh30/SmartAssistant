import { json, missing } from '../shared/repository.js';
import { AppError } from '../../shared/AppError.js';
export async function sessionChatScope(
  repo,
  owner,
  course,
  sessionId,
  documentIds,
  conversationId,
) {
  if (!sessionId) return undefined;
  const row = await repo.session(owner, sessionId);
  if (String(row.ma_mon_hoc) !== String(course)) throw missing();
  const saved = json(row.dieu_kien_hoc)?.sessions?.[sessionId];
  if (conversationId && String(saved?.chatConversationId) !== String(conversationId))
    throw new AppError(
      422,
      'LESSON_CONVERSATION',
      'Hội thoại không thuộc buổi học này. Mở lại khung hỏi đáp trong buổi học.',
    );
  const resources =
    saved?.lesson?.resources ||
    (saved?.pageFrom > 0 && saved.pageTo >= saved.pageFrom
      ? [
          {
            documentId: String(row.ma_tai_lieu),
            pageFrom: saved.pageFrom,
            pageTo: saved.pageTo,
            chunkIds: null,
          },
        ]
      : []);
  if (!resources.length)
    throw new AppError(422, 'LESSON_SCOPE', 'Buổi học chưa có phạm vi tài liệu để hỏi đáp.');
  if (documentIds?.some((id) => !resources.some((r) => r.documentId === id)))
    throw new AppError(422, 'LESSON_SCOPE', 'Chỉ hỏi tài liệu thuộc buổi học này.');
  return resources.filter((r) => !documentIds || documentIds.includes(r.documentId));
}
export function sessionSqlScope(resources) {
  if (!resources) return { sql: '', args: [] };
  if (!resources.length) return { sql: ' AND 1=0', args: [] };
  const args = [];
  const parts = resources.map((r) => {
    args.push(r.documentId, r.pageTo, r.pageFrom, ...(r.chunkIds || []));
    return `(ch.ma_tai_lieu=? AND ch.trang_bat_dau<=? AND ch.trang_ket_thuc>=?${r.chunkIds?.length ? ` AND ch.ma_doan_tai_lieu IN (${r.chunkIds.map(() => '?').join(',')})` : ''})`;
  });
  return { sql: ` AND (${parts.join(' OR ')})`, args };
}
