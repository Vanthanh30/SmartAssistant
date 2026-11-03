import { createHash } from 'node:crypto';
import { at,addDays,dayAt,weekBounds,windows,overlap,minute,iso } from './time.js';
const priority = {high:0,normal:1,low:2};
function idFor(value) { const h=createHash('sha256').update(value).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`; }
export function availability(plan) {
  const free=windows(plan.week,plan.free).filter(range=>(!plan.studyFrom||range.start>=at(plan.studyFrom))&&(!plan.studyTo||range.end<=at(addDays(plan.studyTo,1))));
  const busy=windows(plan.week,plan.busy);
  for(const ex of plan.exceptions) busy.push(...(ex.allDay?[{start:at(ex.date),end:at(addDays(ex.date,1))}]:windows(plan.week,[ex])));
  return {free,busy};
}
export function dailyUsage(sessions,day) {
  const frame={start:at(day),end:at(addDays(day,1))};
  const active=sessions.filter(s=>s.status!=='cancelled'&&s.status!=='completed'&&overlap(s,frame));
  return {count:active.length,minutes:active.reduce((sum,s)=>sum+(Math.min(+new Date(s.end),+frame.end)-Math.max(+new Date(s.start),+frame.start))/minute,0)};
}
export function validateDraft(plan,slots,existing,now=new Date()) {
  const {from,to}=weekBounds(plan.week);const {free,busy}=availability(plan);const errors=[];
  const all=[...existing.filter(s=>s.status==='planned'),...slots];
  for(const slot of slots) {
    const bad=(code,message)=>errors.push({requestId:slot.requestId,code,message});
    if(+new Date(slot.start)<+now||+new Date(slot.start)<+from||+new Date(slot.end)>+to)bad('TIME','Buổi phải ở tương lai và trong tuần đã chọn.');
    if(all.some(other=>other!==slot&&overlap(slot,other)))bad('CONFLICT','Trùng với một buổi học khác.');
    const outside=!free.some(range=>+new Date(slot.start)>=+range.start&&+new Date(slot.end)<=+range.end)||busy.some(range=>overlap(slot,range));
    if(outside&&!slot.exceptionConfirmed)bad('AVAILABILITY','Ngoài giờ rảnh hoặc trùng giờ bận; cần xác nhận ngoại lệ.');
    for(let day=dayAt(slot.start);at(day)<new Date(slot.end);day=addDays(day,1)) {
      const usage=dailyUsage(all,day);
      if(usage.count>plan.maxSessionsPerDay||usage.minutes>plan.maxMinutesPerDay)bad('DAILY_LIMIT','Vượt giới hạn số buổi/phút trong ngày.');
    }
    if(all.some(other=>other!==slot && !overlap(slot,other)
      && Math.min(Math.abs(+new Date(slot.start)-+new Date(other.end)),Math.abs(+new Date(other.start)-+new Date(slot.end)))<plan.breakMinutes*minute))bad('BREAK','Chưa đủ thời gian nghỉ giữa hai buổi.');
  }
  return errors;
}
export function suggest(plan,existing=[],now=new Date()) {
  const {from,to}=weekBounds(plan.week);const {free,busy}=availability(plan);
  const locked=plan.locked.map(s=>({...s}));const slots=[...locked];
  const lockedErrors=validateDraft(plan,locked,existing,now);
  const counts=new Map(plan.goals.map(g=>[g.courseId,locked.filter(s=>s.courseId===g.courseId).length]));
  const taken=[...existing.filter(s=>s.status==='planned'),...slots];
  let lastCourse=null;
  while(slots.length<60) {
    const options=[];
    for(const [goalIndex,goal] of plan.goals.entries()) {
      if((counts.get(goal.courseId)||0)>=goal.sessions)continue;
      for(const range of free) {
        const first=Math.ceil(Math.max(+range.start,+from,+now)/minute)*minute;
        const last=Math.min(+range.end,+to);
        for(let start=first;start+goal.duration*minute<=last;start+=5*minute) {
          const day=dayAt(start);const end=start+goal.duration*minute;
          if(end>+at(addDays(day,1)))continue;
          const candidate={start:new Date(start),end:new Date(end)};
          if(busy.some(b=>overlap(candidate,b))||taken.some(b=>start<+new Date(b.end)+plan.breakMinutes*minute&&end>+new Date(b.start)-plan.breakMinutes*minute))continue;
          const usage=dailyUsage(taken,day);
          if(usage.count>=plan.maxSessionsPerDay||usage.minutes+goal.duration>plan.maxMinutesPerDay)continue;
          const hour=Number(new Date(start+7*60*minute).toISOString().slice(11,13));
          const preferred=plan.preferred==='none'||(plan.preferred==='morning'?hour>=6&&hour<12:plan.preferred==='afternoon'?hour>=12&&hour<18:hour>=18);
          options.push({goal,goalIndex,start,end,score:priority[goal.priority]*100+usage.count*10+(preferred?0:3)+(plan.alternate&&lastCourse===goal.courseId?2:0)});
          if(preferred)break;
          // Also consider the preferred band inside a continuous free window;
          // choosing only its first minute would ignore the user's preference.
          const target=+at(day,{morning:'06:00',afternoon:'12:00',evening:'18:00'}[plan.preferred]);
          if(start<target){start=target-5*minute;continue;}
          break;
        }
      }
    }
    options.sort((a,b)=>a.score-b.score||a.start-b.start||a.goalIndex-b.goalIndex);
    const best=options[0];if(!best)break;
    const slot={requestId:idFor(`${plan.week}:${best.goalIndex}:${best.start}:${best.end}`),courseId:best.goal.courseId,
      title:best.goal.goal.slice(0,200)||'Buổi học',goal:best.goal.goal,start:iso(best.start),end:iso(best.end),
      reminderMinutes:plan.reminderMinutes,googleSync:plan.googleSync,locked:false,exceptionConfirmed:false,
      reason:'Trong giờ rảnh đã khai báo, không trùng giờ bận/lịch thật; ưu tiên và cân bằng số buổi theo ngày.'};
    slots.push(slot);taken.push(slot);lastCourse=slot.courseId;counts.set(slot.courseId,(counts.get(slot.courseId)||0)+1);
  }
  const summary=plan.goals.map(goal=>({courseId:goal.courseId,requested:goal.sessions,scheduled:counts.get(goal.courseId)||0,
    missing:Math.max(0,goal.sessions-(counts.get(goal.courseId)||0)),missingMinutes:Math.max(0,goal.sessions-(counts.get(goal.courseId)||0))*goal.duration}));
  return {slots,summary,errors:lockedErrors,serverNow:iso(now)};
}
