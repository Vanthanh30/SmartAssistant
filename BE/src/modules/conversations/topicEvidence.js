import { cleanDocumentText } from './documentAnswer.js';
import { normalizeConceptText, normalizeCountQuestion } from './queryTerms.js';

export const notFoundAnswer = () => ({
  status: 'insufficient_context',
  model: 'document-extractive',
  answer: 'Không tìm thấy nội dung này trong tài liệu.',
  sources: [],
});

const fold = normalizeConceptText;
const stop = new Set(
  'la gi cua cac nhung mot trong tren ve cho toi hay ban nao va voi duoc hay neu'.split(' '),
);
const words = (text) =>
  (
    fold(text)
      .replace(/\bmach (?=noi tiep|song song)/g, 'mac ')
      .match(/[a-z0-9]+/g) || []
  ).filter((word) => !stop.has(word));

// Remove instructions, not subject words such as "hiện tại" or "tiếp diễn".
export function questionTopic(question) {
  return words(
    fold(normalizeCountQuestion(question))
      .replace(/\b(?:cho minh biet|cho toi biet|ban co the|vui long|giup minh|giup toi)\b/g, ' ')
      // Count/classification is the requested operation, not part of the subject.
      // Keep qualifiers outside these complete phrases (e.g. "ARN ở người").
      .replace(
        /\b(?:(?:co|gom|bao gom|chia thanh)\s+)?(?:bao nhieu|may)\s+(?:loai|dang|nhom)\b|\b(?:co|gom|bao gom)\s+(?:nhung|cac)\s+(?:loai|dang|nhom)\s+nao\b/g,
        ' ',
      )
      .replace(
        /\b(?:cong thuc|cach tinh|tinh nhu the nao|tai sao|vi sao|cho biet|tim hieu|dinh nghia|khai niem|trinh bay|giai thich|so sanh|phan biet|khac nhau nhu the nao|khac gi nhau|khac nhau|giong nhau)\b/g,
        ' ',
      )
      // "Mạch nối song song" is a common redundant phrasing of "mạch song song".
      .replace(/\b(mach|mac) noi song song\b/g, '$1 song song'),
  );
}

export function topicEvidence(question, text) {
  const topic = questionTopic(question),
    unique = [...new Set(topic)];
  if (!unique.length) return { supported: false, score: 0 };
  const tokens = words(cleanDocumentText(text || '')),
    present = new Set(tokens);
  const coverage = unique.filter((word) => present.has(word)).length / unique.length;
  const pairs = [...new Set(topic.slice(1).map((word, i) => topic[i] + ' ' + word))];
  const corpusPairs = new Set(tokens.slice(1).map((word, i) => tokens[i] + ' ' + word));
  const matchedPairs = pairs.filter((pair) => corpusPairs.has(pair)).length;
  const supported =
    coverage >= (unique.length <= 3 ? 1 : 0.8) &&
    (!pairs.length || matchedPairs >= Math.ceil(pairs.length * 0.75));
  return {
    supported,
    score: coverage * 0.7 + (pairs.length ? matchedPairs / pairs.length : 1) * 0.3,
  };
}
