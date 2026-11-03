import {
  geometryRows,
  columnReadingOrder,
  pdfTextLines,
} from '../../../FE/src/features/chat/pdfTextGeometry.js';

const fold = (text) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();
const header =
  /\b(?:chi tieu|dai luong|gia tri|don vi|thong so|ten|loai|chuc nang|dac diem|quantity|value|unit|name|type)\b/;
const sameColumns = (a, b) =>
  a.cells.length === b.cells.length &&
  a.cells.every((c, i) => Math.abs(c.left - b.cells[i].left) <= Math.max(a.height, b.height));

function tables(rows) {
  const found = [];
  for (let i = 0; i < rows.length; i++) {
    const first = rows[i];
    if (first.cells.length < 2 || first.cells.length > 6 || !header.test(fold(first.text)))
      continue;
    if (
      first.cells.some((c) => !/\p{L}/u.test(c.text)) ||
      new Set(first.cells.map((c) => fold(c.text.trim()))).size !== first.cells.length
    )
      continue;
    const group = [first];
    let next = i + 1;
    while (
      next < rows.length &&
      sameColumns(first, rows[next]) &&
      rows[next - 1].y - rows[next].y <= first.height * 2.8
    )
      group.push(rows[next++]);
    const numeric = group
      .slice(1)
      .filter((row) =>
        row.cells.some((c) => /^[−+-]?\d+(?:[.,]\d+)*(?:\s*[%°\p{L}/²³]+)?$/u.test(c.text.trim())),
      ).length;
    if (
      group.length < 3 ||
      numeric < 2 ||
      group.some((r) => r.cells.some((c) => c.text.length > 100))
    )
      continue;
    found.push({ rows: group, header: first.cells.map((c) => c.text) });
    i = next - 1;
  }
  return found;
}
const rectangle = (row) => ({
  left: row.left,
  bottom: row.y,
  top: row.y + row.height,
  right: row.right,
});
export function analyzePdfPage(items, { width, height, rotation = 0, viewBox }, pageNumber = 1) {
  const warnings = [];
  const valid = items.filter(
    (i) =>
      typeof i.str === 'string' &&
      i.str.trim() &&
      Array.isArray(i.transform) &&
      i.transform.length === 6 &&
      i.transform.every(Number.isFinite) &&
      Number.isFinite(i.width) &&
      i.width >= 0,
  );
  if (valid.length !== items.filter((i) => i.str?.trim()).length)
    warnings.push('invalid-text-geometry');
  if (!valid.length)
    return {
      pageNumber,
      text: '',
      blocks: [],
      columns: 0,
      width,
      height,
      warnings: [...warnings, 'no-text-layer'],
    };
  const rotated =
    rotation % 360 !== 0 ||
    valid.some((i) => Math.abs(Math.atan2(i.transform[1], i.transform[0])) > 0.05);
  const offsetOrigin = Array.isArray(viewBox) && (viewBox[0] !== 0 || viewBox[1] !== 0);
  if (offsetOrigin && !warnings.includes('invalid-text-geometry'))
    warnings.push('invalid-text-geometry');
  if (rotated) warnings.push('rotated-text');
  const rows = geometryRows(valid),
    detected = rotated || offsetOrigin ? [] : tables(rows);
  const tableRows = new Set(detected.flatMap((t) => t.rows.map((r) => r.index)));
  const order =
    rotated || offsetOrigin ? { rows, columns: 1 } : columnReadingOrder(rows, width, tableRows);
  const seen = new Set(),
    blocks = [];
  const byRow = new Map(detected.flatMap((t) => t.rows.map((r) => [r.index, t])));
  for (const row of order.rows) {
    const table = byRow.get(row.index);
    if (table) {
      if (seen.has(table)) continue;
      seen.add(table);
      blocks.push({
        kind: 'table',
        header: table.header,
        headerBoxes: table.rows[0].cells.map((c) => ({
          left: c.left,
          right: c.right,
          top: table.rows[0].y + table.rows[0].height,
          bottom: table.rows[0].y,
        })),
        rows: table.rows.slice(1).map((r) => ({
          cells: r.cells.map((c) => c.text),
          bbox: rectangle(r),
          cellBoxes: r.cells.map((c) => ({
            left: c.left,
            right: c.right,
            top: r.y + r.height,
            bottom: r.y,
          })),
        })),
        text:
          table.header.join(' | ') +
          '\n\n' +
          table.rows
            .slice(1)
            .map((r) => r.cells.map((c, i) => `${table.header[i]}: ${c.text}`).join(' | '))
            .join('\n\n'),
        bbox: {
          left: Math.min(...table.rows.map((r) => r.left)),
          right: Math.max(...table.rows.map((r) => r.right)),
          top: table.rows[0].y + table.rows[0].height,
          bottom: table.rows.at(-1).y,
        },
      });
      continue;
    }
    const formula = /[=≈∝∫√∑]|[²³⁰-⁹₀-₉\uFFFD\uE000-\uF8FF]/u.test(row.text);
    if (
      formula &&
      /[∫√∑²³⁰-⁹₀-₉\uFFFD\uE000-\uF8FF]|^[=≈∝]|[=≈∝]\s*[=≈∝]/u.test(row.text) &&
      !warnings.includes('formula-order-uncertain')
    )
      warnings.push('formula-order-uncertain');
    blocks.push({
      kind: formula
        ? 'formula'
        : /^(?:\d+(?:\.\d+)*[.)]|CHƯƠNG|BÀI|CHỦ ĐỀ)\s/u.test(row.text)
          ? 'heading'
          : 'paragraph',
      text: row.text,
      bbox: rectangle(row),
      ...(row.column !== undefined ? { column: row.column } : {}),
    });
  }
  // Aligned text without a proven header/value relationship is not a reconstructed table.
  if (!detected.length && rows.filter((r) => r.cells.length >= 2).length >= 2)
    warnings.push('table-structure-uncertain');
  const grouped = [];
  for (const block of blocks) {
    const previous = grouped.at(-1);
    if (
      previous?.kind === 'paragraph' &&
      block.kind === 'paragraph' &&
      previous.column === block.column &&
      previous.bbox.bottom - block.bbox.top < 20 &&
      previous.bbox.bottom >= block.bbox.bottom &&
      previous.bbox.bottom > height * 0.07 &&
      block.bbox.top < height * 0.93 &&
      !/[.!?:]$/.test(previous.text) &&
      !/^\s*(?:[*•●▪◦]|[-–]\s|\d+[.)])/.test(block.text)
    ) {
      previous.text += ' ' + block.text;
      previous.bbox = {
        left: Math.min(previous.bbox.left, block.bbox.left),
        right: Math.max(previous.bbox.right, block.bbox.right),
        top: previous.bbox.top,
        bottom: block.bbox.bottom,
      };
    } else grouped.push(block);
  }
  let text = '',
    previous;
  for (const block of grouped) {
    if (text) text += previous?.kind === 'heading' ? '\n' : '\n\n';
    block.start = text.length;
    text += block.text;
    block.end = text.length;
    previous = block;
  }
  return { pageNumber, text, blocks: grouped, columns: order.columns, width, height, warnings };
}

