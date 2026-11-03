import { createHash } from 'node:crypto';
const compact = (text) => text.normalize('NFC').replace(/\s/gu, '');
// Replace only one exact source anchor, at its location in the explanation.
// Never append unrelated crops at the end or guess where a paraphrase belongs.
export function placeSourceMedia(blocks, media) {
  const needle = compact(media.source?.anchor || '');
  if (!needle) return null;
  const matches = [];
  for (const [index, block] of blocks.entries()) {
    if (block.type !== 'paragraph' || !block.text) continue;
    const offsets = [],
      normalized = [];
    for (let i = 0; i < block.text.length; i++)
      if (!/\s/u.test(block.text[i])) {
        offsets.push(i);
        normalized.push(block.text[i]);
      }
    const text = normalized.join('');
    for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + needle.length))
      matches.push({ index, start: offsets[at], end: offsets[at + needle.length - 1] + 1 });
  }
  if (matches.length !== 1) return null;
  const { index, start, end } = matches[0],
    block = blocks[index];
  const paragraph = (text, suffix) => ({
    id: createHash('sha256').update(`${block.id}:${suffix}`).digest('hex').slice(0, 24),
    type: 'paragraph',
    text: text.trim(),
  });
  const before = paragraph(block.text.slice(0, start), 'before'),
    after = paragraph(block.text.slice(end), 'after');
  return [
    ...blocks.slice(0, index),
    ...(before.text ? [before] : []),
    { ...media, ...(media.type === 'formula_image' ? { text: '' } : {}) },
    ...(after.text ? [after] : []),
    ...blocks.slice(index + 1),
  ];
}

const equationHeads = (text) =>
  [...text.matchAll(/(?:^|[\s;])([\p{L}](?:[\p{L}\p{N}_{}₀-₉]|\u20d7){0,20})\s*[=≈∝]/gu)].map(
    (match) => compact(match[1]),
  );

// A model may flatten a fraction differently from the PDF text. Only substitute
// a standalone equation when exactly one cited, question-focused source formula
// has the same left-hand quantity. Ambiguous matches must stay unplaced.
export function placeFormulaReference(blocks, media, candidates) {
  const heads = equationHeads(media.source?.anchor || '');
  if (!heads.length) return null;
  const matches = [];
  for (const [index, block] of blocks.entries()) {
    if (block.type !== 'paragraph' || !block.text) continue;
    let offset = 0;
    for (const line of block.text.split('\n')) {
      const colon = line.indexOf(':');
      const expression = (colon >= 0 ? line.slice(colon + 1) : line).trim();
      // Preserve prose, labels and conditions; don't treat an entire explanation as math.
      if (expression && !/[ăâđêôơư\u1EA0-\u1EF9]/iu.test(expression) && /[=≈∝]/u.test(expression)) {
        const terms = expression.match(/\p{L}+/gu) || [];
        const lhs = equationHeads(expression);
        const eligible = candidates.filter((candidate) =>
          lhs.some((head) => equationHeads(candidate.source?.anchor || '').includes(head)),
        );
        const identities = new Set(
          eligible.map((candidate) =>
            JSON.stringify([
              candidate.source?.documentId,
              candidate.source?.pageFrom,
              compact(candidate.source?.anchor || ''),
            ]),
          ),
        );
        if (
          terms.every((term) => term.length <= 8) &&
          lhs.length &&
          lhs.every((head) => heads.includes(head)) &&
          identities.size === 1
        ) {
          const start = offset + (colon >= 0 ? colon + 1 : 0);
          matches.push({ index, start, end: offset + line.length });
        }
      }
      offset += line.length + 1;
    }
  }
  if (matches.length !== 1) return null;
  const { index, start, end } = matches[0],
    block = blocks[index];
  const paragraph = (text, suffix) => ({
    id: createHash('sha256').update(`${block.id}:${suffix}`).digest('hex').slice(0, 24),
    type: 'paragraph',
    text: text.trim(),
  });
  const before = paragraph(block.text.slice(0, start), 'before-formula'),
    after = paragraph(block.text.slice(end), 'after-formula');
  return [
    ...blocks.slice(0, index),
    ...(before.text ? [before] : []),
    { ...media, ...(media.type === 'formula_image' ? { text: '' } : {}) },
    ...(after.text ? [after] : []),
    ...blocks.slice(index + 1),
  ];
}
