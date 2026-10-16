import { createHash } from 'node:crypto';
import { questionVariants, relation } from './questionRules.js';
import { AppError } from '../../shared/AppError.js';
import { learningText, readableProse, separateHeadings } from './sourceText.js';
import { formulaFacts, formulaVariants } from './formulaQuestions.js';
const key = value => value.normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();
const MAX_TEXT_PER_DOCUMENT = 128000;
const MAX_FACTS_PER_DOCUMENT = 128;
const MAX_FACTS_PER_SAMPLE = 4;
// Bounded source facts feed explicit-relation and full-statement questions.
export function extractFacts(sources) {
  const facts = []; const seen = new Set();
  const budgets = new Map();
  for (const source of sources) {
    const usage = budgets.get(source.documentId) || { text: 0, facts: 0 };
    budgets.set(source.documentId, usage);
    const remaining = MAX_TEXT_PER_DOCUMENT - usage.text;
    if (remaining <= 0 || usage.facts >= MAX_FACTS_PER_DOCUMENT) continue;
    const raw = source.content || '';
    const limit = Math.min(remaining, 4000);
    const bounded = raw.length > limit ? raw.slice(0, Math.max(0, raw.lastIndexOf('\n', limit))) : raw;
    usage.text += bounded.length;
    let sampleFacts = 0;
    const text = separateHeadings(learningText(bounded)).split('\n').filter(line => {
      const letters = line.match(/\p{L}/gu) || [];
      const capitals = line.match(/\p{Lu}/gu) || [];
      return !/^(?:BÀI|CHƯƠNG|CHỦ ĐỀ|TỔNG HỢP|TỔNG HỢ P)\b/u.test(line)
        && !(letters.length > 15 && capitals.length / letters.length > .7);
    }).join('\n').replace(/\n(?=[*•●▪◦]|\d+[.)]\s|[a-z][.)]\s)/g, '\n\n');
    for (const block of text.split(/\n\n+/)) {
      const prose = block.replace(/\n/g, ' ').replace(/\s+/g, ' ');
      for (const part of prose.split(/(?<=[.!?;])\s+|[•●▪◦]|\s\*\s/u)) {
        const sentence = part.replace(/^(?:[*•●▪◦+−-]\s*|\(?\d+[.)]\s*|[a-z][.)]\s*)/, '').trim();
        if (sentence.length < 25 || sentence.length > 500 || /[=≈∝]|https?:\/\/|www\./i.test(sentence)) continue;
        if (!/[.!?]$/.test(sentence) || !readableProse(sentence)) continue;
        if ((sentence.match(/\p{L}/gu) || []).length / sentence.length < .65) continue;
        const identity = key(sentence);
        if (seen.has(identity)) continue;
        seen.add(identity);
        facts.push({ sentence, source });
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
    const facts = [...extractFacts(sources), ...formulaFacts(sources)]; const items = [];
    const seed = createHash('sha256').update(input.requestId || input.title || '').digest();
    const pools = new Map();
    const variantUsage = new Map();
    const sections = new Map();
    for (const fact of facts) {
      const documentId = fact.source.documentId;
      if (!pools.has(documentId)) pools.set(documentId, []);
      pools.get(documentId).push(fact);
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
    // Interleave verified formula facts instead of leaving all math at the end.
    const prose = ordered.filter(fact => !fact.formula);
    const math = ordered.filter(fact => fact.formula).sort((a,b) => {
      const product = value => /^[A-Za-z]\s*=\s*[A-Za-zλρν]\s*[.·×*]\s*[A-Za-zλρν]$/u.test(value);
      return Number(product(b.formula)) - Number(product(a.formula));
    });
    const candidates = [];
    let proseIndex = 0; let mathIndex = 0;
    while (proseIndex < prose.length || mathIndex < math.length) {
      if (mathIndex < math.length && (candidates.length % 4 === 2 || proseIndex >= prose.length)) candidates.push(math[mathIndex++]);
      else if (proseIndex < prose.length) candidates.push(prose[proseIndex++]);
      else break;
    }
    for (const fact of candidates) {
      const { sentence, source } = fact;
      if (input.kind === 'flashcards') {
        const explicit = relation(sentence);
        const condition = sentence.match(/^Khi (.{12,160}?) thì (.{12,250})[.!]$/u);
        if ((!explicit && !condition && !fact.formula) || (fact.formula && !fact.topic)) continue;
        items.push({ prompt: fact.formula ? `Nêu biểu thức được dùng trong phần “${fact.topic}”.`
          : condition ? `Điều gì xảy ra khi ${condition[1]}?`
          : explicit.verb.endsWith('là') ? `${explicit.subject} ${explicit.verb} gì?`
          : explicit.verb === 'có' ? `${explicit.subject} có đặc điểm nào?` : `${explicit.subject} có vai trò hoặc công dụng gì?`,
        answer: fact.formula || (condition ? condition[2] : explicit.detail), evidenceText: sentence, citedChunkIds: [String(source.chunkId)] });
      } else {
        const pool = pools.get(source.documentId);
        const variants = fact.formula ? formulaVariants(fact, pool, seed[items.length % seed.length]) : questionVariants(fact, pool);
        variants.sort((a,b) => (variantUsage.get(a.type) || 0) - (variantUsage.get(b.type) || 0));
        const variant = variants[0];
        if (!variant) continue;
        const choices = [...variant.distractors];
        const correctIndex = seed[items.length % seed.length] % 4;
        choices.splice(correctIndex, 0, variant.answer);
        items.push({ prompt: variant.prompt, choices, correctIndex,
          explanation: variant.explanation || `Nội dung nguồn: ${sentence}`, evidenceText: sentence, citedChunkIds: [String(source.chunkId)] });
        variantUsage.set(variant.type, (variantUsage.get(variant.type) || 0) + 1);
      }
      if (items.length === input.count) break;
    }
    if (items.length !== input.count) throw new AppError(422,'INSUFFICIENT_SOURCE',
      `Chỉ tìm được ${items.length} ${input.kind === 'quiz' ? 'câu hỏi có đủ 4 lựa chọn' : 'thẻ'} phù hợp. Hãy giảm số mục hoặc chọn thêm PDF có văn bản rõ; công thức lỗi không được dùng để tạo bộ học.`);
    const cited = new Set(items.flatMap(item => item.citedChunkIds));
    const retained = sources.filter(source => cited.has(String(source.chunkId)));
    await verify(retained);
    return { items, sources: retained, model: 'document-rules-v4' };
  };
}
