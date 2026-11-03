import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnswerLists, readableParagraphs } from '../src/features/chat/answerBlocks.js';

test('repairs detached PDF numbering in saved blocks without changing formula anchors', () => {
  const formula = { id: 'math', type: 'formula_image', text: 'x²', source: { start: 10 } };
  const blocks = normalizeAnswerLists([
    { id: 'a', type: 'paragraph', text: '1. First item\n2.' },
    { id: 'b', type: 'paragraph', text: 'Second item' },
    { id: 'c', type: 'paragraph', text: '3.\nThird item' },
    formula,
  ]);
  assert.deepEqual(blocks[0].items, ['First item', 'Second item', 'Third item']);
  assert.equal(blocks[0].ordered, true);
  assert.equal(blocks[1], formula);
});

test('keeps numbering gaps and ordinary prose rather than inventing items', () => {
  const blocks = normalizeAnswerLists([
    { id: 'a', type: 'paragraph', text: '2. Example\n4. Another example\nSummary:' },
  ]);
  assert.equal(blocks[0].start, 2);
  assert.equal(blocks[1].start, 4);
  assert.equal(blocks[2].text, 'Summary:');
  const text = 'A sentence long enough to exercise paragraph splitting. '.repeat(5) + '2. Second item.';
  assert.ok(!readableParagraphs(text).some(paragraph => /2\.$/u.test(paragraph)));
});
