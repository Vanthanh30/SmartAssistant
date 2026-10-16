import { Button } from "../../components/ui/Button.jsx";
import { Sparkles, UserRound, Quote } from "lucide-react";
import { AnswerContent } from "./AnswerContent.jsx";
function AssistantAnswer({ message, onCitation }) {
  return <AnswerContent content={message.content} blocks={message.blocks} citations={message.citations} onCitation={onCitation}/>;
}
export function MessageList({
    messages,
    onCitation,
    onCheckRequest,
    pending = false,
}) {
    return (
        <div
            className="chat-transcript"
            aria-live="polite"
            role="region"
            aria-label="Hội thoại với trợ lý"
            tabIndex={0}
        >
            {messages.map((message) => (
                <article key={message.id} className={`chat-message ${message.role}`}>
                    <div className="message-author">
                        {message.role === "user" ? (
                            <UserRound size={17} aria-hidden="true" />
                        ) : (
                            <Sparkles size={17} aria-hidden="true" />
                        )}
                        <strong>{message.role === "user" ? "Bạn" : "Trợ lý"}</strong>
                        {message.createdAt && (
                            <time className="message-time" dateTime={message.createdAt}>
                                {new Date(message.createdAt).toLocaleString("vi-VN")}
                            </time>
                        )}
                    </div>
                    {message.role === "assistant" ? (
                        <AssistantAnswer key={`${message.id}:${message.content}`} message={message}
                            onCitation={onCitation}/>
                    ) : (
                        <p className="chat-text">{message.content}</p>
                    )}
                    {message.role === "user" && message.status === "failed" && (
                        <p role="status">Yêu cầu thất bại ({message.errorCode}).</p>
                    )}
                    {message.role === "user" && message.status === "processing" && (
                        <p role="status">
                            Yêu cầu chưa có kết quả xác nhận.{" "}
                            {onCheckRequest && (
                                <Button
                                    disabled={pending}
                                    onClick={() => onCheckRequest(message)}
                                >
                                    Kiểm tra kết quả cùng yêu cầu
                                </Button>
                            )}
                        </p>
                    )}
                    {message.status === "insufficient_context" &&
                        message.role === "assistant" && (
                            <p className="hint">Chưa đủ căn cứ trong tài liệu.</p>
                        )}
                    {message.citations.length > 0 && (
                        <div className="answer-sources">
                            <span className="hint">Nguồn tài liệu</span>
                            <div className="actions">
                                {message.citations.map((source, index) => (
                                    <Button
                                        className="citation-chip"
                                        key={`${message.id}:${index}`}
                                        onClick={() => onCitation(source)}
                                    >
                                        <Quote size={14} aria-hidden="true" />
                                        {index + 1}. {source.fileName} · tr. {source.pageFrom}
                                        {source.pageTo !== source.pageFrom
                                            ? `–${source.pageTo}`
                                            : ""}
                                        {source.sourceDeleted ? " · nguồn không còn khả dụng" : ""}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    )}
                </article>
            ))}
        </div>
    );
}
