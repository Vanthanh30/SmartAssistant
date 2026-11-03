import { questionTopic } from './topicEvidence.js';
import { normalizeConceptText, normalizeCountQuestion } from './queryTerms.js';

const fold = normalizeConceptText;
const numbers = ['khong', 'mot', 'hai', 'ba', 'bon', 'nam', 'sau', 'bay', 'tam', 'chin', 'muoi'];
const number = '(?:\\d+|' + numbers.slice(1).join('|') + ')';
const label = (line) =>
  line.replace(/^\s*(?:\d+(?:\.\d+)*[.)]|[a-z][.)])\s+|^[*•●▪◦\s]+/gu, '').trim();
const root = (line) => line.match(/^\s*(\d+(?:\.\d+)*)[.)]\s+/)?.[1];
const stopQuestion = /^\s*(?:Câu\s+\d+|CHƯƠNG\s|BÀI\s|CHỦ ĐỀ\s)/iu;
function overlap(a, b) {
  for (let length = Math.min(1600, a.length, b.length); length >= 20; length--)
    if (a.endsWith(b.slice(0, length))) return length;
  return 0;
}

// Extract the explicit count AND its bounded list/description. No taxonomy or
// functions are supplied from general knowledge; quotes stay in original chunks.
export function countAnswer(question, sources) {
  const intent = fold(normalizeCountQuestion(question));
  if (
    !/(?:bao nhieu|may)\s+(?:loai|dang|nhom)\b|\b(?:co|gom|bao gom)\s+(?:nhung|cac)\s+(?:loai|dang|nhom)\s+nao\b/.test(
      intent,
    ) ||
    /\b(?:va|chuc nang|giai thich|so sanh)\b/.test(intent)
  )
    return null;
  const terms = questionTopic(question);
  if (!terms.length) return null;
  const subject = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const pattern = new RegExp(
    `^(?:${number}\\s+(?:loai|dang|nhom)\\s+${subject}\\b|${subject}\\s+(?:(?:chu yeu|chinh)\\s+)?(?:co|gom|bao gom|duoc chia thanh)\\s+${number}\\s+(?:loai|dang|nhom)\\b)(?=\\s*(?:$|[.:;]|chinh\\b|chu yeu\\b|co ban\\b|sau\\b))`,
  );
  const candidates = [];
  for (const source of sources) {
    const lines = source.content.split('\n');
    let offset = 0;
    for (const line of lines) {
      const title = label(line),
        normalized = fold(title),
        start = offset;
      offset += line.length + 1;
      if (!pattern.test(normalized) || /[?？]|\b(?:bao nhieu|may)\b/.test(normalized)) continue;
      const countWord = normalized.match(
        new RegExp(`\\b(${number})\\s+(?:loai|dang|nhom)\\b`),
      )?.[1];
      const expected = /^\d+$/.test(countWord || '')
        ? Number(countWord)
        : numbers.indexOf(countWord);
      const headingRoot = root(line),
        rootDepth = headingRoot?.split('.').length || 1;
      const neighbors = Number.isInteger(source.chunkOrder)
        ? sources
            .filter(
              (s) =>
                s.documentId === source.documentId &&
                Number.isInteger(s.chunkOrder) &&
                s.chunkOrder > source.chunkOrder &&
                s.chunkOrder <= source.chunkOrder + 2,
            )
            .sort((a, b) => a.chunkOrder - b.chunkOrder)
        : [];
      const segments = [];
      let stopped = false,
        otherNote = false,
        previous = source;
      for (const [index, current] of [source, ...neighbors].entries()) {
        if (index && current.chunkOrder !== previous.chunkOrder + 1) break;
        if (
          index &&
          Number.isFinite(current.sourceStart) &&
          Number.isFinite(previous.sourceStart) &&
          current.sourceStart > previous.sourceStart + previous.content.length
        )
          break;
        const begin = index ? overlap(previous.content, current.content) : start;
        let end = current.content.length,
          cursor = begin;
        for (const part of current.content.slice(begin).split('\n')) {
          const initial = index === 0 && cursor === start;
          const section = root(part);
          if (
            !initial &&
            (stopQuestion.test(part) || (section && section.split('.').length <= rootDepth))
          ) {
            const named = fold(part);
            const relatedOther =
              !otherNote &&
              section &&
              terms.every((t) => new Set(named.match(/[a-z0-9]+/g) || []).has(t)) &&
              /\b(?:loai|nhom|dang)\b/.test(named) &&
              /\b(?:khac|bo sung)\b/.test(named);
            if (relatedOther) otherNote = true;
            else {
              end = cursor;
              stopped = true;
              break;
            }
          }
          cursor += part.length + 1;
        }
        const quote = current.content.slice(begin, end).trim();
        if (quote) segments.push({ source: current, quote });
        previous = current;
        if (stopped || segments.reduce((n, s) => n + s.quote.length, 0) > 4500) break;
      }
      let text = segments.map((s) => s.quote).join('\n\n');
      // Count only immediate list headings, not arbitrary mentions or nucleotides.
      const names = [...text.matchAll(/^\s*([a-z])[.)]\s+(.+)/gmu)].map((m) => m[1]);
      const inline = title
        .split(':')
        .slice(1)
        .join(':')
        .split(/[,;]|\s+và\s+/iu)
        .filter((s) => s.trim()).length;
      const complete = expected > 0 && (new Set(names).size === expected || inline === expected);
      if (segments.reduce((n, s) => n + s.quote.length, 0) > 4500) continue;
      // Strip the outer numbered heading for display, retaining it in evidence.
      text = text.replace(/^\s*\d+(?:\.\d+)*[.)]\s+/u, '');
      const answer =
        text +
        (complete
          ? ''
          : '\n\nTài liệu nêu số lượng trên, nhưng các đoạn hiện có chưa cung cấp đủ danh sách từng loại để trình bày đầy đủ.');
      candidates.push({
        status: complete ? 'answered' : 'insufficient_context',
        model: 'document-extractive',
        verification: 'chưa kiểm chứng',
        answer,
        sources: segments.map((s) => s.source),
        evidence: segments.map((s) => ({ chunkId: s.source.chunkId, quote: s.quote })),
        complete,
      });
    }
  }
  candidates.sort(
    (a, b) => Number(b.complete) - Number(a.complete) || b.evidence.length - a.evidence.length,
  );
  if (!candidates.length) return null;
  const answer = { ...candidates[0] };
  delete answer.complete;
  return answer;
}
