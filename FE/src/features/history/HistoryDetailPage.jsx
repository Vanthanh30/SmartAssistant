import { useState } from 'react';
import { Link,useNavigate,useParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth.js';
import { StatusPanel } from '../../components/StatusPanel.jsx';
import { MessageList } from '../chat/MessageList.jsx';
import { CitationSource } from '../chat/CitationSource.jsx';
import { DeleteConversationDialog } from './DeleteConversationDialog.jsx';
import { getHistory } from './api.js';
export function HistoryDetailPage(){
 const {conversationId}=useParams();return <HistoryDetail key={conversationId} conversationId={conversationId}/>;
}
function HistoryDetail({conversationId}){
 const {data:auth}=useAuth();const navigate=useNavigate();const [citation,setCitation]=useState(null);
 const valid=/^[1-9][0-9]{0,19}$/.test(conversationId);
 const detail=useInfiniteQuery({queryKey:['history','detail',auth.user.id,conversationId],enabled:valid,initialPageParam:null,retry:false,
  queryFn:({signal,pageParam})=>getHistory(conversationId,pageParam,signal),getNextPageParam:last=>last.nextBeforeMessageId || undefined,
  refetchInterval:query=>query.state.data?.pages.length===1 && query.state.data.pages[0].messages.some(message=>message.status==='processing' && Date.now()-new Date(message.createdAt).getTime()<300000) ? 3000 : false});
 if(!valid)return <StatusPanel title="ID hội thoại không hợp lệ"><Link to="/app/history">Về lịch sử</Link></StatusPanel>;
 if(detail.isPending)return <StatusPanel title="Đang tải hội thoại…"/>;
 if(detail.isError && (!detail.data || detail.error.status===404))return <StatusPanel title={detail.error.status===404 ? 'Hội thoại đã bị xóa hoặc không thuộc tài khoản của bạn' : 'Không thể tải hội thoại'} retry={detail.error.status===404 ? undefined : ()=>detail.refetch()}><p>{detail.error.message}</p><Link to="/app/history">Về lịch sử</Link></StatusPanel>;
 const conversation=detail.data.pages[0].conversation;
 const messages=[...new Map([...detail.data.pages].reverse().flatMap(group=>group.messages).map(message=>[message.id,message])).values()];
 return <section className="history-page"><Link to={`/app/history?courseId=${conversation.courseId}`}>← Lịch sử môn học</Link><div className="page-heading"><div><h1>{conversation.title}</h1><p>{conversation.courseName}</p></div><div className="actions"><Link to={`/app/courses/${conversation.courseId}?conversation=${conversation.id}`}>Tiếp tục hỏi</Link><DeleteConversationDialog conversation={conversation} onDeleted={()=>navigate('/app/history',{replace:true})}/></div></div>
  <div className={`chat-workspace ${citation ? 'has-source' : ''}`}><section className="chat-panel" aria-label="Nội dung hội thoại">
   {detail.isError && <p role="alert">{detail.error.message} <button onClick={()=>detail.isFetchNextPageError ? detail.fetchNextPage() : detail.refetch()}>Thử tải lại</button></p>}
   {detail.hasNextPage && <button disabled={detail.isFetchingNextPage} onClick={()=>detail.fetchNextPage()}>{detail.isFetchingNextPage ? 'Đang tải…' : 'Tải tin nhắn cũ hơn'}</button>}
   {!messages.length ? <p>Hội thoại chưa có câu hỏi.</p> : <MessageList messages={messages} onCitation={setCitation}/>}
  </section>{citation && <CitationSource key={`${citation.documentId}:${citation.chunkId}`} citation={citation} close={()=>setCitation(null)}/>}</div>
 </section>;
}
