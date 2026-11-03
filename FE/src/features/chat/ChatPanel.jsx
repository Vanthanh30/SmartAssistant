import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api.js";
import { useAuth } from "../auth/useAuth.js";
import { Button } from "../../components/ui/Button.jsx";
import { CitationSource } from "./CitationSource.jsx";
import { Modal } from "../../components/Modal.jsx";
import { MessageList } from "./MessageList.jsx";
import { chatErrorMessage } from "./errorMessage.js";
import { Link } from "react-router-dom";
import { Sparkles, Send, MessageSquare, Plus } from "lucide-react";
import { DocumentScope } from "./DocumentScope.jsx";
import { questionRequest } from "./questionRequest.js";
import {
  isPracticeIntent,
  practiceTopic,
  recentPracticeTopics,
} from "./practiceIntent.js";
const ChatPractice = lazy(() =>
  import("./ChatPractice.jsx").then((module) => ({
    default: module.ChatPractice,
  })),
);

import { isScheduleIntent } from "../studyCalendar/chatPlan.js";
const SchedulingChat = lazy(() =>
  import("../studyCalendar/SchedulingChat.jsx").then((m) => ({
    default: m.SchedulingChat,
  })),
);

export function ChatPanel({
  courseId,
  readyDocumentCount,
  isActive = true,
  documentIds = null,
  onScopeChange,
  onPendingChange,
  sessionId = null,
  fixedConversationId = null,
  onNewConversation,
}) {
  const client = useQueryClient();
  const { data: auth } = useAuth();
  const [params, setParams] = useSearchParams();
  const conversationId = sessionId
    ? fixedConversationId
    : params.get("conversation");
  const validId = conversationId && /^[1-9][0-9]{0,19}$/.test(conversationId);
  const [scheduling, setScheduling] = useState(false);
  const [practice, setPractice] = useState(null);
  const [question, setQuestion] = useState("");
  const [pending, updatePending] = useState(false);
  const setPending = (value) => {
    updatePending(value);
    onPendingChange?.(value);
  };
  const setDocumentIds = (ids) => onScopeChange?.(ids);
  const invalidScope =
    documentIds !== null &&
    (documentIds.length === 0 || documentIds.length > 50);
  const answerMode = "documents";
  const [failure, setFailure] = useState(null);
  const [request, setRequest] = useState(null);
  const [citation, setCitation] = useState(null);
  const transcript = useQuery({
    queryKey: ["chat", auth?.user.id, courseId, conversationId],
    enabled: isActive && !!validId,
    retry: false,
    staleTime: 0,
    refetchInterval: (query) =>
      !isActive
        ? false
        : query.state.data?.messages.some(
              (message) => message.status === "processing",
            )
          ? 3000
          : 10000,
    refetchIntervalInBackground: false,
    queryFn: async ({ signal }) => {
      const detail = await api(`/conversations/${conversationId}`, { signal });
      if (detail.conversation.courseId !== courseId)
        throw new Error("Hội thoại không thuộc môn học này.");
      return detail;
    },
  });
  async function submit(
    replay = false,
    supplied = null,
    presetQuestion = null,
  ) {
    if (pending) return;
    const currentQuestion = presetQuestion ?? question;
    if (
      !sessionId &&
      !replay &&
      !supplied &&
      auth &&
      isScheduleIntent(currentQuestion)
    ) {
      setScheduling(true);
      setQuestion("");
      setFailure(null);
      return;
    }
    if (
      !replay &&
      !supplied &&
      (!auth ||
        (answerMode !== "general" && readyDocumentCount < 1) ||
        invalidScope ||
        !currentQuestion.trim() ||
        [...currentQuestion.trim().normalize("NFC")].length > 1000 ||
        (conversationId &&
          (!validId || transcript.isError || transcript.isPending)))
    )
      return;
    if (!replay && !supplied && isPracticeIntent(currentQuestion)) {
      setPractice({
        topic: practiceTopic(currentQuestion, []),
        suggestions: recentPracticeTopics(transcript.data?.messages || []),
        question: currentQuestion,
        conversationId,
      });
      setQuestion("");
      setFailure(null);
      return;
    }
    setPending(true);
    setCitation(null);
    setFailure(null);
    let attempt = supplied || (replay ? request : null);
    try {
      if (!attempt) {
        let id = conversationId;
        if (!id) {
          const created = await api(`/courses/${courseId}/conversations`, {
            method: "POST",
            body: {},
            csrfToken: auth.csrfToken,
          });
          id = created.id;
          setParams((previous) => {
            const next = new URLSearchParams(previous);
            next.set("conversation", id);
            return next;
          });
        }
        attempt = {
          id,
          question: currentQuestion.trim().normalize("NFC"),
          answerMode,
          preserveDraft: !!presetQuestion,
          documentIds: documentIds === null ? null : [...documentIds],
          requestId: crypto.randomUUID(),
          ...(sessionId ? { sessionId } : {}),
        };
        setRequest(attempt);
      }
      await api(`/conversations/${attempt.id}/questions`, {
        method: "POST",
        body: questionRequest(attempt),
        csrfToken: auth.csrfToken,
        timeoutMs: 180000,
      });
      if (!attempt.preserveDraft) setQuestion("");
      await client.invalidateQueries({
        queryKey: ["chat", auth.user.id, courseId, attempt.id],
      });
      setRequest(null);
    } catch (error) {
      setFailure({
        message: chatErrorMessage(error),
        details: error.details,
        requestId: attempt?.requestId,
      });
      if (
        error.status &&
        error.code !== "INVALID_RESPONSE" &&
        error.code !== "QUESTION_IN_PROGRESS" &&
        !error.details?.newRequestRequired
      )
        setRequest(null);
      if (attempt)
        await client.invalidateQueries({
          queryKey: ["chat", auth.user.id, courseId, attempt.id],
        });
    } finally {
      setPending(false);
    }
  }
  const blocked =
    pending ||
    (invalidScope && !isScheduleIntent(question)) ||
    (answerMode !== "general" &&
      readyDocumentCount < 1 &&
      !isScheduleIntent(question)) ||
    (conversationId &&
      (!validId || transcript.isError || transcript.isPending) &&
      !isScheduleIntent(question));
  const failureInTranscript =
    failure?.requestId &&
    transcript.data?.messages.some(
      (message) =>
        message.role === "assistant" &&
        message.status === "failed" &&
        message.requestId === failure.requestId,
    );
  return (
    <div className="chat-workspace">
      <section className="chat-panel" aria-label="Hỏi đáp môn học">
        <div className="chat-heading">
          <h2>
            <Sparkles size={23} aria-hidden="true" />
            {sessionId ? "Hỏi đáp buổi học" : "Hỏi tài liệu môn học"}
          </h2>
          <div className="actions">
            <Link to={`/app/history?courseId=${courseId}`}>
              Lịch sử môn học
            </Link>
            <Button
              disabled={pending}
              onClick={() => {
                if (sessionId) {
                  onNewConversation?.();
                  return;
                }
                setParams((previous) => {
                  const next = new URLSearchParams(previous);
                  next.delete("conversation");
                  return next;
                });
                setCitation(null);
                setFailure(null);
                setRequest(null);
                setQuestion("");
              }}
            >
              <Plus size={16} aria-hidden="true" />
              Hội thoại mới
            </Button>
          </div>
        </div>
        {!scheduling && (
          <>
            {!sessionId && (
              <DocumentScope
                courseId={courseId}
                userId={auth.user.id}
                documentIds={documentIds}
                isActive={isActive}
                disabled={pending}
                onChange={(ids) => {
                  setDocumentIds(ids);
                  setRequest(null);
                  setFailure(null);
                }}
              />
            )}
            {readyDocumentCount < 1 && (
              <p role="status">
                Hãy tải PDF và chờ ít nhất một tài liệu sẵn sàng trước khi hỏi.
              </p>
            )}
            {conversationId && !validId && (
              <p role="alert">ID hội thoại không hợp lệ.</p>
            )}
            {validId && transcript.isPending && (
              <p role="status">Đang tải hội thoại…</p>
            )}
            {transcript.isError && (
              <p role="alert">
                {transcript.error.message}{" "}
                <Button onClick={() => transcript.refetch()}>Tải lại</Button>
              </p>
            )}
            {transcript.data?.hasOlderMessages && (
              <p className="hint">
                Đang hiển thị 100 tin nhắn gần nhất.{" "}
                <Link to={`/app/history/${conversationId}`}>
                  Xem toàn bộ lịch sử
                </Link>
              </p>
            )}
            {!conversationId && !pending && (
              <div className="chat-empty">
                <span className="empty-icon">
                  <MessageSquare size={28} aria-hidden="true" />
                </span>
                <h3>Cùng khám phá tài liệu của bạn</h3>
                <p>
                  Đặt câu hỏi, tìm ý chính hoặc làm rõ một khái niệm.
                  <br />
                  Mở nguồn trích dẫn để kiểm tra câu trả lời.
                </p>
              </div>
            )}
            <MessageList
              messages={transcript.data?.messages ?? []}
              onCitation={setCitation}
              onCheckRequest={(message) => {
                setQuestion(message.content);
                void transcript.refetch({ cancelRefetch: false });
              }}
              pending={pending}
              pendingQuestion={request?.question}
              pendingRequestId={request?.requestId}
            />
            {practice && practice.conversationId === conversationId && (
              <Suspense fallback={<p role="status">Đang mở luyện tập…</p>}>
                <ChatPractice
                  key={`${courseId}:${conversationId}:${JSON.stringify(documentIds)}:${practice.question}`}
                  courseId={courseId}
                  sessionId={sessionId}
                  documentIds={documentIds}
                  auth={auth}
                  initialTopic={practice.topic}
                  suggestions={practice.suggestions}
                  initialQuestion={practice.question}
                  onClose={() => setPractice(null)}
                />
              </Suspense>
            )}
            {citation && (
              <Modal
                open
                onOpenChange={(open) => {
                  if (!open) setCitation(null);
                }}
                title="Nguồn trích dẫn"
                description="Đối chiếu câu trả lời với trang PDF gốc."
                className="citation-preview-modal"
              >
                <CitationSource
                  inline
                  key={`${citation.documentId}:${citation.chunkId}`}
                  citation={citation}
                  close={() => setCitation(null)}
                />
              </Modal>
            )}
            {failure && (!failureInTranscript || request) && (
              <div role="alert">
                {!failureInTranscript && <p>{failure.message}</p>}
                {request && (
                  <Button
                    disabled={pending}
                    onClick={() => submit(!failure.details?.newRequestRequired)}
                  >
                    {failure.details?.newRequestRequired
                      ? "Gửi lại bằng yêu cầu mới"
                      : "Kiểm tra lại cùng yêu cầu"}
                  </Button>
                )}
                {failure.details?.newRequestRequired && (
                  <p className="hint">
                    Yêu cầu mới dùng UUID mới và tính vào hạn mức hỏi của hệ
                    thống; Yêu cầu cũ sẽ không tự chạy lại.
                  </p>
                )}
              </div>
            )}
          </>
        )}
        {scheduling ? (
          <Suspense fallback={<p role="status">Đang mở trợ lý lên lịch…</p>}>
            <SchedulingChat
              courseId={courseId}
              auth={auth}
              onClose={() => setScheduling(false)}
            />
          </Suspense>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label htmlFor="chat-question">Câu hỏi của bạn</label>
            <textarea
              id="chat-question"
              onKeyDown={(event) => {
                if (
                  event.key !== "Enter" ||
                  event.shiftKey ||
                  event.nativeEvent.isComposing ||
                  event.keyCode === 229
                )
                  return;
                event.preventDefault();
                if (
                  !event.repeat &&
                  !blocked &&
                  !pending &&
                  !request &&
                  question.trim() &&
                  [...question.trim().normalize("NFC")].length <= 1000
                )
                  event.currentTarget.form?.requestSubmit();
              }}
              value={question}
              disabled={pending}
              maxLength={2000}
              rows={4}
              onChange={(event) => {
                setQuestion(event.target.value);
                setRequest(null);
                setFailure(null);
              }}
              placeholder="Bạn muốn tìm hiểu điều gì trong tài liệu?"
            />
            <div className="chat-heading">
              <span>
                {[...question.trim().normalize("NFC")].length}/1.000 ký tự
              </span>
              <Button
                variant="primary"
                type="submit"
                disabled={
                  blocked ||
                  !question.trim() ||
                  [...question.trim().normalize("NFC")].length > 1000 ||
                  !!request
                }
              >
                <Send size={17} aria-hidden="true" />
                Gửi câu hỏi
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
