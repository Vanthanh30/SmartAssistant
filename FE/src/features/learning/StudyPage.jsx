import { Layers, CheckCircle2, XCircle, MinusCircle, Quote } from 'lucide-react';
import { SectionHeading } from '../../components/SectionHeading.jsx';
import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import { Button } from '../../components/ui/Button.jsx';
import { StatusPanel } from '../../components/StatusPanel.jsx';
import { CitationSource } from '../chat/CitationSource.jsx';
import { getSet, getAttempt, listAttempts, startAttempt, submitAttempt } from './api.js';

export function StudyPage() { const {setId}=useParams(); const [params]=useSearchParams(); return <StudyContent key={`${setId}:${params.get('attempt')??''}`} setId={setId}/>; }
export function StudyContent({setId, embedded = false}) {
  const {data:auth}=useAuth(); const client=useQueryClient(); const [params,updateParams]=useSearchParams(); const attemptParam=embedded?'studyAttempt':'attempt'; const attemptId=params.get(attemptParam);
  function setParams(value) { updateParams(previous=>{const next=new URLSearchParams(previous); if(value.attempt)next.set(attemptParam,value.attempt);else next.delete(attemptParam);return next;}); }
  const [citationItem,setCitationItem]=useState(null);
  const [index,setIndex]=useState(0); const [flipped,setFlipped]=useState(false); const [citation,setCitation]=useState(null); const [answers,setAnswers]=useState({});
  const startRequest=useRef(null); const submission=useRef(null); const [submissionLocked,setSubmissionLocked]=useState(false);
  const set=useQuery({queryKey:['learning','set',auth.user.id,setId],queryFn:({signal})=>getSet(setId,signal),retry:false});
  const attemptKey=['learning','attempt',auth.user.id,attemptId];
  const attempt=useQuery({queryKey:attemptKey,queryFn:({signal})=>getAttempt(attemptId,signal),enabled:!!attemptId,retry:false});
  const historyKey=['learning','attempts',auth.user.id,setId];
  const history=useQuery({queryKey:historyKey,queryFn:({signal})=>listAttempts(setId,signal),enabled:set.data?.kind==='quiz',retry:false});
  const start=useMutation({mutationFn:()=>{startRequest.current??=crypto.randomUUID();return startAttempt(setId,startRequest.current,auth.csrfToken);},retry:false,onSuccess:result=>{
    client.setQueryData(['learning','attempt',auth.user.id,result.id],result);setParams({attempt:result.id});setIndex(0);setAnswers({});submission.current=null;setSubmissionLocked(false);setCitation(null);
    client.invalidateQueries({queryKey:historyKey});
  }});
  const submit=useMutation({mutationFn:payload=>submitAttempt(attemptId,payload,auth.csrfToken),retry:false,onSuccess:result=>{
    client.setQueryData(['learning','attempt',auth.user.id,result.id],result);client.invalidateQueries({queryKey:historyKey});
  },onError:()=>client.invalidateQueries({queryKey:attemptKey})});
  function selectAttempt(id) {setParams({attempt:id});setIndex(0);setAnswers({});submission.current=null;setSubmissionLocked(false);setCitation(null);submit.reset();}
  if(set.isPending)return <StatusPanel title="Đang tải bộ học…"/>;
  if(set.isError)return <StatusPanel title="Không thể mở bộ học" retry={()=>set.refetch()}><p>{set.error.message}</p><Link to="/app/courses">Môn học của tôi</Link></StatusPanel>;
  const data=set.data; const activeAttempt=attempt.data?.setId===setId?attempt.data:null; const completed=!!activeAttempt?.completedAt;
  const items=activeAttempt?.set.items??data.items; const card=items[index];
  function sources(item) {return <div className="study-actions study-answer-sources">{item.citations.map((source,i)=><Button key={i} onClick={()=>{setCitation(source);setCitationItem(item.id);}}><Quote size={15} aria-hidden="true"/>{source.fileName} · tr. {source.pageFrom}{source.pageTo !== source.pageFrom ? `–${source.pageTo}` : ''}{source.sourceDeleted?' (nguồn không còn sẵn sàng)':''}</Button>)}</div>;}
  return <section className={`study-panel study-player${embedded?' study-player--embedded':''}`}>{!embedded&&<Link to={`/app/courses/${data.courseId}`}>← Về môn học</Link>}<SectionHeading icon={Layers} eyebrow={data.kind==='quiz'?'ÔN TẬP · QUIZ':'ÔN TẬP · FLASHCARD'} title={data.title}/><p>{data.kind==='quiz'?'Quiz trắc nghiệm':'Flashcard'} · {data.itemCount} mục · dựa trên {data.sourceCount} trích đoạn. {data.model?.startsWith('document-rules-') ? 'Tạo từ nguyên văn tài liệu bằng quy tắc.' : 'Nội dung do AI tạo, cần đối chiếu nguồn.'}</p>
    {data.kind==='flashcards' ? card ? <><p aria-live="polite">Thẻ {index+1}/{items.length} · {flipped?'Mặt sau':'Mặt trước'}</p><div className="study-flashcard"><p>{flipped?card.answer:card.prompt}</p></div>
      <div className="study-actions"><Button disabled={index===0} onClick={()=>{setIndex(i=>i-1);setFlipped(false);setCitation(null);}}>Thẻ trước</Button><Button variant="primary" aria-pressed={flipped} onClick={()=>setFlipped(v=>!v)}>Lật thẻ</Button><Button disabled={index>=items.length-1} onClick={()=>{setIndex(i=>i+1);setFlipped(false);setCitation(null);}}>Thẻ sau</Button><Button onClick={()=>{setIndex(0);setFlipped(false);setCitation(null);}}>Học lại</Button></div>{flipped&&sources(card)}</> : <p>Bộ học không có thẻ.</p> : <>
      {!attemptId&&<><p>Mỗi câu có một đáp án đúng. Bỏ qua câu được tính sai. Điểm tính trên thang 100. Đáp án và nguồn mở sau khi nộp.</p><Button variant="primary" disabled={start.isPending} onClick={()=>start.mutate()}>{start.isPending?'Đang bắt đầu…':'Bắt đầu làm quiz'}</Button>{start.isError&&<p role="alert">{start.error.message}</p>}</>}
      {attemptId&&(attempt.isPending?<p role="status">Đang tải lần làm bài…</p>:attempt.isError?<p role="alert">{attempt.error.message} <Button onClick={()=>attempt.refetch()}>Thử lại</Button></p>:!activeAttempt?<p role="alert">Lần làm bài không thuộc bộ học này.</p>:<>
        {completed&&<p className="study-result" role="status">Kết quả: {activeAttempt.correctCount}/{activeAttempt.totalQuestions} câu đúng · {activeAttempt.score}/100 điểm</p>}
        <form onSubmit={event=>{event.preventDefault();if(!submission.current)submission.current=items.map(item=>({itemId:item.id,choice:answers[item.id]??null}));setSubmissionLocked(true);submit.mutate(submission.current);}}>
          <div className="quiz-progress" aria-live="polite"><span>Câu {index+1}/{items.length}</span><span>{completed?'Xem đáp án':`${Object.values(answers).filter(v=>v!==null).length} câu đã chọn`}</span><progress aria-label="Tiến độ câu hỏi" value={index+1} max={items.length}/></div>
          {items.slice(index,index+1).map((item)=>{const i=index;
            const answer=activeAttempt.answers.find(a=>a.itemId===item.id);
            const skipped=answer?.choice == null;
            const result=answer?.correct?'correct':skipped?'skipped':'incorrect';
            const ResultIcon=answer?.correct?CheckCircle2:skipped?MinusCircle:XCircle;
            const locked=completed||submit.isPending||submissionLocked;
            return <fieldset className={`study-question${completed ? ` study-question--${result}` : ''}`} key={item.id}>
              <legend>{i+1}. {item.prompt.replace(/^Theo tài liệu,\s*/u, '')}</legend>
              {item.choices.map((choice,j)=>{
                const selected=(completed?answer?.choice:answers[item.id])===j;
                const correct=completed&&item.correctIndex===j;
                const incorrect=completed&&selected&&!correct;
                return <label key={j} className={`study-choice${correct?' study-choice--correct':incorrect?' study-choice--incorrect':''}`}>
                  <input type="radio" name={`question-${item.id}`} value={j} disabled={locked} checked={selected} onChange={()=>setAnswers(v=>({...v,[item.id]:j}))}/>
                  <span className="study-choice-letter" aria-hidden="true">{String.fromCharCode(65+j)}</span>
                  <span className="study-choice-text">{choice}</span>
                  {correct&&<span className="study-choice-badge"><CheckCircle2 size={16} aria-hidden="true"/>Đáp án đúng</span>}
                  {incorrect&&<span className="study-choice-badge"><XCircle size={16} aria-hidden="true"/>Bạn chọn · Sai</span>}
                </label>;
              })}
              {!completed&&<Button disabled={locked} onClick={()=>setAnswers(v=>({...v,[item.id]:null}))}>Bỏ qua câu này</Button>}
              {completed&&<div className={`study-answer study-answer--${result}`}>
                <p className="study-answer-status"><ResultIcon size={19} aria-hidden="true"/>{answer?.correct?'Trả lời đúng':skipped?'Bạn đã bỏ qua câu này':'Trả lời chưa đúng'}</p>
                <p className="study-answer-key">Đáp án đúng: <strong>{item.choices[item.correctIndex]}</strong></p>
                {item.explanation&&<p className="study-explanation">{item.explanation}</p>}
                <div className="study-answer-evidence"><p><Quote size={16} aria-hidden="true"/>Nguồn của đáp án</p>{item.citations?.length?sources(item):<p className="muted">Bộ học này chưa có trích dẫn được lưu.</p>}</div>
                {citation&&citationItem===item.id&&<CitationSource inline key={`${citation.documentId}:${citation.chunkId}`} citation={citation} close={()=>setCitation(null)}/>}
              </div>}
            </fieldset>;
          })}
          <div className="quiz-navigation"><Button disabled={index===0||submit.isPending||submissionLocked&&!completed} onClick={()=>{setIndex(i=>i-1);setCitation(null);}}>← Câu trước</Button>{index<items.length-1&&<Button variant="primary" disabled={submit.isPending||submissionLocked&&!completed||(!completed&&answers[items[index]?.id]===undefined)} onClick={()=>{setIndex(i=>i+1);setCitation(null);}}>Câu tiếp →</Button>}</div>
          {!completed&&index===items.length-1&&<><p>Đã chọn {Object.values(answers).filter(v=>v!==null).length}/{items.length} câu. Đáp án chưa nộp chỉ lưu trên màn hình; tải lại sẽ mất lựa chọn.</p><Button type="submit" variant="primary" disabled={submit.isPending||(!submissionLocked&&answers[items[index]?.id]===undefined)}>{submit.isPending?'Đang chấm…':submissionLocked?'Gửi lại bài đã nộp':'Nộp bài & xem kết quả'}</Button></>}
        </form>
        {submit.isError&&<p role="alert">{submit.error.message} <Button onClick={()=>attempt.refetch()}>Kiểm tra kết quả đã lưu</Button></p>}
        {completed&&<Button disabled={submit.isPending} onClick={()=>{setParams({});setIndex(0);startRequest.current=null;start.reset();submit.reset();submission.current=null;setSubmissionLocked(false);setCitation(null);}}>Làm lượt mới</Button>}
      </>)}
      <details className="study-attempt-history"><summary>Lần làm bài gần đây</summary>{history.isPending?<p>Đang tải…</p>:history.isError?<p role="alert">{history.error.message} <Button onClick={()=>history.refetch()}>Thử lại</Button></p>:<><p>Tối đa 50 lượt gần nhất.</p>{!history.data?.length?<p>Chưa có lần làm bài.</p>:<ul>{history.data.map(row=><li key={row.id}><Button disabled={start.isPending||submit.isPending} onClick={()=>selectAttempt(row.id)}>Lượt #{row.id} · {row.completedAt?`${row.correctCount}/${row.totalQuestions} đúng · ${row.score}/100`:'Chưa nộp (lựa chọn chưa nộp không được lưu)'}</Button></li>)}</ul>}</>}</details>
    </>}
    {data.kind==='flashcards'&&citation&&<CitationSource inline key={`${citation.documentId}:${citation.chunkId}`} citation={citation} close={()=>setCitation(null)}/>}
  </section>;
}
