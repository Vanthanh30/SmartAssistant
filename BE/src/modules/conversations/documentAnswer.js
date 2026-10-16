// Local extractive ranking. No external provider calls or fabricated summaries.
const accents = 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹ';
const fold = text => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').toLowerCase();
const stop = new Set('la gi cua cac nhung mot nhieu trong tren ve cho toi hay ban the nao tai sao va voi duoc'.split(' '));
export function cleanDocumentText(text) {
  let result = text.normalize('NFC').replace(/\r/g, '');
  // PDF glyph runs split accented syllables: “nhi ệ t”, “đ ộ”, “chuy ể n”.
  const split = new RegExp(`(?<!\\p{L})([\\p{L}]{1,5}) +([${accents}${accents.toUpperCase()}]{1,2}) +(ng|nh|ch|[mnptciuy])(?=\\s|[.,;:!?)]|$)`, 'gu');
  for (let i = 0; i < 2; i++) result = result.replace(split, (_, before, vowel, after) => before + vowel + after);
  const single = new RegExp(`(?<!\\p{L})([bcdfghjklmnpqrstvwxzđĐ]{1,3}) +([${accents}])(?=\\s|[.,;:!?)]|$)`, 'giu');
  result = result.replace(single, '$1$2').replace(/\bcủ a\b/gu,'của').replace(/\bchứ a\b/gu,'chứa');
  return result.split('\n').filter(line => {
    const plain = fold(line).replace(/\s+/g, ' ').trim();
    return plain && !/^[-_=─━.\s]{5,}$/.test(line)
      && !/^(hoc online|thay .*vna|trang \d+|page \d+)/.test(plain)
      && !/^\d+$/.test(plain);
  }).map(line => line.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/ +([,.;:!?])/g, '$1');
}
export function documentAnswer(sources, question = '') {
  const terms = [...new Set(fold(question).match(/[a-z0-9]+/g) || [])].filter(t => !stop.has(t));
  const candidates = [];
  for (const source of sources) {
    const cleaned = cleanDocumentText(source.content || '');
    // Join wrapped PDF lines, but split paragraphs at headings/bullets/sentence ends.
    const paragraphs = cleaned.replace(/\n(?=[*•●▪◦]|\d+[.)]|BÀI |CHƯƠNG )/g, '\n\n')
      .split(/\n\n+/).flatMap(block => block.split(/(?<=[.!?])\s+(?=[\p{Lu}*•])/u))
      .flatMap(block => block.split(/\n(?=[*•●▪◦]|[a-z][.)]\s|\d+[.)]\s)/u));
    let heading = '';
    for (const paragraph of paragraphs) {
      const text = paragraph.replace(/\s+/g, ' ').trim();
      if (text.length < 70 && !/[.!?]$/.test(text) && !/^[*•●▪◦]|[=≈∝]/.test(text)) { heading = text; continue; }
      if (text.length < 20) continue;
      const normalized = fold(text);
      const context = fold(heading);
      const hits = terms.filter(term => new RegExp(`\\b${term}\\b`).test(normalized + ' ' + context)).length;
      if (terms.length && hits < Math.max(1, Math.ceil(terms.length * .65))) continue;
      candidates.push({ source, text, display: formatPassage(paragraph), rank: hits / Math.max(terms.length, 1) + (terms.length && normalized.includes(terms.join(' ')) ? .6 : 0) + (/là gì|khái niệm|định nghĩa/i.test(question) && /cho biết|là |tồn tại|tác dụng/i.test(text) ? .2 : 0) + (normalized.includes(terms.join(' ') + ' cho biet') || normalized.includes(terms.join(' ') + ' la ') ? .8 : 0) + (/là gì|khái niệm|định nghĩa/i.test(question) && /tồn tại/i.test(text) ? .25 : 0) + Math.min(source.score || 0, 1) * .1 - text.length / 20000 });
    }
  }
  candidates.sort((a, b) => b.rank - a.rank);
  const picked = []; const seen = new Set();
  for (const candidate of candidates) {
    const key = fold(candidate.text);
    if (seen.has(key)) continue;
    picked.push(candidate); seen.add(key);
  }
  if (!picked.length) {
    if (!sources.length) return null;
    return { status: 'insufficient_context', model: 'document-extractive', sources: [],
      answer: 'Có nguồn liên quan nhưng chưa tìm được đoạn trả lời rõ cho câu hỏi này. Hãy hỏi cụ thể hơn hoặc mở tài liệu để đối chiếu.' };
  }
  const selected = [...new Map(picked.map(item => [item.source.chunkId, item.source])).values()];
  return { status: 'answered', model: 'document-extractive', sources: selected,
    answer: picked.map(item => item.display).join('\n\n') };
}

// Preserve formula/bullet lines while joining only prose wrapped by PDF layout.
export function formatPassage(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const blocks = [];
  let prose = '';
  const flush = () => { if (prose) blocks.push(prose); prose = ''; };
  for (const line of lines) {
    const formula = /[=≈∝]/.test(line);
    const structural = /^(?:[*•●▪◦]|[-–]\s|[a-z][.)]\s|\d+[.)]\s|BÀI |CHƯƠNG )/.test(line) || /:$/.test(line);
    if (formula || structural) { flush(); blocks.push(line); }
    else if (blocks.length && /^[*•●▪◦]/.test(blocks.at(-1)) && !/[.!?:]$/.test(blocks.at(-1))) blocks[blocks.length - 1] += ' ' + line;
    else { prose += (prose ? ' ' : '') + line; if (/[.!?]$/.test(line)) flush(); }
  }
  flush();
  return blocks.join('\n\n');
}
