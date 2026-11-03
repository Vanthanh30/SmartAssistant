import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import { Button } from "../../components/ui/Button.jsx";
import { createSet } from "../learning/api.js";
import { practiceDestination } from './practiceDestination.js';

export function ChatPractice({
  courseId,
  sessionId,
  documentIds,
  auth,
  initialTopic,
  suggestions = [],
  initialQuestion = "",
  onClose,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();
  const [topic, setTopic] = useState(initialTopic);
  const [scopeChoice, setScopeChoice] = useState(initialTopic ? "custom" : "");
  const chosenTopics =
    scopeChoice === "all"
      ? suggestions
      : scopeChoice.startsWith("recent-")
        ? [suggestions[Number(scopeChoice.slice(7))]]
        : topic.trim()
          ? [topic.trim()]
          : [];
  const [kind, setKind] = useState(
    /flashcards?/iu.test(initialQuestion) ? "flashcards" : "quiz",
  );
  const [count, setCount] = useState(
    Number(
      initialQuestion.match(/\b(\d+)\s*(?:câu|thẻ|flashcards?)/iu)?.[1] || 5,
    ),
  );
  const [forceNew, setForceNew] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(null);
  const documents = useQuery({
    queryKey: ["practice-documents", auth.user.id, courseId],
    queryFn: async ({ signal }) => {
      const result = [];
      for (let page = 1; page <= 50; page++) {
        const response = await api(
          `/courses/${courseId}/documents?page=${page}&pageSize=100`,
          { signal, envelope: true },
        );
        result.push(...response.data);
        if (result.length >= response.meta.total || response.data.length < 100)
          break;
      }
      return result.filter((doc) => doc.status === "ready");
    },
    retry: false,
  });
  const selected =
    documents.data?.filter(
      (doc) => documentIds === null || documentIds.includes(doc.id),
    ) || [];
  async function start(event) {
    event.preventDefault();
    if (pending || !scopeChoice || !chosenTopics.length || !selected.length)
      return;
    const focusedTopic = chosenTopics.join("; ");
    const payload = {
      kind,
      count: Number(count),
      topic: focusedTopic.normalize("NFC").slice(0, 150),
      topics: chosenTopics.map((value) => value.normalize("NFC")),
      title: focusedTopic.normalize("NFC").slice(0, 150),
      documentIds: selected.map((doc) => doc.id).sort(),
      generationMode: "ai",
      forceNew,
      ...(sessionId ? { sessionId } : {}),
    };
    const signature = JSON.stringify(payload);
    if (request.current?.signature !== signature)
      request.current = {
        signature,
        body: { ...payload, requestId: crypto.randomUUID() },
      };
    setPending(true);
    setError("");
    try {
      const created = await createSet(
        courseId,
        request.current.body,
        auth.csrfToken,
      );
      void client.invalidateQueries({ queryKey: ['learning', 'list', auth.user.id, courseId] });
      navigate(practiceDestination(courseId, created.id, sessionId ? '' : location.search));
      onClose();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="chat-practice" aria-label="Tạo bài luyện từ hội thoại">
      <h3>Luyện tập từ tài liệu</h3>
      <form onSubmit={start}>
        <fieldset disabled={pending}>
          <fieldset>
            <legend>Bạn muốn luyện phần nào?</legend>
            {suggestions.map((value, index) => (
              <label key={value}>
                <input
                  type="radio"
                  name="practice-focus"
                  checked={scopeChoice === `recent-${index}`}
                  onChange={() => {
                    setScopeChoice(`recent-${index}`);
                    setTopic(value);
                  }}
                />
                {value}
                {index === 0 ? " (gần nhất)" : ""}
              </label>
            ))}
            {suggestions.length > 1 && (
              <label>
                <input
                  type="radio"
                  name="practice-focus"
                  checked={scopeChoice === "all"}
                  onChange={() => {
                    setScopeChoice("all");
                    setTopic(suggestions.join("; "));
                  }}
                />
                Kết hợp {suggestions.length} phần vừa trao đổi
              </label>
            )}
            <label>
              <input
                type="radio"
                name="practice-focus"
                checked={scopeChoice === "custom"}
                onChange={() => {
                  setScopeChoice("custom");
                  setTopic("");
                }}
              />
              Chủ đề khác
            </label>
          </fieldset>
          <label>
            Chủ đề luyện tập
            <input
              required
              maxLength={150}
              value={topic}
              onChange={(event) => {
                setScopeChoice("custom");
                setTopic(event.target.value);
              }}
              placeholder="Bạn muốn luyện chủ đề nào?"
            />
          </label>
          <label>
            Hình thức
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="quiz">Quiz trắc nghiệm</option>
              <option value="flashcards">Flashcard</option>
            </select>
          </label>
          <label>
            Số câu / thẻ
            <input
              type="number"
              min={1}
              max={29}
              required
              value={count}
              onChange={(event) => setCount(event.target.value)}
            />
          </label>
          <p>
            {sessionId
              ? "Phạm vi: tài liệu và các trang của buổi học."
              : "Nguồn: tài liệu đang chọn trong chat."}
          </p>
          <ul>
            {selected.map((doc) => (
              <li key={doc.id}>{doc.fileName}</li>
            ))}
          </ul>
          {documents.isPending && <p role="status">Đang kiểm tra nguồn…</p>}
          {documents.isError && (
            <p role="alert">
              {documents.error.message}
              <Button onClick={() => documents.refetch()}>Thử lại</Button>
            </p>
          )}
          {selected.length > 10 && (
            <p role="alert">
              Chọn tối đa 10 tài liệu trong chat để tạo một bộ học.
            </p>
          )}
          <label>
            <input
              type="checkbox"
              checked={forceNew}
              onChange={(event) => setForceNew(event.target.checked)}
            />
            Tạo bộ mới thay vì dùng lại bộ phù hợp
          </label>
          <div className="actions">
            <Button
              type="submit"
              variant="primary"
              disabled={
                documents.isPending ||
                !scopeChoice ||
                !chosenTopics.length ||
                !selected.length ||
                selected.length > 10
              }
            >
              {pending ? "Đang tạo bài luyện…" : "Bắt đầu luyện tập"}
            </Button>
            <Button onClick={onClose}>Hủy</Button>
          </div>
        </fieldset>
      </form>
      {error && <p role="alert">{error} Bạn có thể thử lại cùng yêu cầu.</p>}
    </section>
  );
}
