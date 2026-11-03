import { cleanDocumentText } from './documentAnswer.js';

// Give the verifier stable references rather than asking it to retype PDF text.
// Exact evidence is always resolved from the original source on the server.
export function verificationPassages(sources) {
  const passages = new Map();
  const indexed = sources.map((source, i) => {
    const blocks = [];
    for (const line of cleanDocumentText(source.content).split(/\n/).filter(Boolean)) {
      if (line.replace(/\s/gu, '').length < 8 && blocks.length)
        blocks[blocks.length - 1] += '\n' + line;
      else blocks.push(line);
    }
    return {
      id: source.chunkId,
      documentId: source.documentId,
      pageFrom: source.pageFrom,
      pageTo: source.pageTo,
      limitations: source.layoutWarnings || [],
      passages: blocks.map((quote, j) => {
        const id = `s${i}p${j}`;
        passages.set(id, { chunkId: source.chunkId, quote });
        return { id, text: quote };
      }),
    };
  });
  return { sources: indexed, passages };
}
