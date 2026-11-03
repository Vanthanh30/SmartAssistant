import { PlanDocuments } from './PlanDocuments.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { weekOf } from './dates.js';
import { DateTime } from 'luxon';
export function PlanGoalsStep({plan,changePlan,courses}) {
 const weekEnd=DateTime.fromISO(plan.week).plus({days:6}).toISODate();
 return <section><label>Tuần bắt đầu (Thứ Hai)<input type="date" required value={plan.week} onChange={e=>{if(e.target.value)changePlan({week:weekOf(e.target.value),studyFrom:undefined,studyTo:undefined});}}/></label>
 <div className="calendar-form-grid"><label>Học từ ngày<input type="date" min={plan.week} max={weekEnd} value={plan.studyFrom||plan.week} onChange={e=>changePlan({studyFrom:e.target.value})}/></label><label>Hoàn thành trước hết ngày<input type="date" min={plan.studyFrom||plan.week} max={weekEnd} value={plan.studyTo||weekEnd} onChange={e=>changePlan({studyTo:e.target.value})}/></label></div>
 <p>Chọn môn và các PDF cần học. AI chia tối đa 14 buổi cho mỗi mục tiêu trong tuần.</p>{plan.goals.map((goal,index)=><fieldset key={index}><legend>Mục tiêu {index+1}</legend><div className="calendar-form-grid">
 <label>Môn<select aria-label="Môn" value={goal.courseId||''} onChange={e=>changePlan({goals:plan.goals.map((g,i)=>i===index?{...g,courseId:e.target.value||null,documentId:undefined,documentIds:[],pageFrom:1,pageTo:1}:g)})}><option value="">Tự do</option>{courses.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
 <PlanDocuments value={goal} onChange={value=>changePlan({goals:plan.goals.map((g,i)=>i===index?value:g)})}/>
 <label>Mục tiêu<input maxLength={5000} value={goal.goal} onChange={e=>changePlan({goals:plan.goals.map((g,i)=>i===index?{...g,goal:e.target.value}:g)})}/></label>
 <label>Số buổi<input type="number" required min={1} max={14} value={goal.sessions} onChange={e=>changePlan({goals:plan.goals.map((g,i)=>i===index?{...g,sessions:Number(e.target.value)}:g)})}/></label>
 <label>Phút/buổi<input type="number" required min={15} max={180} list="study-durations" value={goal.duration} onChange={e=>changePlan({goals:plan.goals.map((g,i)=>i===index?{...g,duration:Number(e.target.value)}:g)})}/></label>
 <label>Ưu tiên<select value={goal.priority} onChange={e=>changePlan({goals:plan.goals.map((g,i)=>i===index?{...g,priority:e.target.value}:g)})}><option value="high">Cao</option><option value="normal">Bình thường</option><option value="low">Thấp</option></select></label></div>
 <Button disabled={plan.goals.length===1} onClick={()=>changePlan({goals:plan.goals.filter((_,i)=>i!==index)})}>Bỏ mục tiêu</Button></fieldset>)}
 <datalist id="study-durations">{[25,45,60,90].map(v=><option value={v} key={v}/>)}</datalist><Button disabled={plan.goals.length>=10} onClick={()=>changePlan({goals:[...plan.goals,{courseId:null,goal:'',sessions:1,duration:45,priority:'normal'}]})}>Thêm môn/mục tiêu</Button></section>;
}
