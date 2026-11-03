export function LessonContent({lesson,onChange}) {
  if(!lesson)return null;
  return <section className="session-lesson"><p><strong>Mức độ:</strong> {{basic:'Cơ bản',intermediate:'Trung bình',advanced:'Nâng cao'}[lesson.difficulty]}</p>
    <h3>Mục tiêu buổi học</h3><ul>{lesson.objectives.map((text,i)=><li key={i}>{onChange?<textarea aria-label={`Mục tiêu ${i+1}`} maxLength={500} value={text} onChange={e=>onChange({...lesson,objectives:lesson.objectives.map((v,j)=>i===j?e.target.value:v)})}/>:text}</li>)}</ul>
    <h3>Kiến thức cần học</h3>{lesson.topics.map((topic,i)=><article key={i}><h4>{topic.title}</h4><p style={{whiteSpace:'pre-wrap'}}>{topic.content}</p></article>)}
    <h3>Các bước học</h3><ol>{lesson.activities.map((activity,i)=><li key={i}><strong>{activity.minutes} phút · {{read:'Đọc và tìm hiểu',practice:'Luyện tập',review:'Ôn và tự kiểm tra'}[activity.kind]}</strong>{onChange?<><label>Số phút<input type="number" min={1} max={180} value={activity.minutes} onChange={e=>onChange({...lesson,activities:lesson.activities.map((v,j)=>i===j?{...v,minutes:Number(e.target.value)}:v)})}/></label><textarea aria-label={`Hoạt động ${i+1}`} maxLength={600} value={activity.instruction} onChange={e=>onChange({...lesson,activities:lesson.activities.map((v,j)=>i===j?{...v,instruction:e.target.value}:v)})}/></>:<p>{activity.instruction}</p>}</li>)}</ol>
    <h3>Tài liệu của buổi học</h3><ul>{lesson.resources.map((r,i)=><li key={i}>{r.fileName} · trang {r.pageFrom}{r.pageTo!==r.pageFrom?`–${r.pageTo}`:''}</li>)}</ul>
    <p>Bài luyện: {lesson.quizCount} câu quiz · {lesson.flashcardCount} flashcard. Tạo khi bắt đầu luyện tập.</p>
  </section>;
}
