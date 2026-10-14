import { lazy, Suspense, useCallback, useState } from "react";
import { Button } from "../../components/ui/Button.jsx";
import { Sparkles, UserRound, Quote } from "lucide-react";
import { AnswerContent } from "./AnswerContent.jsx";
const FormulaImage = lazy(() => import("./FormulaImage.jsx").then(module => ({ default: module.FormulaImage })));
function AssistantAnswer({ message, question, onCitation }) {
    const [loaded, setLoaded] = useState({});
    const [showExtracted, setShowExtracted] = useState(false);
    const onImageReady = useCallback((key, ready) => {
        setLoaded(previous => previous[key] === ready ? previous : { ...previous, [key]: ready });
    }, []);
    const showImages = message.citations.length > 0 && (/[=≈∝]/.test(message.content) || /công thức|số mol/i.test(question));
    const previews = showImages ? message.citations.slice(0, 2) : [];
    const formulaImageReady = previews.length > 0 && previews.length === message.citations.length && previews.every(citation =>
        !citation.sourceDeleted && loaded[`${citation.documentId}:${citation.chunkId}`]);
    return <>
        {message.content.startsWith('Không dựa trên tài liệu\n') && <p className="hint" role="note">Không dựa trên tài liệu · không có trích dẫn PDF</p>}
        <AnswerContent content={message.content} hasSources={message.citations.length > 0} formulaImageReady={formulaImageReady && !showExtracted}/>
        {formulaImageReady && <Button aria-pressed={showExtracted} onClick={() => setShowExtracted(value => !value)}>{showExtracted ? 'Ẩn công thức trích xuất' : 'Hiện công thức trích xuất để đối chiếu'}</Button>}
        {showImages && <Suspense fallback={<p className="hint">Đang tải ảnh công thức; nội dung trích xuất vẫn được giữ ở trên.</p>}>
            {previews.map(citation => <FormulaImage key={`${citation.documentId}:${citation.chunkId}`} citation={citation}
                question={question || message.content} onOpen={onCitation} onImageReady={onImageReady}/>)}
        </Suspense>}
    </>;
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
            {messages.map((message, messageIndex) => (
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
                            question={messages.slice(0, messageIndex).findLast(item => item.role === "user")?.content || ""}
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
