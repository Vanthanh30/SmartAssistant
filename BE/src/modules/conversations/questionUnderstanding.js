import { planQuestion } from '../../rag/questionPlan.js';
import { normalizeConceptText, normalizeCountQuestion } from './queryTerms.js';

const fold = normalizeConceptText;
const intents = new Map([
  ['la j', 'là gì'],
  ['la gi', 'là gì'],
  ['khai niem', 'khái niệm'],
  ['dinh nghia', 'định nghĩa'],
  ['cong thuc', 'công thức'],
  ['cau tao', 'cấu tạo'],
  ['chuc nang', 'chức năng'],
  ['so sanh', 'so sánh'],
  ['phan biet', 'phân biệt'],
  ['tom tat', 'tóm tắt'],
  ['bao nhieu', 'bao nhiêu'],
  ['nhu the nao', 'như thế nào'],
  ['co bao nhieu', 'có bao nhiêu'],
  ['bao nhieu lai', 'bao nhiêu loại'],
  ['cua no', 'của nó'],
  ['cua cai do', 'của cái đó'],
]);
const operationWords = new Set(
  fold(
    [...intents.values()].join(' ') +
      ' cho tôi mình bạn hãy vui lòng giúp cần muốn tài liệu về này trên',
  ).split(/\s+/),
);

// Change only known question phrases, leaving identifiers, numbers and subjects intact.
export function normalizeUserQuestion(question) {
  const text = normalizeCountQuestion(question.trim().normalize('NFC'));
  const tokens = [...text.matchAll(/[\p{L}]+/gu)];
  let result = '',
    cursor = 0;
  for (let index = 0; index < tokens.length; index++) {
    for (const count of [3, 2]) {
      const part = tokens.slice(index, index + count);
      if (part.length !== count) continue;
      const end = part.at(-1).index + part.at(-1)[0].length;
      const phrase = text.slice(part[0].index, end);
      if (!/^[\p{L}\s]+$/u.test(phrase)) continue;
      const key = fold(phrase).replace(/\s+/g, ' '),
        value = intents.get(key);
      if (!value || (key.startsWith('cua ') && /[A-Z]{2,}/.test(phrase))) continue;
      result += text.slice(cursor, part[0].index) + value;
      cursor = end;
      index += count - 1;
      break;
    }
  }
  return normalizeCountQuestion(result + text.slice(cursor));
}

function oneEdit(a, b) {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const different = [...a].map((c, i) => (c === b[i] ? -1 : i)).filter((i) => i >= 0);
    return (
      different.length === 1 ||
      (different.length === 2 &&
        different[1] === different[0] + 1 &&
        a[different[0]] === b[different[1]] &&
        a[different[1]] === b[different[0]])
    );
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  return short.slice(i) === long.slice(i + 1);
}

