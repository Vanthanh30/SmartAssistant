import { lazy, Suspense, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Layers,
  Target,
  MessageSquare,
} from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/useAuth.js";
import { api } from "../../lib/api.js";
import { Button } from "../../components/ui/Button.jsx";
import { StatusPanel } from "../../components/StatusPanel.jsx";
import { when, localNow } from "./dates.js";
import { getDocument } from "../documents/api.js";
import { createSet, listAttempts } from "../learning/api.js";
import { calendarWrite } from "./api.js";
import { StudySessionForm } from "./StudySessionForm.jsx";
import { sessionStudyModel } from "./sessionStudyModel.js";
const PdfViewer = lazy(() =>
  import("../documents/PdfViewer.jsx").then((m) => ({ default: m.PdfViewer })),
);
const StudyContent = lazy(() =>
  import("../learning/StudyPage.jsx").then((m) => ({
    default: m.StudyContent,
  })),
);
const SessionChat = lazy(() =>
  import("./SessionChat.jsx").then((m) => ({ default: m.SessionChat })),
);
const steps = [
  { id: "overview", label: "Nội dung buổi học", icon: Target },
  { id: "read", label: "Đọc tài liệu", icon: BookOpen },
  { id: "practice", label: "Luyện tập", icon: Layers },
];
export function SessionStudyPage() {
  const { sessionId } = useParams();
  return <Classroom key={sessionId} sessionId={sessionId} />;
}

