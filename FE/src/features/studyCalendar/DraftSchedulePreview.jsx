import { LessonContent } from './LessonContent.jsx';
import { DateTime } from 'luxon';
import { Button } from '../../components/ui/Button.jsx';
import { localInput,fromInput,ZONE } from './dates.js';
export function DraftSchedulePreview({slots,onChange,courses,onBusy,errors=[]}) {
 const patch=(id,value)=>onChange(slots.map(s=>s.requestId===id?{...s,...value}:s));
 return <section><h3>Bản nháp chưa lưu · {slots.length} buổi</h3><p className="hint">Khóa buổi muốn giữ trước khi gợi ý lại. Thay đổi giờ không tự lưu hoặc tạo event.</p>
 {!slots.length&&<p>Chưa có buổi nào được xếp. Nhập giờ rảnh rồi chọn Gợi ý.</p>}
 <div className="calendar-draft-list">{slots.map((slot,index)=><article key={slot.requestId} className="calendar-draft-slot"><strong>Buổi {index+1}</strong>
  <div className="calendar-form-grid"><label>Tiêu đề<input required maxLength={200} value={slot.title} onChange={e=>patch(slot.requestId,{title:e.target.value,locked:true})}/></label>
  <label>Môn<select value={slot.courseId||''} onChange={e=>patch(slot.requestId,{courseId:e.target.value||null,locked:true})}><option value="">Tự do</option>{courses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  <label>Bắt đầu<input type="datetime-local" required value={localInput(slot.start)} onChange={e=>{const value=fromInput(e.target.value);if(value)patch(slot.requestId,{start:value,locked:true});}}/></label>
  <label>Kết thúc<input type="datetime-local" required value={localInput(slot.end)} onChange={e=>{const value=fromInput(e.target.value);if(value)patch(slot.requestId,{end:value,locked:true});}}/></label></div>
  <div className="calendar-checks"><label><input type="checkbox" checked={slot.locked} onChange={e=>patch(slot.requestId,{locked:e.target.checked})}/>Khóa / giữ buổi</label>
  <label><input type="checkbox" checked={slot.exceptionConfirmed||false} onChange={e=>patch(slot.requestId,{exceptionConfirmed:e.target.checked})}/>Giữ giờ ngoài khung rảnh/bận khi gợi ý lại</label></div>
  <details><summary>Kiến thức, hoạt động và nguồn buổi học</summary><LessonContent lesson={slot.lesson} onChange={lesson=>patch(slot.requestId,{lesson,goal:lesson.objectives.join('\n'),locked:true})}/></details><p className="hint">{slot.reason||'Buổi được chỉnh thủ công; lịch sẽ được kiểm tra lại.'}</p>
  {errors.filter(e=>e.requestId===slot.requestId).map((e,i)=><p role="alert" key={i} className="field-error">{e.message}</p>)}
  <div className="actions"><Button onClick={()=>onChange(slots.filter(s=>s.requestId!==slot.requestId))}>Bỏ buổi</Button><Button onClick={()=>{const from=DateTime.fromISO(slot.start,{zone:ZONE}),to=DateTime.fromISO(slot.end,{zone:ZONE});onBusy({date:from.toISODate(),allDay:false,start:from.toFormat('HH:mm'),end:to.toFormat('HH:mm')},slot.requestId);}}>Tôi bận giờ này</Button></div>
 </article>)}</div></section>;
}
