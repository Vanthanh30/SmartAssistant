import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../auth/useAuth.js';
import { Button } from '../../components/ui/Button.jsx';
import { CitationSource } from './CitationSource.jsx';
import { MessageList } from './MessageList.jsx';
import { Link } from 'react-router-dom';
import { Sparkles, Send, MessageSquare, Plus } from 'lucide-react';


export function ChatPanel({ courseId, readyDocumentCount, isActive = true }) {
  const client = useQueryClient();
  const { data: auth } = useAuth(); const [params,setParams] = useSearchParams();
  const conversationId = params.get('conversation');
  const validId = conversationId && /^[1-9][0-9]{0,19}$/.test(conversationId);
  const [question,setQuestion] = useState(''); const [pending,setPending] = useState(false);
  const [answerMode,setAnswerMode] = useState('documents');
  const [failure,setFailure] = useState(null); const [request,setRequest] = useState(null); const [citation,setCitation] = useState(null);
  const transcript = useQuery({ queryKey: ['chat',auth?.user.id,courseId,conversationId], enabled: isActive && !!validId, retry: false, staleTime: 0,
    refetchInterval: query => !isActive ? false : query.state.data?.messages.some(message => message.status === 'processing') ? 3000 : 10000,
    refetchIntervalInBackground: false,
    queryFn: async ({ signal }) => {
      const detail = await api(`/conversations/${conversationId}`, { signal });
      if (detail.conversation.courseId !== courseId) throw new Error('Hội thoại không thuộc môn học này.');
      return detail;
    } });
  async function submit(replay = false, supplied = null) {
    if (pending) return;
    if (!replay && !supplied && (!auth || (answerMode !== 'general' && readyDocumentCount < 1) || !question.trim() || [...question.trim().normalize('NFC')].length > 1000 || (conversationId && (!validId || transcript.isError || transcript.isPending)))) return;
    setPending(true); setFailure(null);
    let attempt = supplied || (replay ? request : null);
    try {
      if (!attempt) {
        let id = conversationId;
        if (!id) {
          const created = await api(`/courses/${courseId}/conversations`, { method:'POST',body:{},csrfToken:auth.csrfToken });
          id = created.id; setParams(previous => { const next = new URLSearchParams(previous); next.set('conversation',id); return next; });
        }
        attempt = { id, question: question.trim().normalize('NFC'), answerMode, requestId: crypto.randomUUID() }; setRequest(attempt);
      }
      await api(`/conversations/${attempt.id}/questions`, { method:'POST', body:{ question:attempt.question,requestId:attempt.requestId,answerMode:attempt.answerMode || 'auto' },csrfToken:auth.csrfToken,timeoutMs:180000 });
      setQuestion(''); setRequest(null); await client.invalidateQueries({ queryKey:['chat',auth.user.id,courseId,attempt.id] });
    } catch (error) {
      setFailure(error);
       if (error.status && error.code !== 'INVALID_RESPONSE' && error.code !== 'QUESTION_IN_PROGRESS' && !error.details?.newRequestRequired) setRequest(null);
      if (attempt) await client.invalidateQueries({ queryKey:['chat',auth.user.id,courseId,attempt.id] });
    } finally { setPending(false); }
  }
  const blocked = pending || (answerMode !== 'general' && readyDocumentCount < 1) || (conversationId && (!validId || transcript.isError || transcript.isPending));
  return <div className={`chat-workspace ${citation ? 'has-source' : ''}`}><section className="chat-panel" aria-label="Hỏi đáp môn học">
    <div className="chat-heading"><h2><Sparkles size={23} aria-hidden="true"/>Hỏi tài liệu môn học</h2><div className="actions"><Link to={`/app/history?courseId=${courseId}`}>Lịch sử môn học</Link><Button disabled={pending} onClick={() => { setParams(previous => { const next = new URLSearchParams(previous); next.delete('conversation'); return next; }); setCitation(null);setFailure(null);setRequest(null);setQuestion(''); }}><Plus size={16} aria-hidden="true"/>Hội thoại mới</Button></div></div>
    <p className="hint">Chế độ tài liệu chỉ trả lời từ nguồn PDF đã kiểm quyền: dùng LLM để giải thích khi được cấu hình, hoặc trích đoạn trực tiếp. Thiếu nguồn sẽ thông báo rõ, không chuyển sang kiến thức chung. Nội dung context có thể được gửi tới OpenAI khi dùng LLM; mở trang nguồn để đối chiếu.</p>
    <label htmlFor="chat-answer-mode">Nguồn trả lời<select id="chat-answer-mode" value={answerMode} disabled={pending || !!request} onChange={event => { setAnswerMode(event.target.value); setFailure(null); }}><option value="documents">Chỉ dựa trên tài liệu</option><option value="general">Kiến thức chung — không dựa trên tài liệu</option><option value="auto">Tự động — cho phép kiến thức chung khi không có nguồn</option></select></label>
    {readyDocumentCount < 1 && <p role="status">Hãy tải PDF và chờ ít nhất một tài liệu sẵn sàng trước khi hỏi.</p>}
    {conversationId && !validId && <p role="alert">ID hội thoại không hợp lệ.</p>}
    {validId && transcript.isPending && <p role="status">Đang tải hội thoại…</p>}
    {transcript.isError && <p role="alert">{transcript.error.message} <Button onClick={() => transcript.refetch()}>Tải lại</Button></p>}
    {transcript.data?.hasOlderMessages && <p className="hint">Đang hiển thị 100 tin nhắn gần nhất. <Link to={`/app/history/${conversationId}`}>Xem toàn bộ lịch sử</Link></p>}
    {!conversationId && !pending && <div className="chat-empty"><span className="empty-icon"><MessageSquare size={28} aria-hidden="true"/></span><h3>Cùng khám phá tài liệu của bạn</h3><p>Đặt câu hỏi, tìm ý chính hoặc làm rõ một khái niệm.<br/>Mở nguồn trích dẫn để kiểm tra câu trả lời.</p></div>}
    <MessageList messages={transcript.data?.messages ?? []} onCitation={setCitation} onCheckRequest={message => { setQuestion(message.content); void transcript.refetch({cancelRefetch:false}); }} pending={pending}/>
    {citation && <CitationSource inline key={`${citation.documentId}:${citation.chunkId}`} citation={citation} close={() => setCitation(null)}/>}
    {pending && <p role="status">Đang truy hồi nguồn và tạo câu trả lời…</p>}
    {failure && <div role="alert"><p>{failure.message}</p>{request && <Button disabled={pending} onClick={() => submit(!failure.details?.newRequestRequired)}>{failure.details?.newRequestRequired ? 'Gửi lại bằng yêu cầu mới' : 'Kiểm tra lại cùng yêu cầu'}</Button>}
      {failure.details?.newRequestRequired && <p className="hint">Yêu cầu mới có thể gọi LLM và tính phí lại. Yêu cầu cũ sẽ không tự chạy lại.</p>}</div>}
    <form onSubmit={event => { event.preventDefault(); void submit(); }}><label htmlFor="chat-question">Câu hỏi của bạn</label><textarea id="chat-question" value={question} disabled={blocked} maxLength={2000} rows={4} onChange={event => { setQuestion(event.target.value); setRequest(null);setFailure(null); }} placeholder="Bạn muốn tìm hiểu điều gì trong tài liệu?"/>
      <div className="chat-heading"><span>{[...question.trim().normalize('NFC')].length}/1.000 ký tự</span><Button variant="primary" type="submit" disabled={blocked || !question.trim() || [...question.trim().normalize('NFC')].length>1000 || !!request}><Send size={17} aria-hidden="true"/>Gửi câu hỏi</Button></div></form>
  </section></div>;
}
