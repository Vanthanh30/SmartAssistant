import { cleanDocumentText } from '../conversations/documentAnswer.js';

// Repair known Vietnamese glyph splits only. Never join/guess mathematical symbols.
export function learningText(value) {
  let text = cleanDocumentText(value || '');
  const repairs = [
    [/nhiệt\s+độc\s*ủ\s*a/gu, 'nhiệt độ của'],
    [/độcủa/gu, 'độ của'], [/độchất/gu, 'độ chất'],
    [/toàn\s+bộchất/gu, 'toàn bộ chất'],
    [/chết\s*ạ\s*o/gu, 'chế tạo'],
    [/tạ\s+o/gu, 'tạo'], [/dự\s+a/gu, 'dựa'], [/lự\s+a/gu, 'lựa'],
    [/gi\s+ữ\s*a/gu, 'giữa'], [/thu\s+ỷ/gu, 'thuỷ'],
    [/nhự\s+a/gu, 'nhựa'], [/cảmứng/gu, 'cảm ứng'], [/phầnứng/gu, 'phần ứng'], [/sưởiấm/gu, 'sưởi ấm'],
    [/phảnứng/gu, 'phản ứng'], [/phân tửcấu/gu, 'phân tử cấu'],
    [/raở/gu, 'ra ở'], [/ởmặt/gu, 'ở mặt'],
    [/gi\s+ữ/gu, 'giữ'], [/to\s+ạ\s+độ/gu, 'tọa độ'],
    [/h\s+ình/gu, 'hình'], [/m\s+áy/gu, 'máy'], [/ph\s+át/gu, 'phát'], [/đ\s+ơn/gu, 'đơn'],
  ];
  for (const [pattern, replacement] of repairs) text = text.replace(new RegExp(pattern.source, 'giu'), match =>
    /^\p{Lu}/u.test(match) ? replacement[0].toLocaleUpperCase('vi') + replacement.slice(1) : replacement);
  return text;
}

export function readableProse(sentence) {
  if (!/^\p{Lu}/u.test(sentence) || /[\uFFFD\uE000-\uF8FF=≈∝]/u.test(sentence)) return false;
  if (/^(?:Gồm|Hợp bởi|Với|Ví dụ|Hình|Phương án|Đơn vị|Khi toàn bộ)\b/u.test(sentence)) return false;
  if (/\b(?:Hình|hình)\s+\d|https?:\/\/|www\./u.test(sentence)) return false;
  if (/[;:]$/.test(sentence) || (sentence.match(/[()]/g) || []).length % 2) return false;
  if ((sentence.match(/\p{L}/gu) || []).length / sentence.length < .7) return false;
  // Many title-case cells in one sentence indicate a flattened multi-column table.
  if ((sentence.match(/(?:^|\s)\p{Lu}\p{Ll}+/gu) || []).length > 4) return false;
  // Runs of isolated glyphs signal extraction damage, not reliable theory.
  return !/(?:\p{L}\s+){3,}\p{L}(?:\s|$)/u.test(sentence);
}

export function separateHeadings(text) {
  const lines = text.replace(/Hình\s+\d+(?:[.,]\d+)*[^\n]*/gu, '\n\n')
    .replace(/\nLà\s+/gu, ' là ').split('\n');
  return lines.map((line, index) => {
    const next = lines[index + 1] || '';
    // A short title followed by a new explicit assertion is not its subject.
    const heading = /^\p{Lu}/u.test(line) && line.length < 100 && !/[.!?;:]$/.test(line)
      && !/\s(?:là|có|gồm|được|thì|và|của)\s/u.test(line)
      && /^\p{Lu}/u.test(next) && /\s(?:là|có|được)(?:\s|$)/u.test(next);
    return heading ? `\n\n${line}\n\n` : line;
  }).join('\n');
}

export function topicHeading(line) {
  const match = line.match(/^(?:\d+[.)]|[IVX]+[.)])\s+(.{4,100})$/u);
  if (!match || /[=\uFFFD\uE000-\uF8FF]/u.test(match[1])) return null;
  return match[1].replace(/[:.]$/, '').trim();
}
