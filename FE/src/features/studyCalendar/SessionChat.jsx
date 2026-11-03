import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChatPanel } from "../chat/ChatPanel.jsx";
import { calendarWrite } from "./api.js";
import { Button } from "../../components/ui/Button.jsx";
import { api } from "../../lib/api.js";
export function SessionChat({ session, lesson, auth, onClose }) {
  const client = useQueryClient(),
    key = ["session-conversation", auth.user.id, session.id];
  const getConversation = async (newConversation = false) => {
    try {
      return await calendarWrite(
        `/lich-hoc/${session.id}/hoi-thoai`,
        { newConversation },
        auth.csrfToken,
      );
    } catch (error) {
      if (error.status === 404) {
        await api(`/lich-hoc/${session.id}`);
        throw new Error(
          "Backend chưa nạp API hỏi đáp buổi học. Khởi động lại BE đang chạy để bật tính năng này.",
          { cause: error },
        );
      }
      throw error;
    }
  };
  const conversation = useQuery({
    queryKey: key,
    queryFn: () => getConversation(),
    retry: false,
    staleTime: Infinity,
  });
  const fresh = useMutation({
    mutationFn: () => getConversation(true),
    onSuccess: (data) => client.setQueryData(key, data),
  });
  const documents = [...new Set(lesson.resources.map((r) => r.documentId))];
  return (
    <aside
      className="session-chat"
      id="session-chat"
      aria-label="Trợ lý trong buổi học"
    >
      <header className="session-panel-heading">
        <h2>Hỏi trợ lý</h2>
        <Button onClick={onClose}>Đóng khung hỏi đáp</Button>
      </header>
      <p className="hint">
        Câu trả lời dựa trên tài liệu và phạm vi trang của buổi học này.
      </p>
      <details>
        <summary>Nguồn hỏi đáp · {documents.length} tài liệu</summary>
        <ul>
          {lesson.resources.map((r, i) => (
            <li key={i}>
              {r.fileName} · trang {r.pageFrom}
              {r.pageTo === r.pageFrom ? "" : `–${r.pageTo}`}
            </li>
          ))}
        </ul>
      </details>
      {conversation.isPending ? (
        <p role="status">Đang mở hội thoại của buổi…</p>
      ) : conversation.isError ? (
        <div role="alert">
          <p>{conversation.error.message}</p>
          <Button onClick={() => conversation.refetch()}>Thử mở lại</Button>
        </div>
      ) : fresh.isPending ? (
        <p role="status">Đang mở hội thoại mới…</p>
      ) : (
        <ChatPanel
          key={conversation.data.id}
          courseId={session.courseId}
          readyDocumentCount={documents.length}
          documentIds={documents}
          sessionId={session.id}
          fixedConversationId={conversation.data.id}
          onNewConversation={() => fresh.mutate()}
        />
      )}
      {fresh.isError && <p role="alert">{fresh.error.message}</p>}
    </aside>
  );
}
