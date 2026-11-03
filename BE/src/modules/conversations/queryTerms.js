// Only unambiguous terminology aliases. Never fuzzy-match identifiers such as ADN/ARN.
export function normalizeConceptText(value) {
  const aliases = { rna: 'arn', dna: 'adn', mrna: 'marn', trna: 'tarn', rrna: 'rarn' };
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\b(?:mrna|trna|rrna|rna|dna)\b/g, (term) => aliases[term]);
}
// Correct only a count question's mistaken "lại"; never replace the word in prose.
export function normalizeCountQuestion(question) {
  return question
    .normalize('NFC')
    .replace(/^(\s*(?:có\s+)?(?:bao nhiêu|mấy)\s+)lại(?=\s)/iu, '$1loại')
    .replace(/(\s+có\s+(?:bao nhiêu|mấy)\s+)lại([?.!]*\s*)$/iu, '$1loại$2');
}

// Keep each subject and its intent together; never carry "là gì" into another question.
export function questionParts(question) {
  return [
    ...new Set(
      question
        .split(/\s+(?:và|đồng thời|cũng như)\s+|[;?\n]+/iu)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}
