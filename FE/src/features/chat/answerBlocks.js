// Infer visible structure from markers preserved in extracted text, not subject names.
export function answerBlocks(content) {
  const lines = content.replace(/\r/g, '')
    .replace(/[ \t]*([•●▪◦])[ \t]*/gu, '\n$1 ')
    .replace(/([\s])([a-z])[.)]\s+(?=[\p{L}])/gu, '$1\n$2. ')
    .split(/\n+/).map(line => line.trim()).filter(Boolean);
  const blocks = [];
  for (const [index, line] of lines.entries()) {
    const bullet = line.match(/^(?:[*•●▪◦]|[-–]\s)\s*(.+)$/u);
    const section = /^[a-z][.)]\s+/u.test(line) && line.length < 200;
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    const formula = /[=≈∝]/.test(line) && line.length < 200;
    const heading = !formula && !bullet && (section || (line.length < 100 && (
      /^(?:BÀI|CHƯƠNG|PHẦN)\s/u.test(line) || /:$/.test(line)
      || (/\p{L}/u.test(line) && line === line.toLocaleUpperCase('vi'))
      || /^[a-z][.)]\s+/u.test(lines[index + 1] || ''))));
    const type = formula ? 'formula' : heading ? 'heading' : bullet || numbered ? 'list' : 'paragraph';
    const text = type === 'heading' ? line : bullet?.[1] || numbered?.[1] || line;
    if (type === 'formula' && blocks.at(-1)?.type === 'formula') blocks.at(-1).text += '\n' + text;
    else if (type === 'list' && blocks.at(-1)?.type === 'list') blocks.at(-1).items.push(text);
    else blocks.push(type === 'list' ? { type, items: [text] } : { type, text });
  }
  return blocks;
}
