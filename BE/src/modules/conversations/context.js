// Bounded neighbour discovery preserves complete chunks and section boundaries.
// Exact LLM token counting happens in provider.fit, never by slicing source text.
import { cleanDocumentText } from './documentAnswer.js';
import { conversationRepository } from './repository.js';
const heading = /^(?:BÀI\s+\d+|CHƯƠNG\s+\d+|PHẦN\s+\d+|[IVX]+[.)]\s+|\d+(?:\.\d+)*[.)]\s+)[^\n]+|^[^\n•*]{3,100}:$/gmu;
export async function expandContext(db, owner, course, sources, seedLimit) {
  if (!sources.length) return [];
  const seeds = sources.slice(0, seedLimit);
  const conditions = seeds.map(() => '(ch.document_id=? AND ch.chunk_order BETWEEN ? AND ?)');
  const args = seeds.flatMap(s => [s.documentId, Math.max(0, s.chunkOrder - 12), s.chunkOrder + 12]);
  const [rows] = await conversationRepository(db).neighbours(conditions, [owner, course, ...args]);
  const selected = new Map();
  for (const seed of seeds) {
    const neighbours = rows.filter(row => String(row.document_id) === seed.documentId
      && row.chunk_order >= seed.chunkOrder - 12 && row.chunk_order <= seed.chunkOrder + 12);
    const anchor = neighbours.findIndex(row => row.id === seed.chunkId);
    if (anchor < 0) continue;
    let from = anchor; let to = anchor;
    const hasHeading = row => [...cleanDocumentText(row.content).matchAll(heading)].length > 0;
    // Include the boundary chunk intact: it may hold the end of the previous section.
    while (from > 0 && !hasHeading(neighbours[from])) from--;
    while (to + 1 < neighbours.length) {
      to++;
      if (hasHeading(neighbours[to])) break;
    }
    const incomplete = (!hasHeading(neighbours[to]) && neighbours[to].chunk_order === seed.chunkOrder + 12)
      || (!hasHeading(neighbours[from]) && neighbours[from].chunk_order > 0 && from === 0);
    for (const row of neighbours.slice(from, to + 1)) {
      const old = selected.get(row.id);
      selected.set(row.id, { chunkId: row.id, documentId: String(row.document_id), content: row.content,
        pageFrom: row.page_from, pageTo: row.page_to, chunkOrder: row.chunk_order,
        fileName: row.original_name, score: Math.max(old?.score ?? -1, seed.score),
        contextIncomplete: !!old?.contextIncomplete || incomplete });
    }
  }
  // Contiguous chunks form atomic groups: token fitting drops a whole group, not its tail.
  const ordered = [...selected.values()].sort((a,b) => a.documentId.localeCompare(b.documentId) || a.chunkOrder - b.chunkOrder);
  let previous; let group;
  for (const source of ordered) {
    if (!previous || previous.documentId !== source.documentId || source.chunkOrder !== previous.chunkOrder + 1) group = source.chunkId;
    source.contextGroup = group;
    previous = source;
  }
  const groupScores = new Map();
  for (const source of ordered) groupScores.set(source.contextGroup, Math.max(groupScores.get(source.contextGroup) ?? -1, source.score));
  return ordered.sort((a,b) => groupScores.get(b.contextGroup) - groupScores.get(a.contextGroup)
    || a.contextGroup.localeCompare(b.contextGroup) || a.chunkOrder - b.chunkOrder);
}
