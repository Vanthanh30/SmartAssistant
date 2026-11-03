import { useAuth } from '../auth/useAuth.js';
export function PlanRhythmStep({plan,changePlan}) {
 const {data:auth}=useAuth();const supportsCourseBasedScheduling=(auth?.schemaVersion===16);
 return <section><div className="calendar-form-grid">
 <label>Nghỉ giữa hai buổi (phút)<input type="number" min={0} max={60} required value={plan.breakMinutes} onChange={e=>changePlan({breakMinutes:Number(e.target.value)})}/></label>
 <label>Tối đa buổi/ngày<input type="number" min={1} max={6} required value={plan.maxSessionsPerDay} onChange={e=>changePlan({maxSessionsPerDay:Number(e.target.value)})}/></label>
 <label>Tối đa phút/ngày<input type="number" min={30} max={480} required value={plan.maxMinutesPerDay} onChange={e=>changePlan({maxMinutesPerDay:Number(e.target.value)})}/></label>
 <label>Ưu tiên khung<select value={plan.preferred} onChange={e=>changePlan({preferred:e.target.value})}><option value="none">Không ưu tiên</option><option value="morning">Sáng</option><option value="afternoon">Chiều</option><option value="evening">Tối</option></select></label>
 <label>Nhắc trước<select value={plan.reminderMinutes??'none'} onChange={e=>changePlan({reminderMinutes:e.target.value==='none'?null:Number(e.target.value)})}><option value="none">Không nhắc trước</option>{[0,10,15,30,60].map(v=><option value={v} key={v}>{v===0?'Chỉ đúng giờ':`${v} phút`}</option>)}</select></label></div>
 <div className="calendar-checks"><label><input type="checkbox" checked={plan.alternate} onChange={e=>changePlan({alternate:e.target.checked})}/>Xen kẽ môn khi có thể</label>
 {!supportsCourseBasedScheduling&&<label><input type="checkbox" checked={plan.googleSync} onChange={e=>changePlan({googleSync:e.target.checked})}/>Đồng bộ Google sau khi xác nhận</label>}</div><p className="hint">Chưa kết nối vẫn lưu lịch nội bộ. Nháp được giữ trong phiên nếu bạn đi kết nối Google rồi quay lại.</p></section>;
}