// This vocabulary comes only from the currently authorized retrieval results.
// Short codes and anything resembling a calculation are never fuzzy-corrected.
export function understandFromSources(question, sources) {
  const normalized = normalizeUserQuestion(question);
  if (/[=≈∝]|\b\d/u.test(question)) return { query: normalized, changes: [] };
  const vocabulary = new Map(),
    aliases = new Map();
  for (const source of sources.slice(0, 20)) {
    const text = (source.content || '').slice(0, 16000);
    for (const token of text.match(/[\p{L}]{2,}/gu) || []) {
      if (vocabulary.size >= 10000) break;
      const key = fold(token);
      if (!vocabulary.has(key)) vocabulary.set(key, token);
    }
    // Only explicit full-name (ACRONYM) definitions, bounded to one source line.
    for (const line of text.split('\n')) {
      const match = line.match(
        /^\s*(?:[-*•]|\d+[.)])?\s*([\p{L}][\p{L}\s-]{3,90})\s+\(([\p{Lu}]{2,10})\)/u,
      );
      if (!match) continue;
      const term = match[1].trim(),
        key = fold(match[2]);
      if (!aliases.has(key)) aliases.set(key, new Set());
      aliases.get(key).add(term);
    }
  }
  const changes = [],
    ambiguous = [];
  const query = normalized.replace(/[\p{L}]+/gu, (token) => {
    const key = fold(token);
    let expansions = aliases.get(key);
    if (!expansions && token === token.toLocaleLowerCase('vi')) {
      const shorthand = {
        ct: ['công thức', 'cấu tạo'],
        kn: ['khái niệm'],
        dl: ['định luật', 'động lực'],
      }[key];
      if (shorthand) {
        const candidates = shorthand.filter((phrase) =>
          sources.some((s) => fold(s.content || '').includes(fold(phrase))),
        );
        if (candidates.length) expansions = new Set(candidates);
      }
    }
    if (expansions?.size > 1) {
      ambiguous.push({ token, options: [...expansions].slice(0, 3) });
      return token;
    }
    if (expansions?.size === 1) {
      const replacement = [...expansions][0];
      changes.push({ from: token, to: replacement });
      return replacement;
    }
    if (
      key.length < 5 ||
      operationWords.has(key) ||
      vocabulary.has(key) ||
      changes.length >= 2 ||
      /^[\p{Lu}]+$/u.test(token)
    )
      return token;
    const candidates = [...vocabulary.keys()].filter(
      (word) => word.length >= 5 && oneEdit(key, word),
    );
    if (candidates.length !== 1) {
      if (candidates.length > 1 && candidates.length <= 3)
        ambiguous.push({ token, options: candidates.map((word) => vocabulary.get(word)) });
      return token;
    }
    const replacement = vocabulary.get(candidates[0]);
    changes.push({ from: token, to: replacement });
    return replacement;
  });
  if (ambiguous.length) {
    const item = ambiguous[0];
    return {
      query: normalized,
      changes: [],
      clarification: `Bạn dùng “${item.token}” để chỉ ${item.options.map((v) => `“${v}”`).join(' hay ')}? Bạn hãy ghi rõ tên để mình tra đúng nội dung.`,
    };
  }
  return { query, changes };
}

// Match document-wide requests only; a named-topic summary still needs topic retrieval.
export function isDocumentSummary(question) {
  const text = question
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();
  return /^(?:(?:hay|vui long|giup toi|giup minh)\s+)*(?:tom tat\s+(?:lai\s+)?|tao lai\s+(?:ban\s+)?tom tat\s+)(?:(?:ngan gon|toan bo|noi dung)\s+)*(?:tai lieu|cac tai lieu|pdf|file pdf|file|van ban)(?:\s+(?:tren|nay|da tai len|da cung cap|cho toi|cho minh|ngan gon))*[.!?]*$/.test(
    text,
  );
}
export function regenerateSummary(question) {
  return (
    isDocumentSummary(question) &&
    /tom tat\s+lai|tao lai\s+(?:ban\s+)?tom tat/iu.test(
      question.normalize('NFD').replace(/\p{M}/gu, ''),
    )
  );
}

const facet =
  '(?:giải thích|dấu hiệu nhận biết|công thức|cách dùng|cách sử dụng|chức năng|đặc điểm|ưu điểm|nhược điểm|cấu tạo|định nghĩa|khái niệm|ứng dụng|ví dụ)';
