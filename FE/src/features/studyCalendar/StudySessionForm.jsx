import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { SessionFields } from './SessionFields.jsx';
import { localNow,localInput,fromInput } from './dates.js';
import { calendarWrite } from './api.js';
import { CalendarError } from './CalendarError.jsx';
export function StudySessionForm({session,initialSlot,courses,csrfToken,onClose,onSaved}) {
 const [value,setValue]=useState(()=>session?{...session,start:localInput(session.start),end:localInput(session.end)}:
  {requestId:crypto.randomUUID(),courseId:null,title:'',goal:'',start:localNow().plus({hours:1}).startOf('hour').toFormat("yyyy-MM-dd'T'HH:mm"),end:localNow().plus({hours:2}).startOf('hour').toFormat("yyyy-MM-dd'T'HH:mm"),reminderMinutes:10,googleSync:false,...(initialSlot?{...initialSlot,requestId:crypto.randomUUID(),start:localInput(initialSlot.start),end:localInput(initialSlot.end),courseId:initialSlot.courseId||null}:{})});
 const mutation=useMutation({mutationFn:()=>{
  const body={requestId:value.requestId,courseId:value.courseId,title:value.title,goal:value.goal,start:fromInput(value.start),end:fromInput(value.end),reminderMinutes:value.reminderMinutes,googleSync:value.googleSync,...(value.lesson?{lesson:value.lesson}:{}),...(value.documentId?{documentId:value.documentId,pageFrom:value.pageFrom,pageTo:value.pageTo}:{})};
  return calendarWrite(session?`/lich-hoc/${session.id}`:'/lich-hoc',session?{version:session.version,session:body}:body,csrfToken,session?'PATCH':'POST');
 },onSuccess:()=>{onSaved();onClose();}});
 return <Modal open onOpenChange={open=>{if(!open&&!mutation.isPending)onClose();}} title={session?'Sửa buổi học':'Thêm buổi học'} description="Thời gian Việt Nam; buổi mới phải ở tương lai, tối đa 24 giờ. Lịch được kiểm tra trùng trước khi lưu.">
 <form className="calendar-session-form" onSubmit={e=>{e.preventDefault();mutation.mutate();}}><fieldset disabled={mutation.isPending}><SessionFields value={value} onChange={setValue} courses={courses}/>
 <p className="hint">Nhắc đúng giờ luôn có trong ứng dụng. Khi đóng app, chỉ Google nhắc những buổi đã đồng bộ.</p>
 <CalendarError error={mutation.error}/><div className="actions"><Button type="submit" variant="primary">{mutation.isPending?'Đang lưu…':'Lưu buổi học'}</Button><Button onClick={onClose}>Đóng</Button></div></fieldset></form></Modal>;
}
