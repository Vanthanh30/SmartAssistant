import { cleanDocumentText, formatPassage } from './documentAnswer.js';

const fold = text => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').toLowerCase();
const stop = new Set('co bao nhieu nhung cac loai nao va neu ten tung la gi cua trong cho toi hay gom liet ke chuc nang trinh bay'.split(' '));

// Recover complete numbered sections across overlapping chunks, without inventing items.
export function sectionAnswer(sources, question, budget = 6000) {
  if (!/bao nhiêu|những|các loại|từng loại|liệt kê|gồm|chức năng|cấu tạo|quá trình|các bước|phân loại|nêu tên/i.test(question)) return null;
  const terms = [...new Set(fold(question).match(/[a-z0-9]+/g) || [])].filter(term => !stop.has(term));
  if (!terms.length) return null;
  const documents = Map.groupBy(sources, source => source.documentId);
  const candidates = [];
  let incomplete;
  for (const chunks of documents.values()) {
    chunks.sort((a, b) => (a.chunkOrder ?? a.pageFrom) - (b.chunkOrder ?? b.pageFrom));
    let combined = ''; const spans = [];
    for (const source of chunks) {
      const text = cleanDocumentText(source.content);
      let overlap = 0;
      for (let length = Math.min(1800, combined.length, text.length); length >= 40; length--) {
        if (combined.endsWith(text.slice(0, length))) { overlap = length; break; }
      }
      const start = combined.length - overlap;
      combined += (overlap ? '' : '\n') + text.slice(overlap);
      spans.push({ source, start, end: combined.length });
    }
    const headings = [...combined.matchAll(/^(?:\d+(?:\.\d+)*[.)]\s+[^\n]+|[IVX]+[.)]\s+[^\n]+|[^\n•*]{3,100}:|(?:Hai|Ba|Bốn|Năm|Sáu|Các|Những)\s+[^\n]{3,100})$/gmu)];
    for (const [index, heading] of headings.entries()) {
      const title = fold(heading[0]);
      const matches = terms.filter(term => new RegExp(`\\b${term}\\b`).test(title)).length;
      if (matches < Math.max(1, Math.ceil(terms.length / 2))) continue;
      const end = headings[index + 1]?.index ?? combined.length;
      const section = combined.slice(heading.index, end).split(/\n(?=Câu\s+\d+[.:])/u)[0].trim();
      const subheadings = [...section.matchAll(/^([a-z])[.)]\s+[^\n]+/gm)];
      if (subheadings.length < 2) continue;
      if (Buffer.byteLength(section, 'utf8') > budget) {
        incomplete = { status: 'insufficient_context', model: 'document-extractive',
          answer: 'Nhóm ý liên quan vượt ngân sách trả lời trực tiếp. Hãy mở trang nguồn để xem đầy đủ hoặc hỏi riêng từng phần.',
          sources: spans.filter(span => span.end > heading.index && span.start < heading.index + section.length).map(span => span.source) };
        continue;
      }
      // A consecutive a/b/c group must not be silently truncated halfway through.
      const labels = subheadings.map(match => match[1]);
      if (labels[0] !== 'a' || labels.some((label, i) => label.charCodeAt(0) !== 97 + i)) continue;
      const expected = title.match(/\b(\d+|hai|ba|bon|nam|sau)\s+(?:loai|thanh phan|buoc)/);
      const counts = { hai: 2, ba: 3, bon: 4, nam: 5, sau: 6 };
      if (expected && labels.length < (counts[expected[1]] || Number(expected[1]))) {
        incomplete = { status: 'insufficient_context', model: 'document-extractive',
          answer: 'Tài liệu nêu một nhóm mục nhưng phần truy hồi chưa đủ toàn bộ nhóm. Hãy mở trang nguồn để xem đầy đủ; hệ thống chưa thể khẳng định đã liệt kê hết.',
          sources: spans.filter(span => span.end > heading.index && span.start < heading.index + section.length).map(span => span.source) };
        continue;
      }
      candidates.push({ answer: section.split('\n').map(line => /^[a-z][.)]\s/.test(line) || /^\d+[.)]\s/.test(line) || /^[●•*▪◦]/.test(line) ? '\n' + line : line).join('\n'),
        sources: spans.filter(span => span.end > heading.index && span.start < heading.index + section.length).map(span => span.source),
        rank: matches / terms.length + (/loai|thanh phan|buoc/.test(title) ? .3 : 0) + labels.length * .01 });
    }
  }
  candidates.sort((a, b) => b.rank - a.rank);
  if (!candidates.length) return incomplete || null;
  const selected = candidates[0];
  return { status: 'answered', model: 'document-extractive', sources: selected.sources,
    answer: formatPassage(selected.answer) };
}
