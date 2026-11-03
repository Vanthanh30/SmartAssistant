import { cleanDocumentText } from './documentAnswer.js';
import { questionTopic } from './topicEvidence.js';
import { questionParts, normalizeConceptText } from './queryTerms.js';

const fold = normalizeConceptText;
const heading = /^\s*(\d+(?:\.\d+)*[.)]|[a-z][.)])\s+(.+)/u;

// Extract a named section as a whole, including table text, and stop at its next sibling.
export function topicSectionAnswer(question, sources) {
  const parts = questionParts(question).map(part => questionTopic(part));
  if (!parts.length || parts.some(part => !part.length)) return null;
  const candidates = [];
  for (const source of sources) {
    const lines = cleanDocumentText(source.content || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(heading);
      if (!match) continue;
      const title = fold(match[2]);
      const tokens = new Set(title.match(/[a-z0-9]+/g) || []);
      if (!parts.every(part => part.every(term => tokens.has(term)) && title.includes(part.join(' ')))) continue;
      let end = i + 1;
      const numbered = /^\d/.test(match[1]);
      while (end < lines.length) {
        const next = lines[end].match(heading);
        if (next && (numbered ? /^\d/.test(next[1]) : true)) break;
        if (/^(?:CHƯƠNG|BÀI|CHỦ ĐỀ)\s/u.test(lines[end])) break;
        end++;
      }
      const body = lines.slice(i + 1, end).join('\n').trim();
      const quote = lines.slice(i, end).join('\n').trim();
      if (body.length < 30 || quote.length > 2400) continue;
      candidates.push({ source, quote, extra: tokens.size - new Set(parts.flat()).size });
    }
  }
  candidates.sort((a, b) => a.extra - b.extra || b.source.score - a.source.score || a.quote.length - b.quote.length);
  const selected = candidates[0];
  if (!selected) return null;
  return { status: 'answered', model: 'document-extractive', verification: 'chưa kiểm chứng',
    answer: selected.quote, sources: [selected.source], evidence: [{ chunkId: selected.source.chunkId, quote: selected.quote }] };
}
