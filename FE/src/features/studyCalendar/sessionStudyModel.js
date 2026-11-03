export const sessionStudyPath = (id) =>
  `/app/study-calendar/sessions/${encodeURIComponent(String(id))}`;

// Older saved sessions already carry an authorized PDF range. They can be read
// and practised without claiming that an AI lesson was generated for them.
export function sessionStudyModel(session) {
  if (session.lesson?.resources?.length)
    return { ...session.lesson, prepared: true };
  const duration = Math.max(
    1,
    Math.round((new Date(session.end) - new Date(session.start)) / 60000),
  );
  const from = Number(session.pageFrom),
    to = Number(session.pageTo);
  const validScope =
    session.documentId &&
    Number.isInteger(from) &&
    Number.isInteger(to) &&
    from > 0 &&
    to >= from;
  return {
    prepared: false,
    objectives: [session.goal || session.title || "Học nội dung đã lên lịch."],
    topics: [],
    activities: [
      {
        kind: "read",
        minutes: duration,
        instruction:
          "Đọc và ghi lại các ý chính trong phạm vi tài liệu của buổi học. Sau đó dùng quiz hoặc flashcard để tự kiểm tra.",
      },
    ],
    resources: validScope
      ? [
          {
            documentId: String(session.documentId),
            pageFrom: from,
            pageTo: to,
            fileName: "Tài liệu của buổi học",
            chunkIds: [],
          },
        ]
      : [],
    quizCount: 5,
    flashcardCount: 5,
  };
}
