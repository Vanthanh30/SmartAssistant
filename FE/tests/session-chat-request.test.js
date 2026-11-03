import test from "node:test";
import assert from "node:assert/strict";
import { questionRequest } from "../src/features/chat/questionRequest.js";
test("session question carries stable request/session IDs and fixed document IDs", () => {
  const input = {
    question: "Giải thích khái niệm này",
    requestId: "fixture",
    sessionId: "37319038097580148",
    documentIds: ["21"],
    answerMode: "documents",
  };
  assert.deepEqual(questionRequest(input), input);
  assert.equal(
    questionRequest({ ...input, sessionId: undefined }).sessionId,
    undefined,
  );
});
