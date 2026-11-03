import { fromDb } from '../shared/values.js';
import { json } from '../shared/repository.js';
export const setDto = (b, count) => {
  const c = json(b.cau_hinh_tao);
  return {
    id: String(b.ma_bai_on_tap),
    courseId: String(b.ma_mon_hoc),
    sessionId: c.sessionId || null,
    documentId: c.documentIds?.[0] || null,
    pageFrom: c.pageFrom,
    pageTo: c.pageTo,
    kind: fromDb(b.loai_bai),
    title: b.ten_bai_on_tap,
    itemCount: count,
    sourceCount: Number(b.source_count ?? 0),
    model: b.mo_hinh_tao,
    source: fromDb(b.nguon_tao),
    createdAt: b.ngay_tao,
    perQuestionConfirmation: true,
  };
};