// Keep the first repeated margin as provenance; suppress only exact repeated
// lines in the outer 7% on >=3 pages. Never strip every standalone number.
export function finalizePdfLayout(pages) {
  const repeated = new Map();
  for (const page of pages)
    for (const block of page.blocks) {
      if (
        block.kind !== 'paragraph' ||
        block.text.length > 140 ||
        !/[\p{L}]/u.test(block.text) ||
        !(block.bbox.bottom < page.height * 0.07 || block.bbox.top > page.height * 0.93)
      )
        continue;
      const key = block.text.trim();
      if (!repeated.has(key)) repeated.set(key, new Set());
      repeated.get(key).add(page.pageNumber);
    }
  const marginKeys = new Set(
    [...repeated]
      .filter(([, ids]) => ids.size >= 3 && ids.size >= pages.length * 0.6)
      .map(([key]) => key),
  );
  const retained = new Set();
  for (const page of pages) {
    let text = '',
      previous;
    for (const block of page.blocks) {
      const margin =
        marginKeys.has(block.text.trim()) &&
        (block.bbox.bottom < page.height * 0.07 || block.bbox.top > page.height * 0.93);
      if (margin && retained.has(block.text.trim())) {
        block.omitted = true;
        block.kind = 'repeated-margin';
        delete block.start;
        delete block.end;
        continue;
      }
      if (margin) retained.add(block.text.trim());
      if (text) text += previous?.kind === 'heading' ? '\n' : '\n\n';
      block.start = text.length;
      text += block.text;
      block.end = text.length;
      previous = block;
    }
    page.text = text;
  }
  for (let i = 1; i < pages.length; i++) {
    const previous = pages[i - 1],
      current = pages[i],
      a = previous.blocks.filter((b) => b.kind === 'table').at(-1),
      b = current.blocks.find((b) => b.kind === 'table');
    if (
      a &&
      b &&
      a.bbox.bottom < previous.height * 0.15 &&
      b.bbox.top > current.height * 0.85 &&
      JSON.stringify(a.header) === JSON.stringify(b.header) &&
      a.headerBoxes.every((box, index) => Math.abs(box.left - b.headerBoxes[index].left) < 12) &&
      Math.abs(a.bbox.left - b.bbox.left) < 12 &&
      Math.abs(a.bbox.right - b.bbox.right) < 12
    )
      b.continuationOf = { page: previous.pageNumber, block: previous.blocks.indexOf(a) };
  }
  const result = {
    layoutVersion: 3,
    pages: pages.map(({ text: _text, ...page }) => ({
      ...page,
      blocks: page.blocks.map(({ text, ...block }) => ({
        ...block,
        ...(block.omitted ? { text } : {}),
      })),
    })),
    warnings: [...new Set(pages.flatMap((p) => p.warnings))],
    capabilities: { ocr: false, imageInterpretation: false, mergedCells: false },
    repeatedMargins: [...marginKeys],
  };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 4 * 1024 ** 2) {
    result.warnings.push('layout-metadata-limited');
    result.detailsOmitted = true;
    result.pages = result.pages.map((page) => ({
      ...page,
      blockCount: page.blocks.length,
      warnings: [...page.warnings, 'layout-metadata-limited'],
      blocks: page.blocks
        .slice(0, 16)
        .map(({ kind, bbox, start, end, column }) => ({ kind, bbox, start, end, column })),
    }));
  }
  return result;
}

export function legacyPdfText(items) {
  return pdfTextLines(items)
    .map((row) => row.text)
    .join('\n');
}
