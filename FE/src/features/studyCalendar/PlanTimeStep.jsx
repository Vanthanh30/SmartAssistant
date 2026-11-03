import { Button } from '../../components/ui/Button.jsx';
import { TimeWindows } from './TimeWindows.jsx';
export function PlanTimeStep({plan,changePlan}) {
 return <section><TimeWindows title="Bạn có thể học những ngày nào, vào khung giờ nào?" values={plan.free} onChange={free=>changePlan({free})}/>
 <TimeWindows title="Bạn bận những ngày nào và từ mấy giờ đến mấy giờ?" values={plan.busy} onChange={busy=>changePlan({busy})}/>
 <label className="calendar-check"><input type="checkbox" checked={!plan.busy.length} onChange={e=>{if(e.target.checked)changePlan({busy:[]});else changePlan({busy:[{day:1,start:'08:00',end:'17:00'}]});}}/>Không có lịch bận cố định</label>
 <h3>Tuần này có ngày muốn nghỉ hoặc bận khác thường không?</h3>{plan.exceptions.map((ex,i)=><div className="calendar-input-row" key={i}>
 <label>Ngày<input type="date" required value={ex.date} onChange={e=>changePlan({exceptions:plan.exceptions.map((v,n)=>n===i?{...v,date:e.target.value}:v)})}/></label>
 <label className="calendar-check"><input type="checkbox" checked={ex.allDay} onChange={e=>changePlan({exceptions:plan.exceptions.map((v,n)=>n===i?{...v,allDay:e.target.checked}:v)})}/>Nghỉ cả ngày</label>
 {!ex.allDay&&<><label>Từ<input type="time" required value={ex.start} onChange={e=>changePlan({exceptions:plan.exceptions.map((v,n)=>n===i?{...v,start:e.target.value}:v)})}/></label><label>Đến<input type="time" required value={ex.end} onChange={e=>changePlan({exceptions:plan.exceptions.map((v,n)=>n===i?{...v,end:e.target.value}:v)})}/></label></>}
 <Button onClick={()=>changePlan({exceptions:plan.exceptions.filter((_,n)=>n!==i)})}>Bỏ ngoại lệ</Button></div>)}<Button disabled={plan.exceptions.length>=30} onClick={()=>changePlan({exceptions:[...plan.exceptions,{date:plan.week,allDay:true,start:'08:00',end:'17:00'}]})}>Thêm ngoại lệ</Button></section>;
}
