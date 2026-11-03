import { PlanRhythmStep } from './PlanRhythmStep.jsx';
import { PlanTimeStep } from './PlanTimeStep.jsx';
import { PlanGoalsStep } from './PlanGoalsStep.jsx';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/Modal.jsx';
import { DraftSchedulePreview } from './DraftSchedulePreview.jsx';
import { CalendarView } from './CalendarView.jsx';
import { calendarWrite,toSession } from './api.js';
import { ZONE,when } from './dates.js';
import { CalendarError } from './CalendarError.jsx';
export function PlanWizard({draft,setDraft,clear,courses,csrfToken,onClose,onSaved,realSessions=[]}) {
 const [step,setStep]=useState(1);const [result,setResult]=useState(null);const [serverErrors,setServerErrors]=useState([]);
 const plan=draft.plan;const slots=draft.slots;
 const changePlan=patch=>{setResult(null);setDraft(d=>({...d,dirty:true,plan:{...d.plan,...patch}}));};
 const changeSlots=value=>{setServerErrors([]);setDraft(d=>({...d,dirty:true,slots:value}));};
 const constraints=()=>({...plan,locked:slots.filter(s=>s.locked).map(s=>({...toSession(s),locked:true,exceptionConfirmed:!!s.exceptionConfirmed}))});
 const propose=useMutation({mutationFn:body=>calendarWrite('/lich-hoc/goi-y',body,csrfToken),onSuccess:data=>{
  // New unlocked proposals are new create intents; locked/editing slots retain UUID.
  const slots=data.slots.map(s=>s.locked?s:{...s,requestId:crypto.randomUUID()});
  changeSlots(slots);setResult({...data,slots});setServerErrors(data.errors);setStep(4);
 }});
 const confirm=useMutation({mutationFn:()=>calendarWrite('/lich-hoc/xac-nhan',{constraints:constraints(),slots:slots.map(s=>({...toSession(s),locked:!!s.locked,exceptionConfirmed:!!s.exceptionConfirmed}))},csrfToken),
  onSuccess:()=>{clear();onSaved();onClose();},onError:error=>setServerErrors(error.details?.errors||[])});
 const busy=propose.isPending||confirm.isPending;
 const generate=()=>propose.mutate(constraints());
 return <Modal open title="Lập kế hoạch tuần" description="Nhập mục tiêu và lịch rảnh thực tế. Gợi ý chỉ là bản nháp; chỉ Xác nhận mới lưu lịch." className="calendar-wizard-modal" onOpenChange={value=>{if(!value&&!busy)onClose();}}>
 <form onSubmit={e=>{e.preventDefault();if(step<3)setStep(s=>s+1);else generate();}}><fieldset disabled={busy}>
 <nav className="calendar-steps" aria-label="Các bước lập kế hoạch">{['Mục tiêu','Thời gian','Nhịp học','Đề xuất'].map((label,i)=><Button key={label} aria-current={step===i+1?'step':undefined} onClick={()=>setStep(i+1)}>{i+1}. {label}</Button>)}</nav>
 {step===1&&<PlanGoalsStep plan={plan} changePlan={changePlan} courses={courses}/>}
 {step===2&&<PlanTimeStep plan={plan} changePlan={changePlan}/>}
 {step===3&&<PlanRhythmStep plan={plan} changePlan={changePlan}/>}
 {step===4&&<section><p><strong>Bản nháp chưa lưu</strong> · {slots.length} buổi · {(slots.reduce((sum,s)=>sum+(new Date(s.end)-new Date(s.start))/3600000,0)).toFixed(1)} giờ · {slots.filter(s=>s.googleSync).length} event dự định đồng bộ</p>
 {result?.summary.map((s,i)=><p key={i}>{courses.find(c=>c.id===s.courseId)?.name||'Tự do'}: xếp {s.scheduled}/{s.requested}; thiếu {s.missing} buổi ({s.missingMinutes} phút).</p>)}
 {result?.unscheduledLessons?.length>0&&<section role="status"><h3>Nội dung chưa xếp được giờ</h3><ul>{result.unscheduledLessons.map((s,i)=><li key={i}>{s.title}</li>)}</ul><p>Hãy mở rộng giờ rảnh hoặc chuyển những nội dung này sang kế hoạch tuần sau.</p></section>}
 <CalendarView date={plan.week} view="timeGridWeek" sessions={realSessions} drafts={slots}/>
 <DraftSchedulePreview slots={slots} courses={courses} onChange={changeSlots} errors={serverErrors} onBusy={(exception,id)=>{
  const body={...constraints(),exceptions:[...plan.exceptions,exception],locked:slots.filter(s=>s.locked&&s.requestId!==id).map(s=>({...toSession(s),locked:true,exceptionConfirmed:!!s.exceptionConfirmed}))};
  changePlan({exceptions:body.exceptions});propose.mutate(body);
 }}/><Button disabled={slots.length>=60} onClick={()=>{const start=DateTime.fromISO(plan.week,{zone:ZONE}).set({hour:19});changeSlots([...slots,{requestId:crypto.randomUUID(),courseId:null,title:'Buổi tự do',goal:'',start:start.toUTC().toISO(),end:start.plus({minutes:45}).toUTC().toISO(),locked:true,exceptionConfirmed:false,reminderMinutes:plan.reminderMinutes,googleSync:plan.googleSync}]);}}>Thêm buổi nháp</Button>
 {slots.length>0&&<p className="hint">Buổi đầu: {when(slots[0].start)}. Lịch được kiểm tra lại khi xác nhận.</p>}
 <div className="actions"><Button onClick={generate}>Gợi ý lại phần chưa khóa</Button><Button variant="primary" disabled={!slots.length} onClick={()=>confirm.mutate()}>Xác nhận lưu {slots.length} buổi</Button></div></section>}
 <CalendarError error={confirm.error||propose.error}/>
 {busy&&<p role="status">Đang xử lý…</p>}
 <div className="actions">{step>1&&<Button onClick={()=>setStep(s=>s-1)}>Quay lại</Button>}{step<4&&<Button type="submit" variant="primary">{step===3?'Gợi ý kế hoạch':'Tiếp tục'}</Button>}
 <Button onClick={onClose}>Đóng, giữ bản nháp</Button><Button onClick={()=>{if(window.confirm('Xóa bản nháp chưa lưu?')){clear();onClose();}}}>Xóa bản nháp</Button></div>
 </fieldset></form></Modal>;
}
