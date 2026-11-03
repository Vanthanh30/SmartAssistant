import { planQuestion } from '../../rag/questionPlan.js';
import { topicEvidence } from './topicEvidence.js';
import { normalizeConceptText } from './queryTerms.js';

const facetTerms = {
  'khái niệm': ['khai niem', 'dinh nghia'],
  'định nghĩa': ['khai niem', 'dinh nghia'],
  'đặc điểm': ['dac diem', 'dac trung'],
  'chức năng': ['chuc nang', 'vai tro'],
  'ưu điểm': ['uu diem', 'loi ich'],
  'nhược điểm': ['nhuoc diem', 'han che'],
  'hạn chế': ['han che', 'nhuoc diem'],
  'cấu tạo': ['cau tao', 'cau truc'],
  'nguyên lý': ['nguyen ly'],
  'ứng dụng': ['ung dung'],
  'phân loại': ['loai', 'nhom', 'dang'],
};
export function answerCoverage(question, sources) {
  const plan = planQuestion(question);
  const items = plan.items.map((item) => {
    const matches = sources.filter((source) => {
      if (!item.subject || !item.facet) return topicEvidence(item.query, source.content).supported;
      if (!topicEvidence(item.subject, source.content).supported) return false;
      const text = normalizeConceptText(source.content);
      const labels = facetTerms[item.facet] || [normalizeConceptText(item.facet)];
      if (labels.some((label) => text.includes(label))) return true;
      // A direct definition need not contain the words "khái niệm".
      if (['khái niệm', 'định nghĩa'].includes(item.facet)) {
        const subject = normalizeConceptText(item.subject).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${subject}\\s+(?:la|duoc dinh nghia)\\b`).test(text);
      }
      return false;
    });
    // High measured semantic relevance is a candidate for independent verification,
    // not proof. This avoids rejecting paraphrases solely for missing exact words.
    const semantic =
      matches.length || item.facet
        ? []
        : sources
            .filter(
              (source) =>
                source.retrievalMethod === 'hybrid' &&
                source.scoreMeasured === true &&
                source.score >= 0.75 &&
                source.retrievalParts?.includes(item.id),
            )
            .slice(0, 3);
    return {
      ...item,
      sourceIds: (matches.length ? matches : semantic).map((s) => s.chunkId),
      ...(semantic.length ? { semanticOnly: true } : {}),
    };
  });
  return {
    plan,
    items,
    supported: items.filter((i) => i.sourceIds.length),
    missing: items.filter((i) => !i.sourceIds.length),
  };
}

export function missingCoverageText(missing, label = 'Tài liệu chưa có đủ bằng chứng cho các ý') {
  return missing.length ? `${label}: ${missing.map((i) => i.query).join('; ')}.` : '';
}
