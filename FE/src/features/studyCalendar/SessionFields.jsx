import { DocumentScopeFields } from './DocumentScopeFields.jsx';
import { useAuth } from '../auth/useAuth.js';
import { LessonContent } from './LessonContent.jsx';
export function SessionFields({value,onChange,courses=[]}) {
 const {data:auth}=useAuth();const supportsCourseBasedScheduling=(auth?.schemaVersion===16);
 const update=(key,val)=>onChange({...value,[key]:val,...(key==='courseId'?{documentId:undefined,pageFrom:1,pageTo:1}:{})});
 return <div className="calendar-form-grid">
 <label>Tiêu đề<input required maxLength={200} value={value.title} onChange={e=>update('title',e.target.value)}/></label>
 <label>Môn học<select value={value.courseId||''} onChange={e=>update('courseId',e.target.value||null)}><option value="">{supportsCourseBasedScheduling?'Chọn môn học':'Tự do'}</option>{courses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 {value.lesson?<div className="calendar-wide"><LessonContent lesson={value.lesson} onChange={lesson=>onChange({...value,lesson,goal:lesson.objectives.join('\n')})}/></div>:<DocumentScopeFields value={value} onChange={onChange}/>}
 <label>Bắt đầu (giờ Việt Nam)<input type="datetime-local" required value={value.start} onChange={e=>update('start',e.target.value)}/></label>
 <label>Kết thúc (giờ Việt Nam)<input type="datetime-local" required value={value.end} onChange={e=>update('end',e.target.value)}/></label>
 <label className="calendar-wide">Mục tiêu<textarea maxLength={5000} value={value.goal} onChange={e=>update('goal',e.target.value)}/></label>
 <label>Nhắc trước<select value={value.reminderMinutes??'none'} onChange={e=>update('reminderMinutes',e.target.value==='none'?null:Number(e.target.value))}><option value="none">Không nhắc trước</option>{[0,10,15,30,60].map(v=><option key={v} value={v}>{v===0?'Chỉ đúng giờ':`${v} phút`}</option>)}</select></label>
 {!supportsCourseBasedScheduling&&<label className="calendar-check"><input type="checkbox" checked={value.googleSync} onChange={e=>update('googleSync',e.target.checked)}/>Đồng bộ Google</label>}
 </div>;
}
