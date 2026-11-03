// Break dense prose only at sentence boundaries; keep decimals, initials and formulas intact.
export function readableParagraphs(text) {
  if (text.length < 220 || /https?:\/\//u.test(text)) return [text];
  const sentences = text.split(/(?<=[.!?])\s+(?=[\p{Lu}][\p{L}]{1,})/u);
  const paragraphs = [];
  for (const sentence of sentences) {
    const previous = paragraphs.at(-1);
    if (previous && /(?:^|\s)\d+[.)]$/u.test(previous)) {
      paragraphs[paragraphs.length - 1] += ' ' + sentence;
      continue;
    }
    if (previous && previous.length < 60 && previous.length + sentence.length < 180)
      paragraphs[paragraphs.length - 1] += ' ' + sentence;
    else paragraphs.push(sentence);
  }
  return paragraphs;
}

// Repair PDF list markers split onto separate lines, including saved answer blocks.
// Formula blocks retain their original source anchors and offsets.
export function normalizeAnswerLists(input) {
  const result = [];
  for (let index = 0; index < input.length; index++) {
    const block = input[index];
    if (!['paragraph', 'heading'].includes(block.type)) {
      result.push(block);
      continue;
    }
    const lines = (block.text || '').split(/\n+/u).map(line => line.trim()).filter(Boolean);
    for (let offset = 0; offset < lines.length; offset++) {
      let line = lines[offset];
      const marker = line.match(/^(\d+)[.)]$/u);
      if (marker) {
        if (lines[offset + 1]) line += ' ' + lines[++offset];
        else {
          const next = input[index + 1];
          if (next?.type === 'paragraph' && next.text?.trim() && !/^\d+[.)]/u.test(next.text.trim())) {
            line += ' ' + next.text.trim();
            index++;
          }
        }
      }
      const numbered = line.match(/^(\d+)[.)]\s+(.+)$/u);
      if (numbered) {
        const number = Number(numbered[1]);
        const previous = result.at(-1);
        if (previous?.type === 'list' && previous.ordered && previous.start + previous.items.length === number)
          previous.items.push(numbered[2]);
        else result.push({ id: `${block.id}-list-${offset}`, type: 'list', ordered: true, start: number, items: [numbered[2]] });
      } else result.push({ ...block, id: `${block.id}-${offset}`, text: line });
    }
  }
  return result;
}

// Infer visible structure from markers preserved in extracted text, not subject names.
export function answerBlocks(content) {
  const lines = content
    .replace(/\r/g, "")
    .replace(/[ \t]*([•●▪◦])[ \t]*/gu, "\n$1 ")
    .replace(/([\s])([a-z])[.)]\s+(?=[\p{L}])/gu, "$1\n$2. ")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks = [];
  for (const [index, line] of lines.entries()) {
    const bullet = line.match(/^(?:[*•●▪◦]|[-–]\s)\s*(.+)$/u);
    const section = /^[a-z][.)]\s+/u.test(line) && line.length < 200;
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    const formula =
      /[=≈∝∫√∑±∞α-ωΑ-Ω\uFFFD\uE000-\uF8FF]|\b(?:[A-Za-z]\s+){2,}[A-Za-z]\b/.test(
        line,
      );
    const heading =
      !formula &&
      !bullet &&
      (section ||
        (line.length < 100 &&
          (/^(?:BÀI|CHƯƠNG|PHẦN)\s/u.test(line) ||
            /:$/.test(line) ||
            (/\p{L}/u.test(line) && line === line.toLocaleUpperCase("vi")) ||
            /^[a-z][.)]\s+/u.test(lines[index + 1] || ""))));
    const type = formula
      ? "formula"
      : heading
        ? "heading"
        : bullet || numbered
          ? "list"
          : "paragraph";
    const text =
      type === "heading" ? line : bullet?.[1] || numbered?.[1] || line;
    if (type === "list" && blocks.at(-1)?.type === "list")
      blocks.at(-1).items.push(text);
    else
      blocks.push(type === "list" ? { type, items: [text] } : { type, text });
  }
  return blocks;
}
