import { createHash } from 'node:crypto';
import { AppError } from '../../shared/AppError.js';
import { cleanDocumentText } from '../conversations/documentAnswer.js';
const key = value => value.normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();
const stop = new Set('những các một được trong trên dưới này đó và hay của với cho khi thì nhưng hoặc rằng không cũng đang đã sẽ lại từ đến như là có bằng'.split(' '));
const MAX_TEXT_PER_DOCUMENT = 32000;
const MAX_FACTS_PER_DOCUMENT = 128;
const MAX_FACTS_PER_SAMPLE = 4;
// Exact-quotation cloze items do not assert invented scientific facts.
export function extractFacts(sources) {
  const facts = []; const seen = new Set();
  const budgets = new Map();
  for (const source of sources) {
    const usage = budgets.get(source.documentId) || { text: 0, facts: 0 };
    budgets.set(source.documentId, usage);
    const remaining = MAX_TEXT_PER_DOCUMENT - usage.text;
    if (remaining <= 0 || usage.facts >= MAX_FACTS_PER_DOCUMENT) continue;
    const bounded = (source.content || '').slice(0, Math.min(remaining, 1000));
    usage.text += bounded.length;
    let sampleFacts = 0;
    const text = cleanDocumentText(bounded).split('\n').filter(line => {
      const letters = line.match(/\p{L}/gu) || [];
      const capitals = line.match(/\p{Lu}/gu) || [];
      return !/^(?:BÀI|CHƯƠNG|CHỦ ĐỀ|TỔNG HỢP|TỔNG HỢ P)\b/u.test(line)
        && !(letters.length > 15 && capitals.length / letters.length > .7);
    }).join('\n').replace(/\n(?=[*•●▪◦]|\d+[.)]\s|[a-z][.)]\s)/g, '\n\n');
    for (const block of text.split(/\n\n+/)) {
      const prose = block.replace(/\n/g, ' ').replace(/\s+/g, ' ');
      for (const part of prose.split(/(?<=[.!?;])\s+|[•●▪◦]|\s\*\s/u)) {
        const sentence = part.replace(/^(?:[*•●▪◦-]\s*|\d+[.)]\s*|[a-z][.)]\s*)/, '').trim();
        if (sentence.length < 40 || sentence.length > 500 || /[=≈∝]|https?:\/\/|www\./i.test(sentence)) continue;
        if (!/[.!?]$/.test(sentence)) continue;
        if ((sentence.match(/\p{L}/gu) || []).length / sentence.length < .65) continue;
        const identity = key(sentence);
        if (seen.has(identity)) continue;
        const words = [...sentence.matchAll(/(?<![\p{L}\p{N}])[\p{L}][\p{L}\p{N}-]{2,24}(?![\p{L}\p{N}])/gu)]
          .filter(match => !stop.has(key(match[0])) && match.index > 0);
        words.sort((a,b) => b[0].length-a[0].length || a.index-b.index);
        const target = words.find(word => sentence.split(word[0]).length === 2);
        if (!target) continue;
        seen.add(identity);
        facts.push({ sentence, target: target[0], offset: target.index, source });
        usage.facts++;
        sampleFacts++;
        if (usage.facts >= MAX_FACTS_PER_DOCUMENT || sampleFacts >= MAX_FACTS_PER_SAMPLE) break;
      }
      if (usage.facts >= MAX_FACTS_PER_DOCUMENT || sampleFacts >= MAX_FACTS_PER_SAMPLE) break;
    }
  }
  return facts;
}
export function learningProvider() {
  return async (input, sources, verify) => {
    const facts = extractFacts(sources); const items = [];
    const seed = createHash('sha256').update(input.requestId || input.title || '').digest();
    const targets = new Map();
    const sections = new Map();
    for (const fact of facts) {
      const documentId = fact.source.documentId;
      if (!targets.has(documentId)) targets.set(documentId, new Map());
      targets.get(documentId).set(key(fact.target), fact.target);
      if (!sections.has(documentId)) sections.set(documentId, new Map());
      const part = `${fact.source.sectionBin}:${fact.source.pageFrom}`;
      if (!sections.get(documentId).has(part)) sections.get(documentId).set(part, []);
      sections.get(documentId).get(part).push(fact);
    }
    // Rotate strata deterministically, then alternate documents and parts before reusing one part.
    const documentGroups = [...sections.values()].map(parts => {
      const groups = [...parts.values()]; const offset = seed[0] % groups.length;
      return [...groups.slice(offset), ...groups.slice(0,offset)].map(values => ({ values, cursor: 0 }));
    });
    const documentOffset = seed[1] % Math.max(1, documentGroups.length);
    const documents = [...documentGroups.slice(documentOffset), ...documentGroups.slice(0,documentOffset)];
    const ordered = [];
    for (let round=0; ordered.length<facts.length; round++) {
      let added = false;
      for (const groups of documents) {
        for (let n=0;n<groups.length;n++) {
          const group = groups[(round+n)%groups.length];
          if (group.cursor < group.values.length) { ordered.push(group.values[group.cursor++]); added = true; break; }
        }
      }
      if (!added) break;
    }
    for (const fact of ordered) {
      const { sentence, target, offset, source } = fact;
      const quote = sentence.slice(0,offset) + '____' + sentence.slice(offset+target.length);
      const prompt = `Điền từ còn thiếu theo nguyên văn tài liệu: “${quote}”`;
      if (input.kind === 'flashcards') {
        items.push({ prompt, answer: `${target}\n\n${sentence}`, citedChunkIds: [String(source.chunkId)] });
      } else {
        const distractors = [];
        const sentenceKey = key(sentence); const targetKey = key(target);
        for (const [identity,value] of targets.get(source.documentId)) {
          if (identity !== targetKey && !sentenceKey.includes(identity)) distractors.push(value);
          if (distractors.length === 3) break;
        }
        if (distractors.length !== 3) continue;
        const choices = [...distractors]; const correctIndex = seed[items.length % seed.length] % 4;
        choices.splice(correctIndex,0,target);
        items.push({ prompt, choices, correctIndex, explanation: `Nguyên văn tài liệu: ${sentence}`, citedChunkIds: [String(source.chunkId)] });
      }
      if (items.length === input.count) break;
    }
    if (items.length !== input.count) throw new AppError(422,'INSUFFICIENT_SOURCE',
      `Chỉ tìm được ${items.length} ${input.kind === 'quiz' ? 'câu hỏi có đủ 4 lựa chọn' : 'thẻ'} phù hợp. Hãy giảm số mục hoặc chọn thêm PDF có văn bản rõ; công thức lỗi không được dùng để tạo bộ học.`);
    const cited = new Set(items.flatMap(item => item.citedChunkIds));
    const retained = sources.filter(source => cited.has(String(source.chunkId)));
    await verify(retained);
    return { items, sources: retained, model: 'document-rules-v2' };
  };
}
