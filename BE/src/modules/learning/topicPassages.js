const fold = (value) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/giu, 'd')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();

// Select exact named sections before sending evidence to AI. Original text/offsets stay intact.
export function topicRanges(content, topics) {
  if (!topics?.length) return [{ start: 0, end: content.length }];
  const headings = [
    ...content.matchAll(
      /^\s*(?:#{1,3}\s+|\d+(?:\.\d+)*[.)]\s+|(?:CHƯƠNG|BÀI|CHỦ ĐỀ)\s+\d+\s*[:|.-]?\s*)([^\n]+)$/gmu,
    ),
  ];
  const needles = topics.map(fold);
  const matches = headings.filter((match) =>
    needles.some((topic) => fold(match[1]).includes(topic)),
  );
  if (matches.length)
    return matches.map((match) => ({
      start: match.index,
      end: headings.find((next) => next.index > match.index)?.index ?? content.length,
    }));
  // Unstructured chunks may not expose section boundaries. Keep only chunks naming a topic;
  // generation and semantic verification still enforce exact requested topics.
  return needles.some((topic) => fold(content).includes(topic))
    ? [{ start: 0, end: content.length }]
    : [];
}

export function topicsCovered(verdict, topics) {
  if (!topics.length) return true;
  const covered = verdict?.coveredTopicIndices;
  return Array.isArray(covered) && covered.length === topics.length &&
    new Set(covered).size === covered.length && topics.every((_, index) => covered.includes(index));
}
