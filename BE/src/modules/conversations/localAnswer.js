import { countAnswer } from './countAnswer.js';
import { cleanDocumentText } from './documentAnswer.js';
import { questionTopic, topicEvidence } from './topicEvidence.js';
import { topicSectionAnswer } from './topicSectionAnswer.js';
import { normalizeConceptText } from './queryTerms.js';

const fold = normalizeConceptText;

// Only quote source passages. Lexical coverage is a routing rule, not semantic verification.
export function localAnswer(question, sources) {
  const intent = fold(question);
  const counted = countAnswer(question, sources);
  if (counted) return counted;
  if (
    /tai sao|vi sao|giai thich|so sanh|phan tich|chung minh|suy ra|van dung|bai tap|tinh toan|tom tat|tong hop|liet ke|bao nhieu|tat ca|toan bo/.test(
      intent,
    )
  )
    return null;
  const definition = /la gi|dinh nghia|khai niem/.test(intent);
  // Definitions must identify the subject itself, not a subtype whose heading mentions it.
  if (!definition) {
    const section = topicSectionAnswer(question, sources);
    if (section) return section;
  }
  if (!/cong thuc|bieu thuc|so mol|la gi|dinh nghia|khai niem|tra cuu|tim doan/.test(intent))
    return null;
  const topic = intent.replace(/\b(?:bieu thuc|tra cuu|tim doan)\b/g, ' ');
  const terms = [...new Set(questionTopic(topic))];
  if (!terms.length || (!definition && terms.length < 2)) return null;
  const subject = terms.join(' ');
  const subjectPattern = terms
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  const definesSubject = new RegExp(
    `^${subjectPattern}(?:\\s*\\([^()\\n]+\\))?\\s+(?:la|duoc dinh nghia|ton tai|chi|cho biet)\\b`,
  );
  const candidates = sources
    .flatMap((source) => {
      const cleaned = cleanDocumentText(source.content || '');
      return cleaned.split(/\n\s*\n/).flatMap((block) => {
        // Bound quotes without cutting individual formula lines.
        const lines = block.split('\n');
        const passages = [];
        for (let i = 0; i < lines.length; i++) {
          const first = fold(lines[i])
            .replace(/^[*•●▪◦\s]+/, '')
            .trim();
          const label = first
            .replace(
              /^(?:chuong|bai|chu de)\s+[\divxlc]+\s*[:.)-]\s*|^(?:\d+(?:\.\d+)*|[a-z]|[ivxlc]+)[.)]\s*/g,
              '',
            )
            .replace(/[:.]$/, '')
            .trim();
          // A definition must introduce the requested subject. Mentioning it inside
          // a different topic (e.g. electromagnetic waves) is not a definition.
          const definitionRank = label === subject ? 3 : definesSubject.test(first) ? 4 : 0;
          if (definition && (!definitionRank || /\?|\bla gi\b/.test(first))) continue;
          let end = Math.min(lines.length, i + (definition ? 12 : 8));
          if (definition) {
            for (let j = i + 1; j < end; j++) {
              // Stop at a new section rather than leaking into classification or another topic.
              if (
                /^(?:(?:\d+(?:\.\d+)*|[a-z])[.)]\s|(?:cau|chuong|bai|chu de)\s)/.test(
                  fold(lines[j]),
                )
              ) {
                end = j;
                break;
              }
            }
          }
          const quote = lines.slice(i, end).join('\n').trim();
          const words = new Set(fold(quote).match(/[a-z0-9]+/g) || []);
          if (quote.length < 20 || quote.length > 1600 || !terms.every((term) => words.has(term)))
            continue;
          if (!topicEvidence(topic, quote).supported) continue;
          if (/cong thuc|bieu thuc|so mol/.test(intent) && !/[=≈∝]/u.test(quote)) continue;
          passages.push({ source, quote, definitionRank });
        }
        return passages;
      });
    })
    .sort(
      (a, b) =>
        (definition ? b.definitionRank - a.definitionRank : 0) ||
        b.source.score - a.source.score ||
        a.quote.length - b.quote.length,
    );
  const selected = candidates[0];
  if (!selected) return null;
  return {
    status: 'answered',
    model: 'document-extractive',
    verification: 'chưa kiểm chứng',
    answer: `Đoạn trích liên quan trong tài liệu (đối chiếu trang nguồn để xem đầy đủ):\n\n${selected.quote}`,
    sources: [selected.source],
    evidence: [{ chunkId: selected.source.chunkId, quote: selected.quote }],
  };
}
