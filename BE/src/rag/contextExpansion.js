const cleaned = new WeakMap();
const content = source => {
  if (!cleaned.has(source)) cleaned.set(source, source.content.split('\n')
    .map(line => line.trim()).filter(line => line && !/^[_=─━.\s]{5,}$/.test(line)
      && !/^(?:Học online|Thầy .*VNA|Trang \d+|Page \d+)/iu.test(line) && !/^\d+$/.test(line)).join('\n'));
  return cleaned.get(source);
};
const heading = /^\s*(?:\d+(?:\.\d+)*[.)]|[a-z][.)]|CHƯƠNG\s|BÀI\s|CHỦ ĐỀ\s)/u;
export function needsContinuation(source) {
  const text = content(source);
  const lines = text.split('\n').filter(Boolean);
  if (!text || !lines.length) return false;
  const last = lines.at(-1);
  return !/[.!?。]$/.test(text) || heading.test(last) || /[:,;=→]$/.test(text);
}
export function continuesSource(source, neighbor) {
  if (source.documentId !== neighbor.documentId || neighbor.chunkOrder !== source.chunkOrder + 1) return false;
  const text = content(neighbor);
  // A new heading without overlap is a different section, not a continuation.
  const overlap = content(source).slice(-120);
  return !heading.test(text.split('\n')[0]) || (overlap.length >= 40 && text.includes(overlap));
}
export function needsPrevious(source) {
  const lines = content(source).split('\n');
  const first = lines[0] || '';
  return first.length > 0 && !lines.some(line => heading.test(line)) && /^[\p{Ll},;)]/u.test(first);
}
