import { learningText, topicHeading } from './sourceText.js';

// Accept complete single-line equalities only. Multi-line fractions and lost
// subscripts are not reconstructed from the extraction stream.
export function formulaFacts(sources) {
  const facts = []; const seen = new Set(); const budgets = new Map();
  for (const source of sources) {
    const used = budgets.get(source.documentId) || 0;
    const allowance = Math.min(4000, 128000 - used);
    if (allowance <= 0) continue;
    budgets.set(source.documentId, used + allowance);
    const raw = source.content || '';
    const text = raw.length > allowance ? raw.slice(0, raw.lastIndexOf('\n', allowance)) : raw;
    let topic = '';
    for (const line of learningText(text).split('\n')) {
      topic = topicHeading(line) || topic;
      if (facts.filter(f => f.source.documentId === source.documentId).length >= 32) break;
      const inline = line.match(/^[*•-]?\s*([^:=]{6,100}):\s*([^:]*=[^:]*)$/u);
      const label = inline ? inline[1].trim() : topic;
      const formula = (inline ? inline[2] : line).replace(/^[*•+-]\s+/, '').trim();
      if (!/^[A-Za-zΔλδθρν][A-Za-zΔλδθρν₀-₉]?\s*=\s*[A-Za-z0-9Δλδθρντ₀-₉²³⁰-⁹ .·×*/+−()-]+$/u.test(formula)
        || formula.length > 100 || formula.split('=').length !== 2
        || /[A-Za-z]\s+\d|\d\s+[A-Za-z]|\d\s+\d|\p{L}\s+\p{L}/u.test(formula)
        || (formula.match(/\(/g) || []).length !== (formula.match(/\)/g) || []).length) continue;
      const signature = `${source.documentId}:${formula.replace(/\s/g, '')}`;
      if (seen.has(signature)) continue;
      seen.add(signature); facts.push({ sentence: formula, formula, topic: label, source });
      if (facts.filter(f => f.source.documentId === source.documentId).length >= 32) break;
    }
  }
  return facts;
}

export function formulaVariants(fact, pool, seed) {
  const variants = [];
  const validForTopic = new Set(pool.filter(other => other.formula && other.topic === fact.topic)
    .map(other => other.formula.replace(/\s/g, '')));
  const alternatives = [...new Set(pool.filter(other => other.formula && other.topic !== fact.topic)
    .map(other => other.formula).filter(value => !validForTopic.has(value.replace(/\s/g, ''))))].slice(0, 3);
  if (fact.topic && alternatives.length === 3) variants.push({ type: 'formula',
    prompt: `Biểu thức nào được dùng trong phần “${fact.topic}”?`, answer: fact.formula, distractors: alternatives });
  const product = fact.formula.match(/^([A-Za-z])\s*=\s*([A-Za-zλρν])\s*[.·×*]\s*([A-Za-zλρν])$/u);
  if (product && new Set(product.slice(1)).size === 3) {
    const [, output, first, second] = product;
    const a = 2 + seed % 8; const b = 3 + seed % 5; const value = a * b;
    variants.push({ type: 'calculation',
      prompt: `Áp dụng ${fact.formula}: cho ${first} = ${a} và ${second} = ${b} (các đơn vị tương thích). ${output} bằng bao nhiêu?`,
      answer: String(value), distractors: [String(value + a), String(value + b + a), String(value - 1)],
      explanation: `Áp dụng công thức nguồn ${fact.formula}: ${output} = ${a} × ${b} = ${value}. Các giá trị đầu vào là dữ kiện luyện tập, không phải số liệu trích từ PDF.` });
  }
  return variants;
}
