import { questionParts, normalizeCountQuestion } from '../modules/conversations/queryTerms.js';

const facets = /khái niệm|định nghĩa|đặc điểm|chức năng|ưu điểm|hạn chế|nhược điểm|cấu tạo|nguyên lý|ứng dụng/giu;

// Retrieval plan only: preserve the original question for generation/verification.
export function planQuestion(question) {
  const original = question.trim().normalize('NFC');
  // Narrow corrections for common Vietnamese input, without fuzzy-changing a subject.
  const normalized = normalizeCountQuestion(original).replace(/khái niêm/giu,'khái niệm').replace(/chưc năng/giu,'chức năng');
  const premise=normalized.match(/^(.+?)\s+có\s+(?:\d+|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s+(?:loại|nhóm|dạng)(?:\s+(?:đúng không|phải không))?[?.!]*$/iu);
  if(premise)return {original,limited:false,items:[{id:'part-1',query:normalized,subject:premise[1],facet:'phân loại'}]};
  const subjectMatch = normalized.match(/của\s+(.+?)[.!?]*$/iu);
  const prefix = subjectMatch ? normalized.slice(0, subjectMatch.index) : '';
  const labels = [...prefix.matchAll(facets)].map(match => match[0].toLocaleLowerCase('vi'));
  let queries;
  if (subjectMatch && labels.length >= 1) {
    const subject = subjectMatch[1].replace(/[.!?]+$/, '').trim();
    queries = labels.map(label => `${label} của ${subject}`);
  } else {
    queries = questionParts(normalized);
    // Carry an explicit comparison intent into both sides, without inventing a subject.
    if (/^so sánh\s/iu.test(original) && queries.length > 1) queries[0] = queries[0].replace(/^so sánh\s+/iu, '');
  }
  queries = [...new Set(queries.filter(Boolean))];
  const limited = queries.length > 8;
  if (limited || !queries.length) queries = [original];
  return { original, limited, items: queries.map((query, index) => ({ id: `part-${index + 1}`, query,
    ...(!limited&&subjectMatch&&labels.length?{subject:subjectMatch[1].replace(/[.!?]+$/,'').trim(),facet:labels.find(label=>query.startsWith(label+' của'))}:{}) })) };
}
