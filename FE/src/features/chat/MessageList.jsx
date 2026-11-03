import { Button } from "../../components/ui/Button.jsx";
import { Sparkles, UserRound, Quote } from "lucide-react";
import { AnswerContent } from "./AnswerContent.jsx";
import { chatErrorMessage } from './errorMessage.js';
import { useLayoutEffect, useRef } from 'react';
import { scrollToLatestMessage } from './scrollTranscript.js';
function AssistantAnswer({ message, onCitation }) {
  if (message.status === 'failed') return <p className="chat-text">{chatErrorMessage(message.content)}</p>;
  return <AnswerContent content={message.content} blocks={message.blocks} citations={message.citations} onCitation={onCitation}/>;
}
export function MessageList({
    messages,
    onCitation,
    onCheckRequest,
    pending = false,
    pendingQuestion = null,
    pendingRequestId = null,
}) {
    const transcriptRef = useRef(null);
    const visibleMessages = messages.filter(message => !(pending && pendingRequestId &&
        message.role === 'assistant' && message.requestId === pendingRequestId && message.status === 'processing'));
    if (pending && pendingQuestion && pendingRequestId) {
        if (!messages.some(message => message.role === 'user' && message.requestId === pendingRequestId)) {
            visibleMessages.push({ id: `${pendingRequestId}:pending-user`, role: 'user', content: pendingQuestion, citations: [], status: 'sent' });
        }
        if (!messages.some(message => message.role === 'assistant' && message.requestId === pendingRequestId && message.status !== 'processing')) {
            visibleMessages.push({ id: `${pendingRequestId}:pending-answer`, role: 'assistant', content: 'Đang tìm câu trả lời…', citations: [], status: 'processing' });
        }
    }
    const latest = visibleMessages.at(-1);
    const latestKey = latest ? `${latest.id}:${latest.status}:${latest.content}` : '';
    useLayoutEffect(() => {
        const container = transcriptRef.current;
        if (!container || !latestKey) return;
        const frame = requestAnimationFrame(() => {
            container.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            scrollToLatestMessage(container);
        });
        return () => cancelAnimationFrame(frame);
    }, [latestKey]);
    return (
        <div
            ref={transcriptRef}
            className="chat-transcript"
            aria-live="polite"
            role="region"
            aria-label="Hội thoại với trợ lý"
            tabIndex={0}
        >
            {visibleMessages.map((message) => (
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
                    {message.role === "user" && message.status === "processing" && !pending && (
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