function Classroom({ sessionId }) {
  const { data: auth } = useAuth(),
    client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("overview"),
    [resourceIndex, setResourceIndex] = useState(0),
    [activeSet, setActiveSet] = useState(null),
    [review, setReview] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [requests] = useState(() => ({
    quiz: crypto.randomUUID(),
    flashcards: crypto.randomUUID(),
  }));
  const session = useQuery({
    queryKey: ["study-session", auth.user.id, sessionId],
    queryFn: ({ signal }) => api(`/lich-hoc/${sessionId}`, { signal }),
    retry: false,
  });
  const data = session.data,
    lesson = data ? sessionStudyModel(data) : null,
    resource = lesson?.resources[resourceIndex];
  const document = useQuery({
    queryKey: ["session-document", auth.user.id, resource?.documentId],
    enabled: tab === "read" && !!resource,
    queryFn: ({ signal }) => getDocument(resource.documentId, signal),
    retry: false,
    staleTime: 60000,
  });
  const practiceKey = ["session-practice", auth.user.id, sessionId];
  const practice = useQuery({
    queryKey: practiceKey,
    enabled: !!data,
    queryFn: async ({ signal }) => {
      const sets = [];
      for (let page = 1; page <= 100; page++) {
        const result = await api(
          `/courses/${data.courseId}/learning-sets?page=${page}&pageSize=100`,
          { signal, envelope: true },
        );
        sets.push(...result.data.filter((s) => s.sessionId === sessionId));
        if (page * 100 >= result.meta.total) break;
      }
      return Promise.all(
        sets.map(async (set) => ({
          ...set,
          attempts: await listAttempts(set.id, signal),
        })),
      );
    },
    retry: false,
  });
  function openSet(id) {
    const next = new URLSearchParams(params);
    next.delete("studyAttempt");
    setParams(next, { replace: true });
    setActiveSet(id);
    setTab("practice");
  }
  const generate = useMutation({
    mutationFn: (kind) => {
      const existing = practice.data?.find((s) => s.kind === kind);
      return (
        existing ||
        createSet(
          data.courseId,
          {
            requestId: requests[kind],
            kind,
            title:
              `${data.title} · ${kind === "quiz" ? "Quiz" : "Flashcard"}`.slice(
                0,
                150,
              ),
            count: kind === "quiz" ? lesson.quizCount : lesson.flashcardCount,
            documentIds: [
              ...new Set(lesson.resources.map((r) => r.documentId)),
            ],
            sessionId,
            generationMode: "ai",
            forceNew: false,
          },
          auth.csrfToken,
        )
      );
    },
    onSuccess: (result) => {
      openSet(result.id);
      client.invalidateQueries({ queryKey: practiceKey });
    },
  });
  const complete = useMutation({
    mutationFn: () =>
      calendarWrite(
        `/lich-hoc/${sessionId}/hoan-thanh`,
        { version: data.version },
        auth.csrfToken,
      ),
    onSuccess: () => {
      session.refetch();
      client.invalidateQueries({ queryKey: ["study-calendar"] });
    },
  });
  if (session.isPending) return <StatusPanel title="Đang mở buổi học…" />;
  if (session.isError)
    return (
      <StatusPanel
        title="Chưa mở được buổi học"
        retry={() => session.refetch()}
      >
        <p>{session.error.message}</p>
        <Link to="/app/study-calendar">Quay lại lịch học</Link>
      </StatusPanel>
    );
  const latest = (practice.data || [])
    .filter((s) => s.kind === "quiz")
    .flatMap((s) => s.attempts || [])
    .filter((a) => a.completedAt && a.score !== null)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0];
  const missed = data.status === "planned" && new Date(data.end) < new Date(),
    minutes = Math.max(
      1,
      Math.round((new Date(data.end) - new Date(data.start)) / 60000),
    );
  const start = localNow()
    .plus({ days: 1 })
    .set({ hour: 19, minute: 0, second: 0, millisecond: 0 });
  const disabled = data.status === "cancelled" || !lesson.resources.length;
  return (
    <section className={`session-classroom ${chatOpen ? "with-chat" : ""}`}>
      <Link className="session-back" to="/app/study-calendar">
        <ArrowLeft size={16} /> Quay lại lịch học
      </Link>
      <header className="session-classroom-heading">
        <div>
          <span className="session-eyebrow">BUỔI HỌC CỦA BẠN</span>
          <h1>{data.title}</h1>
          <p>
            {when(data.start)} · {minutes} phút
          </p>
        </div>
        <Button
          variant="primary"
          disabled={!lesson.resources.length}
          onClick={() => {
            setChatOpen((v) => !v);
            if (!chatOpen && window.innerWidth < 1100)
              setTimeout(
                () =>
                  document
                    .getElementById("session-chat")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                100,
              );
          }}
        >
          <MessageSquare size={18} />
          {chatOpen ? "Ẩn hỏi đáp" : "Hỏi trợ lý"}
        </Button>
        <span className={`session-status ${data.status}`}>
          {data.status === "completed"
            ? "Đã hoàn thành"
            : data.status === "cancelled"
              ? "Đã hủy"
              : "Chưa hoàn thành"}
        </span>
      </header>
      {data.status === "cancelled" && (
        <p className="session-notice">
          Buổi đã hủy. Bạn vẫn có thể xem nội dung và tài liệu đã lưu.
        </p>
      )}
      <div className="session-classroom-grid">
        <aside className="session-sidebar">
          <nav aria-label="Các bước học trong buổi">
            {steps.map(({ id, label, icon: Icon }, i) => (
              <button
                type="button"
                key={id}
                className={tab === id ? "active" : ""}
                aria-current={tab === id ? "step" : undefined}
                onClick={() => setTab(id)}
              >
                <Icon size={19} />
                <span>
                  <small>BƯỚC {i + 1}</small>
                  {label}
                </span>
              </button>
            ))}
          </nav>
          <div className="session-sidebar-summary">
            <strong>Phạm vi buổi học</strong>
            <p>
              {lesson.resources.length} phần tài liệu · {lesson.quizCount} câu
              quiz · {lesson.flashcardCount} flashcard
            </p>
            {latest && (
              <p>
                Quiz gần nhất: <strong>{latest.score}/100</strong>
              </p>
            )}
            <p>Xác nhận hoàn thành sau khi bạn đã học xong.</p>
          </div>
          {data.status === "planned" && (
            <Button
              className="session-complete"
              disabled={complete.isPending}
              onClick={() => complete.mutate()}
            >
              <CheckCircle2 size={17} />
              {complete.isPending ? "Đang lưu…" : "Hoàn thành buổi học"}
            </Button>
          )}
          {complete.isError && <p role="alert">{complete.error.message}</p>}
        </aside>
        <main className="session-workspace">
          {tab === "overview" && (
            <>
              <div className="session-panel-heading">
                <div>
                  <h2>Hôm nay học gì?</h2>
                  <p>Xem mục tiêu và bắt đầu theo các bước bên dưới.</p>
                </div>
                <Button
                  variant="primary"
                  disabled={!lesson.resources.length}
                  onClick={() => setTab("read")}
                >
                  Bắt đầu đọc <ArrowRight size={17} />
                </Button>
              </div>
              <section className="session-objectives">
                <h3>Mục tiêu buổi học</h3>
                <ul>
                  {lesson.objectives.map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ul>
              </section>
              {lesson.prepared ? (
                <section>
                  <h3>Kiến thức cần nắm</h3>
                  <div className="session-topic-grid">
                    {lesson.topics.map((t, i) => (
                      <article key={i}>
                        <span>PHẦN {i + 1}</span>
                        <h4>{t.title}</h4>
                        <p>{t.content}</p>
                      </article>
                    ))}
                  </div>
                </section>
              ) : (
                <p className="session-notice">
                  Buổi này được lưu theo khoảng trang. Bạn có thể đọc tài liệu
                  và làm bài luyện ngay trong buổi học.
                </p>
              )}
              <section>
                <h3>Lộ trình trong buổi</h3>
                <ol className="session-activity-list">
                  {lesson.activities.map((a, i) => (
                    <li key={i}>
                      <span>{a.minutes} phút</span>
                      <div>
                        <strong>
                          {
                            {
                              read: "Đọc và tìm hiểu",
                              practice: "Luyện tập",
                              review: "Ôn và tự kiểm tra",
                            }[a.kind]
                          }
                        </strong>
                        <p>{a.instruction}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
              <section>
                <h3>Tài liệu cần học</h3>
                <div className="session-resource-list">
                  {lesson.resources.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setResourceIndex(i);
                        setTab("read");
                      }}
                    >
                      <BookOpen size={19} />
                      <span>
                        {r.fileName}
                        <small>
                          Trang {r.pageFrom}–{r.pageTo}
                        </small>
                      </span>
                      <ArrowRight size={17} />
                    </button>
                  ))}
                </div>
                {!lesson.resources.length && (
                  <p role="alert">
                    Chưa có phạm vi tài liệu hợp lệ. Hãy quay lại lịch để chọn
                    nguồn.
                  </p>
                )}
              </section>
            </>
          )}
          {tab === "read" && (
            <>
              <div className="session-panel-heading">
                <div>
                  <h2>Đọc tài liệu của buổi học</h2>
                  <p>
                    Đọc các trang được giao, ghi lại ý chính rồi chuyển sang
                    luyện tập.
                  </p>
                </div>
                <Button onClick={() => setTab("practice")}>
                  Sang luyện tập <ArrowRight size={17} />
                </Button>
              </div>
              {!!lesson.resources.length && (
                <label className="session-resource-picker">
                  Chọn phần tài liệu
                  <select
                    value={resourceIndex}
                    onChange={(e) => setResourceIndex(Number(e.target.value))}
                  >
                    {lesson.resources.map((r, i) => (
                      <option key={i} value={i}>
                        {r.fileName} · trang {r.pageFrom}–{r.pageTo}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!resource ? (
                <p>Chưa có tài liệu để mở.</p>
              ) : document.isPending ? (
                <p role="status">Đang mở tài liệu…</p>
              ) : document.isError ? (
                <StatusPanel
                  title="Chưa tải được tài liệu"
                  retry={() => document.refetch()}
                >
                  <p>{document.error.message}</p>
                </StatusPanel>
              ) : (
                <div className="session-pdf-region">
                  <p>
                    <strong>{document.data.fileName}</strong> · Phạm vi học:
                    trang {resource.pageFrom}–{resource.pageTo}
                  </p>
                  <Suspense fallback={<p>Đang chuẩn bị trình đọc PDF…</p>}>
                    <PdfViewer
                      key={`${resource.documentId}:${resource.pageFrom}:${resource.pageTo}`}
                      document={document.data}
                      initialPage={resource.pageFrom}
                      pageFrom={resource.pageFrom}
                      pageTo={resource.pageTo}
                      compact
                    />
                  </Suspense>
                </div>
              )}
            </>
          )}
          {tab === "practice" && (
            <>
              <div className="session-panel-heading">
                <div>
                  <h2>Luyện tập theo buổi học</h2>
                  <p>Câu hỏi từ đúng tài liệu và khoảng trang của buổi này.</p>
                </div>
              </div>
              <div className="session-practice-grid">
                {[
                  {
                    kind: "quiz",
                    title: "Quiz trắc nghiệm",
                    count: lesson.quizCount,
                  },
                  {
                    kind: "flashcards",
                    title: "Thẻ ghi nhớ",
                    count: lesson.flashcardCount,
                  },
                ].map((item) => (
                  <article key={item.kind}>
                    <Layers size={23} />
                    <h3>{item.title}</h3>
                    <p>
                      {item.count}{" "}
                      {item.kind === "quiz"
                        ? "câu hỏi để kiểm tra và xem giải thích."
                        : "thẻ để ghi nhớ và tự đánh giá."}
                    </p>
                    <Button
                      variant="primary"
                      disabled={
                        disabled || generate.isPending || practice.isPending
                      }
                      onClick={() => generate.mutate(item.kind)}
                    >
                      {practice.data?.some((s) => s.kind === item.kind)
                        ? "Mở bài đã tạo"
                        : "Bắt đầu luyện"}
                    </Button>
                  </article>
                ))}
              </div>
              {generate.isPending && (
                <p role="status" className="session-notice">
                  Đang tạo bài luyện từ tài liệu. Bạn không cần bấm lại.
                </p>
              )}
              {generate.isError && <p role="alert">{generate.error.message}</p>}
              {practice.isError && (
                <p role="alert">
                  Chưa tải được bài luyện đã lưu.{" "}
                  <Button onClick={() => practice.refetch()}>Thử lại</Button>
                </p>
              )}
              {activeSet && (
                <section className="session-active-practice">
                  <div className="session-panel-heading">
                    <h3>Bài luyện đang mở</h3>
                    <Button onClick={() => setActiveSet(null)}>
                      Thu gọn bài luyện
                    </Button>
                  </div>
                  <Suspense fallback={<p>Đang mở bài luyện…</p>}>
                    <StudyContent key={activeSet} setId={activeSet} embedded />
                  </Suspense>
                </section>
              )}
              {!!practice.data?.length && (
                <details>
                  <summary>Bài luyện đã lưu trong buổi</summary>
                  {practice.data.map((s) => (
                    <p key={s.id}>
                      <Button onClick={() => openSet(s.id)}>{s.title}</Button> ·{" "}
                      {s.attempts?.length || 0} lượt học
                    </p>
                  ))}
                </details>
              )}
            </>
          )}
          {(missed || latest?.score < 60) && (
            <section className="session-adjustment">
              <h3>Điều chỉnh việc học</h3>
              {missed && (
                <p>
                  Buổi này đã qua giờ dự kiến. Bạn có thể học ngay hoặc quay lại
                  lịch chọn giờ thay thế.
                </p>
              )}
              {latest?.score < 60 && (
                <p>
                  Quiz gần nhất dưới 60/100. Bạn nên ôn lại nội dung chưa nắm
                  trước khi sang buổi tiếp theo.
                </p>
              )}
              <Button onClick={() => setReview(true)}>
                Thêm buổi ôn để xem và xác nhận
              </Button>{" "}
              <Link to="/app/study-calendar">Dời giờ trên lịch</Link>
            </section>
          )}
        </main>
        {chatOpen && (
          <Suspense fallback={<p role="status">Đang mở khung hỏi đáp…</p>}>
            <SessionChat
              session={data}
              lesson={lesson}
              auth={auth}
              onClose={() => setChatOpen(false)}
            />
          </Suspense>
        )}
      </div>
      {review && (
        <StudySessionForm
          initialSlot={{
            ...data,
            title: `Ôn lại: ${data.title}`.slice(0, 200),
            start: start.toUTC().toISO(),
            end: start.plus({ minutes }).toUTC().toISO(),
            googleSync: false,
          }}
          courses={[{ id: data.courseId, name: "Môn học của buổi này" }]}
          csrfToken={auth.csrfToken}
          onClose={() => setReview(false)}
          onSaved={() =>
            client.invalidateQueries({ queryKey: ["study-calendar"] })
          }
        />
      )}
    </section>
  );
}
