import { normalizeConceptText } from '../modules/conversations/queryTerms.js';
export const normalizeText = normalizeConceptText;
const stop = new Set('la gi cua va cac nhung mot trong cho toi hay nao duoc trinh bay giai thich'.split(' '));
export const searchTerms = value => (normalizeText(value).match(/[a-z0-9]+/g) || []).filter(word => !stop.has(word) || word === 'bay');

// BM25 postings only; raw PDF text is not retained in the cache.
export class KeywordIndex {
  constructor(maxBytes = 16 * 1024 ** 2) {
    this.maxBytes = maxBytes;
    this.bytes = 0;
    this.documents = new Map();
    this.postings = new Map();
    this.totalLength = 0;
  }
  add(id, content) {
    if (this.documents.has(id)) return;
    const terms = searchTerms(content), frequencies = new Map();
    for (const term of terms) frequencies.set(term, (frequencies.get(term) || 0) + 1);
    const size = 256 + terms.length * 4 + [...frequencies.keys()].reduce((sum, term) => sum + 96 + term.length * 2, 0);
    if (this.bytes + size > this.maxBytes) throw Object.assign(Error('Keyword cache budget exceeded'), { code: 'KEYWORD_BUDGET' });
    this.bytes += size;
    const headings = content.split('\n').filter(line => /^\s*(?:\d+[.)]|[a-z][.)]|CHƯƠNG|BÀI|CHỦ ĐỀ)/u.test(line)).slice(0, 12).join(' ').slice(0, 1200);
    this.documents.set(id, { length: terms.length, heading: normalizeText(headings) });
    this.totalLength += terms.length;
    for (const [term, count] of frequencies) {
      if (!this.postings.has(term)) this.postings.set(term, new Map());
      this.postings.get(term).set(id, count);
    }
  }
  search(query, limit = 20) {
    const terms = [...new Set(searchTerms(query))], scores = new Map(), n = this.documents.size;
    const average = this.totalLength / Math.max(1, n);
    for (const term of terms) {
      const postings = this.postings.get(term);
      if (!postings) continue;
      const idf = Math.log(1 + (n - postings.size + .5) / (postings.size + .5));
      for (const [id, count] of postings) {
        const length = this.documents.get(id).length;
        const score = idf * count * 2.2 / (count + 1.2 * (.25 + .75 * length / Math.max(1, average)));
        scores.set(id, (scores.get(id) || 0) + score);
      }
    }
    return [...scores].map(([chunkId, score]) => ({ chunkId, score }))
      .sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId)).slice(0, limit);
  }
}

export function fuseRankings(semantic, keyword, query, index) {
  const scores = new Map();
  for (const ranking of [semantic, keyword]) for (const [rank, candidate] of ranking.entries()) {
    scores.set(candidate.chunkId, (scores.get(candidate.chunkId) || 0) + 1 / (60 + rank + 1));
  }
  const definition = /là gì|định nghĩa|khái niệm/iu.test(query);
  const subject = searchTerms(normalizeText(query).replace(/\b(?:dinh nghia|khai niem|cong thuc|bieu thuc|cach tinh|trinh bay|giai thich)\b/g, ' ')).join(' ');
  const lexicalIds = new Set(keyword.map(item => item.chunkId));
  return [...scores].map(([chunkId, fusionScore]) => {
    const title = index?.documents.get(chunkId)?.heading || '';
    // Bounded, explainable title rerank; cosine is kept separately for persistence.
    const titleHit = subject.length > 2 && title.includes(subject);
    const semanticItem = semantic.find(item => item.chunkId === chunkId);
    return { chunkId, fusionScore, rankScore: fusionScore + (titleHit ? definition ? .04 : .015 : 0),
      lexicalMatch: lexicalIds.has(chunkId), score: semanticItem?.score ?? 0, scoreMeasured: !!semanticItem };
  }).sort((a, b) => b.rankScore - a.rankScore || a.chunkId.localeCompare(b.chunkId));
}
