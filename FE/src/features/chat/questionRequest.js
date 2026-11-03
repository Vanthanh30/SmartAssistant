export function questionRequest(attempt) {
  const body = {
    question: attempt.question,
    requestId: attempt.requestId,
    answerMode: attempt.answerMode || "documents",
  };
  if (attempt.documentIds !== null && attempt.documentIds !== undefined) {
    if (
      !Array.isArray(attempt.documentIds) ||
      !attempt.documentIds.length ||
      attempt.documentIds.length > 50 ||
      new Set(attempt.documentIds).size !== attempt.documentIds.length ||
      attempt.documentIds.some(
        (id) => typeof id !== "string" || !/^[1-9][0-9]{0,19}$/.test(id),
      )
    )
      throw new Error("Vui lòng chọn từ 1 đến 50 tài liệu sẵn sàng.");
    body.documentIds = [...attempt.documentIds];
  }
  if (attempt.sessionId) body.sessionId = attempt.sessionId;
  return body;
}
