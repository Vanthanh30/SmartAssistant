import { cleanDocumentText } from './documentAnswer.js';
import { normalizeConceptText } from './queryTerms.js';
import { questionTopic } from './topicEvidence.js';

// Recover only explicit, intact prose definitions, never reconstructed table cells.
// Keep each PDF's statement separate so conflicting sources are not silently merged.
export function definitionRecovery(question, sources) {
  const intent = normalizeConceptText(question).trim();
  if (
    /cong thuc|bao nhieu|so sanh|phan biet|tai sao|vi sao|tinh |tom tat|va |hay |hoac |cua no/.test(
      intent,
    )
  )
    return null;
  const terms = questionTopic(question);
  if (!terms.length || terms.length > 6 || /[\d=+*/]/.test(intent)) return null;
  const subject = terms.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const start = new RegExp(
    `^${subject}(?:\\s*\\([^()]+\\))?\\s+(?:la|duoc dinh nghia|ton tai|xuat hien|chi|cho biet)\\b`,
  );
  const selected = new Map();
  for (const source of sources) {
    for (const block of (source.content || '').split(/\n\s*\n/)) {
      // Do not remove layout evidence before checking it.
      if (/[\t|\uE000-\uF8FF]|\S {3,}\S/u.test(block)) continue;
      const text = cleanDocumentText(block);
      for (const passage of text.split(/\n|(?<=[.!?])\s+/u)) {
        const quote = passage.replace(/^(?:Khái niệm|Định nghĩa)\s*:?\s*/iu, '').trim();
        if (quote.length < 30 || quote.length > 650 || !/[.!]$/.test(quote)) continue;
        if (/[?=≈∝]|https?:/iu.test(quote) || !start.test(normalizeConceptText(quote))) continue;
        if (!selected.has(source.documentId)) selected.set(source.documentId, { source, quote });
      }
    }
  }
  if (!selected.size) return null;
  const passages = [...selected.values()];
  return {
    status: 'answered',
    model: 'document-extractive',
    verification: 'chưa kiểm chứng',
    answer: passages
      .map(({ quote }, i) => (passages.length > 1 ? `Nguồn ${i + 1}: ${quote}` : quote))
      .join('\n\n'),
    sources: passages.map(({ source }) => source),
    evidence: passages.map(({ source, quote }) => ({ chunkId: source.chunkId, quote })),
  };
}

// Reserve room for each PDF before spending the context budget on more chunks
// from a single PDF. Context expansion groups stay together when budgeted.
export function synthesisSources(question, sources) {
  const definitions = new Set(
    (definitionRecovery(question, sources)?.sources || []).map((s) => s.chunkId),
  );
  const documents = new Map();
  for (const source of sources) {
    if (!documents.has(source.documentId)) documents.set(source.documentId, []);
    documents.get(source.documentId).push(source);
  }
  for (const chunks of documents.values())
    chunks.sort((a, b) => Number(definitions.has(b.chunkId)) - Number(definitions.has(a.chunkId)));
  const ordered = [];
  for (let i = 0; ordered.length < sources.length; i++)
    for (const chunks of documents.values()) if (chunks[i]) ordered.push(chunks[i]);
  return ordered;
}