function followupText(question) {
  return question
    .trim()
    .replace(
      /^(?:(?:hãy|vui lòng)\s+)?(?:cho(?:\s+(?:tôi|mình|em))?|lấy|nêu|đưa(?:\s+(?:tôi|mình|em))?)\s+(?=(?:(?:một|vài|một vài|thêm|các|\d+)\s+)?ví dụ)/iu,
      '',
    )
    .replace(/^(?:(?:một|vài|một vài|thêm|các|\d+)\s+)(?=ví dụ)/iu, '')
    .replace(/^(?:nói rõ hơn|làm rõ hơn|giải thích thêm|giải thích rõ hơn)[?.!]*$/iu, 'giải thích');
}
// Several requested facets can refer to one subject: "X công thức và cách dùng".
// Remove only complete facet phrases, preserving conjunctions between actual subjects.
export function followupSubject(question) {
  const cleaned = question
    .trim()
    .replace(/[?.!]+$/u, '')
    .replace(/^(?:hãy|cho tôi|cho mình|giải thích về)\s+/iu, '');
  const suffix = new RegExp(
    '\\s+(?:về\\s+)?' + facet + '(?:\\s+(?:và|,|cũng như)\\s*' + facet + ')*$',
    'iu',
  );
  const prefix = new RegExp(
    '^' + facet + '(?:\\s+(?:và|,|cũng như)\\s*' + facet + ')*(?:\\s+của)?\\s+',
    'iu',
  );
  let subject = cleaned
    .replace(suffix, '')
    .replace(prefix, '')
    .replace(/\s+là gì$/iu, '')
    .trim();
  if (subject === cleaned && /^(?:giải thích|nói rõ hơn|tóm tắt)$/iu.test(subject)) return null;
  if (!subject || new RegExp('^' + facet + '$', 'iu').test(subject)) return null;
  return subject;
}

export function resolveFollowup(question, history = []) {
  question = followupText(question);
  const reference = /(?:^|\s)(?:nó|đó|này|cái đó|cái này)(?=\s|[?.!,]|$)|công thức trên/iu;
  const implicit =
    /^(?:còn\s+)?(?:giải thích|dấu hiệu nhận biết|cách dùng|ví dụ|chức năng|đặc điểm|ưu điểm|nhược điểm|cấu tạo|công thức|định nghĩa|khái niệm|ứng dụng)(?:\s+thì sao)?[?.!]*$/iu;
  if (/^(?:tính giúp|cái gì|như thế nào)[?.!]*$/iu.test(question.trim()))
    return { query: question, needsClarification: true };
  if (isDocumentSummary(question) || (!reference.test(question) && !implicit.test(question)))
    return { query: question, needsClarification: false };
  // Resolve the bounded chain oldest-first, so follow-ups never become the next subject "nó".
  const users = history.filter((turn) => turn.role === 'user').slice(-8);
  let previous;
  for (let index = 0; index < users.length; index++) {
    const content = followupText(users[index].content);
    if (reference.test(content) || implicit.test(content)) {
      const resolved = resolveFollowup(
        content,
        previous ? [{ role: 'user', content: previous }] : [],
      );
      if (resolved.needsClarification) previous = undefined;
      else previous = resolved.query;
    } else previous = content;
  }
  const plan = previous ? planQuestion(previous) : null;
  const subjects = new Set(plan?.items.map((item) => item.subject).filter(Boolean));
  let subject = subjects.size === 1 ? [...subjects][0] : null;
  if (!subject && plan?.items.length === 1) {
    subject = previous
      .match(/^(.+?)\s+(?:là gì|có bao nhiêu loại|gồm mấy loại)[?.!]*$/iu)?.[1]
      ?.trim();
  }
  if (!subject && previous) subject = followupSubject(previous);
  if (
    !subject ||
    /\s(?:và|hay|hoặc)\s/iu.test(subject) ||
    subject.length > 150 ||
    reference.test(subject) ||
    /công thức trên/iu.test(question)
  )
    return { query: question, needsClarification: true };
  const query = implicit.test(question)
    ? `${question.replace(/^(?:còn\s+)|\s+thì sao[?.!]*$/giu, '').replace(/[?.!]+$/, '')} của ${subject}`
    : question.replace(/(?:cái )?(?:nó|đó|này)(?=\s|[?.!,]|$)/giu, subject);
  return { query, needsClarification: false };
}
export const clarificationAnswer = (message) => ({
  status: 'insufficient_context',
  answer:
    message ||
    'Bạn muốn hỏi về khái niệm hoặc đối tượng nào trong tài liệu? Vui lòng nêu rõ tên để mình tra cứu đúng nguồn.',
  sources: [],
  model: null,
  verification: 'không đủ ngữ cảnh',
});
