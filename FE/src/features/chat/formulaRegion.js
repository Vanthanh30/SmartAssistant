// Match text anchors, then retain the surrounding pixels (not reconstructed maths).
const fold = text => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').toLowerCase();
const ignored = new Set('cong thuc tinh la gi cua cac trong cho toi hay va voi nao'.split(' '));
export function normalizeAnchor(text) {
  return fold(text).replace(/\s+/g, ' ').trim();
}

export function locateFormulaRegion(items, viewport, question) {
  const terms = [...new Set(normalizeAnchor(question).match(/[a-z0-9]+/g) || [])].filter(term => !ignored.has(term));
  if (!terms.length) return null;
  const boxes = items.filter(item => typeof item.str === 'string' && item.str.trim() && item.transform)
    .map(item => {
      const [x, y] = item.transform.slice(4);
      const height = item.height || Math.hypot(item.transform[2], item.transform[3]) || 10;
      const [a, b, c, d, e, f] = viewport.transform;
      const point = (px, py) => [a * px + c * py + e, b * px + d * py + f];
      const rect = [...point(x, y), ...point(x + item.width, y + height)];
      return { text: item.str, left: Math.min(rect[0], rect[2]), right: Math.max(rect[0], rect[2]),
        top: Math.min(rect[1], rect[3]), bottom: Math.max(rect[1], rect[3]) };
    }).filter(box => [box.left, box.right, box.top, box.bottom].every(Number.isFinite));
  const rows = [];
  for (const box of boxes.sort((a, b) => a.top - b.top || a.left - b.left)) {
    const row = rows.find(row => Math.abs(row.top - box.top) < 5);
    if (row) { row.boxes.push(box); row.bottom = Math.max(row.bottom, box.bottom); }
    else rows.push({ top: box.top, bottom: box.bottom, boxes: [box] });
  }
  // PDF item strings are concatenated without inserting artificial glyph spaces.
  for (const row of rows) {
    row.boxes.sort((a, b) => a.left - b.left);
    let text = '';
    row.boxes.forEach((box, index) => {
      const previous = row.boxes[index - 1];
      text += (previous && box.left - previous.right > 2 ? ' ' : '') + box.text;
    });
    row.text = normalizeAnchor(text);
    row.score = terms.filter(term => new RegExp(`\\b${term}\\b`).test(row.text)).length / terms.length;
    if (row.text.includes(terms.join(' '))) row.score += .5;
  }
  const ranked = rows.filter(row => row.score >= .5).sort((a, b) => b.score - a.score);
  for (const anchor of ranked) {
    const nearby = rows.filter(row => row.top >= anchor.top - 25 && row.top <= anchor.bottom + 110);
    if (!nearby.some(row => /[=≈∝]/.test(row.text))) continue;
    const nextSection = nearby.find(row => row.top > anchor.bottom + 15 && /^(?:\d+|[a-z])[.)]\s*/.test(row.text));
    const regionBoxes = nearby.filter(row => !nextSection || row.top < nextSection.top).flatMap(row => row.boxes);
    const left = Math.max(0, Math.min(...regionBoxes.map(box => box.left)) - 18);
    const right = Math.min(viewport.width, Math.max(...regionBoxes.map(box => box.right)) + 18);
    const top = Math.max(0, anchor.top - 8);
    const bottom = Math.min(viewport.height, nextSection ? nextSection.top - 6 : Infinity, Math.max(...regionBoxes.map(box => box.bottom)) + 12);
    if (right > left && bottom > top) return { left, top, width: right - left, height: bottom - top, score: anchor.score };
  }
  return null;
}
