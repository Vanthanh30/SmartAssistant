import { createHash } from 'node:crypto';
import { cleanDocumentText } from './documentAnswer.js';

const compact = text => text.normalize('NFC').replace(/\s/gu, '');
// Conservative allowlist: only a complete plain scalar equality is rendered as text.
// Typography-dependent fractions, scripts, unknown glyphs and scattered symbols use source pixels.
function kind(text) {
  const damaged = /[\uFFFD\uE000-\uF8FF]|^[=≈∝]|[=≈∝]$|[=≈∝]\s*[=≈∝]|\b\d+\s+\d+\b/.test(text);
  const symbolic = /[=≈∝∫√∑±∞α-ωΑ-Ω²³⁰-⁹₀-₉]|\b(?:[A-Za-z]\s+){2,}[A-Za-z]\b/.test(text);
  if (!symbolic && !damaged) return 'paragraph';
  const term = '(?:[A-Za-z]+|[0-9]+(?:[.,][0-9]+)?)';
  const expression = term + '(?:\\s*[.·×*+\\-]\\s*' + term + ')*';
  const simple = new RegExp('^' + expression + '\\s*=\\s*' + expression + '$').test(text)
    && !/[Δδ^_²³⁰-⁹₀-₉]/.test(text) && !/\b[A-Za-z]\s+\d|\b\d\s+[A-Za-z]/.test(text);
  return simple && !damaged ? 'formula_text' : 'formula_image';
}
function sourceFor(text, sources, occurrence = 0) {
  const needle = compact(text);
  if (!needle) return null;
  const matches = [];
  for (const source of sources) {
    // Prefer original offsets (including page map); cleaned matching is explicitly marked uncertain.
    for (const [basis, value] of [['raw', source.content], ['cleaned', cleanDocumentText(source.content)]]) {
      const offsets = []; let normalized = '';
      for (let i=0; i<value.length; i++) if (!/\s/u.test(value[i])) { offsets.push(i); normalized += value[i]; }
      let start = normalized.indexOf(needle);
      for (let i=0; i<occurrence && start>=0; i++) start=normalized.indexOf(needle,start+needle.length);
      if (start < 0) continue;
      const from = offsets[start]; const to = offsets[start + needle.length - 1] + 1;
      let pages = [];
      if (basis === 'raw') {
        const map = typeof source.pageMap === 'string' ? JSON.parse(source.pageMap) : source.pageMap || [];
        pages = map.filter(page => page.start < source.sourceStart + to && page.end > source.sourceStart + from).map(page => page.page);
      }
      matches.push({ documentId: source.documentId, chunkId: source.chunkId,
        pageFrom: pages[0] || source.pageFrom, pageTo: pages.at(-1) || source.pageTo,
        start: from, end: to, offsetBasis: basis, anchor: text,
        prefix: value.slice(Math.max(0, from - 120), from), suffix: value.slice(to, to + 120) });
      break;
    }
  }
  // Overlapping chunks may contain the same exact passage. Deterministically select one verified source.
  return matches[0] || null;
}
export function presentationBlocks(answer, sources) {
  const rawLines = answer.split(/\n+/).map(text => text.trim()).filter(Boolean);
  const lines = [];
  const fragment = text => {
    // PDF math is often extracted as several short Latin/symbol runs; Vietnamese prose is not a run.
    const words=text.match(/\p{L}+/gu)||[];
    return words.every(word=>/^[A-Za-zα-ωΑ-Ω]+$/.test(word)&&word.length<=5)
      && /[A-Za-zα-ωΑ-Ω\d=≈∝\uFFFD\uE000-\uF8FF]/.test(text);
  };
  for (const raw of rawLines) {
    // Keep the topic label as text even when PDF extraction puts '=' on the heading line.
    const heading=raw.match(/^((?:[a-z]|\d+)[.)]\s+[^:]+:)\s*(.*)$/u);
    const previous=lines.at(-1);
    if (!heading && previous?.math && fragment(raw) && !/[=≈∝]/.test(raw)) {
      const anchor=previous.anchor+'\n'+raw;
      if(sourceFor(anchor,sources)) { previous.text+='\n'+raw;previous.anchor=anchor;continue; }
    }
    if(heading && heading[2] && kind(heading[2])!=='paragraph') {
      lines.push({text:heading[1],anchor:heading[1],heading:true,math:false});
      lines.push({text:heading[2],anchor:raw,math:true});
    } else lines.push({text:raw,anchor:raw,math:kind(raw)!=='paragraph'});
  }
  const occurrences=new Map();const seen=new Set();const blocks=[];
  for(const [index,line] of lines.entries()) {
    const key=compact(line.anchor);const occurrence=occurrences.get(key)||0;occurrences.set(key,occurrence+1);
    const source=sourceFor(line.anchor,sources,occurrence);
    let type=line.heading?'paragraph':kind(line.text);
    if(type==='formula_text'&&source?.offsetBasis!=='raw')type='formula_image';
    const bullet=line.text.match(/^(?:[*•●▪◦]|[-–]\s)\s*(.+)$/u);
    // Repeated overlapping chunk passages must not create repeated image blocks.
    const identity=JSON.stringify([type,source?.documentId,source?.pageFrom,key]);
    if(seen.has(identity))continue;seen.add(identity);
    const id=createHash('sha256').update(JSON.stringify([index,line.text,source])).digest('hex').slice(0,24);
    blocks.push({id,type:type==='paragraph'&&bullet?'list':type,
      ...(type==='paragraph'&&bullet?{items:[bullet[1]]}:{text:line.text}),
      ...(line.heading||type==='paragraph'&&/^(?:[a-z][.)]\s|\d+[.)]\s|BÀI\s|CHƯƠNG\s)|:$/.test(line.text)?{heading:true}:{}),
      ...(source?{source}:{})});
  }
  return blocks;
}
export function storedBlocks(value) {
  if (!value) return null;
  try { const blocks = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(blocks) ? blocks : null; }
  catch { return null; }
}
