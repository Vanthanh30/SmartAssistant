import { learningText } from './sourceText.js';
const compact = value => learningText(value || '').normalize('NFC').replace(/\s/gu, '');

export function evidenceAnchor(item, kind) {
  if (item.evidenceText) return item.evidenceText;
  if (kind === 'flashcards') return item.answer;
  const explanation = item.explanation || '';
  const calculation = explanation.match(/^Áp dụng công thức nguồn ([^:]+):/u);
  if (calculation) return calculation[1];
  return explanation.replace(/^(?:Nội dung nguồn|Nguyên văn tài liệu):\s*/u, '');
}

// The page map contains offsets in the original extraction. Match the answer
// evidence inside those page slices, never choose the first page of a chunk.
export function evidencePage(source, anchor) {
  let map;
  try { map = typeof source.pageMap === 'string' ? JSON.parse(source.pageMap) : source.pageMap; }
  catch { return null; }
  const needle = compact(anchor);
  const start = Number(source.sourceStart);
  if (!needle || !Array.isArray(map) || source.sourceStart == null || !Number.isSafeInteger(start) || start < 0) return null;
  const pages = map.filter(value => value && Number.isInteger(value.page) && value.page >= source.pageFrom
    && value.page <= source.pageTo && Number.isFinite(value.start) && Number.isFinite(value.end))
    .sort((a,b) => a.start - b.start).map(value => ({ page: value.page,
      text: compact(source.content.slice(Math.max(0, value.start - start), Math.max(0, value.end - start))) }));
  let text = ''; const spans = [];
  for (const page of pages) { const from = text.length; text += page.text; spans.push({ page: page.page, from, to: text.length }); }
  const index = text.indexOf(needle);
  if (index < 0 || text.indexOf(needle, index + 1) >= 0) return null;
  const matched = spans.filter(page => page.from < index + needle.length && page.to > index);
  return matched.length ? { pageFrom: matched[0].page, pageTo: matched.at(-1).page } : null;
}

export function itemEvidencePage(source, item, kind) {
  const primary = evidencePage(source,evidenceAnchor(item,kind));
  if (primary && primary.pageFrom === primary.pageTo) return primary;
  const answer = item.answer || item.choices?.[item.correctIndex];
  // Generated numeric exercise results are not quotations from the PDF.
  if (typeof answer === 'string' && (compact(answer).length >= 12 || answer.includes('='))) {
    const precise = evidencePage(source,answer);
    if (precise) return precise;
  }
  return primary;
}
