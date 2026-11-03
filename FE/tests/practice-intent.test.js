import test from "node:test";
import assert from "node:assert/strict";
import {
  isPracticeIntent,
  practiceTopic,
  recentPracticeTopics,
} from "../src/features/chat/practiceIntent.js";
test('suggests recent concrete subjects without generic example requests or course names', () => {
  assert.deepEqual(recentPracticeTopics([
    { role: 'user', content: 'english' },
    { role: 'user', content: 'thì hiện tại đơn công thức và cách dùng' },
    { role: 'user', content: 'thì quá khứ đơn' },
    { role: 'user', content: 'cho ví dụ' },
    { role: 'user', content: 'ví dụ của nó' },
  ]), ['thì quá khứ đơn', 'thì hiện tại đơn']);
});
test("practice requests bypass theory answering and use conversation topic", () => {
  assert.equal(isPracticeIntent("tạo câu hỏi để luyện tập"), true);
  assert.equal(isPracticeIntent("cho tôi 10 flashcard"), true);
  assert.equal(isPracticeIntent("công thức thì hiện tại đơn"), false);
  assert.equal(
    practiceTopic("tạo câu hỏi để luyện tập", [
      { role: "user", content: "thì hiện tại đơn công thức và cách dùng" },
      { role: "assistant", content: "Thì hiện tại đơn..." },
      { role: "user", content: "dấu hiệu nhận biết của nó" },
    ]),
    "thì hiện tại đơn",
  );
});
test("explicit topic overrides context; missing or ambiguous topics require input", () => {
  assert.equal(
    practiceTopic("tạo quiz về thì quá khứ đơn", []),
    "thì quá khứ đơn",
  );
  assert.equal(practiceTopic("luyện tập", []), "");
  assert.equal(
    practiceTopic("luyện tập", [{ role: "user", content: "so sánh A và B" }]),
    "",
  );
});
