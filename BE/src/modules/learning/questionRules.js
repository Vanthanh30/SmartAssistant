const normalize = value => value.normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();

// Extract only explicit prose relations; never infer a scientific claim or repair math.
export function relation(sentence) {
  const named = sentence.replace(/^([^:]{3,70}):\s*(có|là|được dùng để|dùng để|giúp)\s+/u, '$1 $2 ');
  const match = named.match(/^(.{3,100}?)\s+(được gọi là|gọi là|là|có|được dùng để|dùng để|giúp)\s+(.{12,350})[.!]$/u);
  if (!match || /[?:]/u.test(match[1]) || !/^\p{Lu}/u.test(match[1])
    || /^(?:Gồm|Hợp|Khi|Nếu|Với|Trong|Đối với|Nó|Chúng|Đây|Đó|Không)(?:\s|$)/u.test(match[1])
    || /^(?:thể\s|được\s)/u.test(match[3])
    || /\s(?:và|hoặc|nhưng)$/u.test(match[1])) return null;
  const words = normalize(match[1]).split(' ');
  const phrases = new Set();
  for (let i = 0; i + 1 < words.length; i++) {
    const phrase = words.slice(i, i + 2).join(' ');
    if (phrases.has(phrase)) return null;
    phrases.add(phrase);
  }
  return { subject: match[1], verb: match[2], detail: match[3] };
}

export function questionVariants(fact, pool) {
  const variants = [];
  const current = relation(fact.sentence);
  if (current) {
    const peers = pool.map(other => ({ fact: other, value: relation(other.sentence) }))
      .filter(other => other.value && other.value.verb === current.verb
        && normalize(other.value.subject) !== normalize(current.subject));
    const forbidden = new Set(pool.filter(other => {
      const value = relation(other.sentence);
      return value && normalize(value.subject) === normalize(current.subject);
    }).map(other => normalize(relation(other.sentence).detail)));
    const details = [...new Map(peers.filter(other => !forbidden.has(normalize(other.value.detail)))
      .map(other => [normalize(other.value.detail), other.value.detail])).values()].slice(0, 3);
    if (details.length === 3) variants.push({ type: current.verb.endsWith('là') ? 'definition' : 'property',
      prompt: current.verb.endsWith('là') ? `${current.subject} ${current.verb} gì?`
        : (current.verb === 'có' ? `${current.subject} có đặc điểm nào?` : `${current.subject} có vai trò hoặc công dụng gì?`),
      answer: current.detail, distractors: details,
    });
    if (current.verb === 'là') {
      const subjects = [...new Map(peers.filter(other => normalize(other.value.detail) !== normalize(current.detail))
        .filter(other => !pool.some(candidate => {
          const value = relation(candidate.sentence);
          return value && normalize(value.subject) === normalize(other.value.subject)
            && normalize(value.detail) === normalize(current.detail);
        })).map(other => [normalize(other.value.subject), other.value.subject])).values()].slice(0, 3);
      if (subjects.length === 3) variants.push({ type: 'concept',
        prompt: `Khái niệm nào phù hợp với mô tả: “${current.detail}”?`,
        answer: current.subject, distractors: subjects,
      });
    }
  }
  const condition = fact.sentence.match(/^Khi (.{12,160}?) thì (.{12,250})[.!]$/u);
  if (condition) {
    const alternatives = [...new Set(pool.map(other => other.sentence.match(/^Khi (.{12,160}?) thì (.{12,250})[.!]$/u))
      .filter(other => other && normalize(other[1]) !== normalize(condition[1]) && normalize(other[2]) !== normalize(condition[2]))
      .map(other => other[2]))].slice(0, 3);
    if (alternatives.length === 3) variants.push({ type: 'condition',
      prompt: `Điều gì xảy ra khi ${condition[1]}?`, answer: condition[2], distractors: alternatives });
  }
  return variants;
}
