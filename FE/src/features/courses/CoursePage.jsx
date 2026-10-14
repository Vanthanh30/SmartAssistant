import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { getCourse } from './api.js';
import { CourseDialog } from './CourseDialog.jsx';
import { StatusPanel } from '../../components/StatusPanel.jsx';
import { useAuth } from '../auth/useAuth.js';
import { DocumentsPanel } from '../documents/DocumentsPanel.jsx';
import { ChatPanel } from '../chat/ChatPanel.jsx';
import { StudyPanel } from '../learning/StudyPanel.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Files, Sparkles, Layers } from 'lucide-react';
export function CoursePage() {
  const { courseId } = useParams();
  const [sourcesOpen,setSourcesOpen] = useState(true);
  const [params,setParams] = useSearchParams();
  const studyOpen = params.get('view') === 'study' || (!params.has('view') && (params.has('studySet') || window.location.hash === '#course-study'));
  function changeView(view) {setParams(previous=>{const next=new URLSearchParams(previous);next.set('view',view);return next;});}
  const { data: auth } = useAuth();
  const course = useQuery({ queryKey: ['courses', 'detail', auth?.user.id, courseId], queryFn: ({ signal }) => getCourse(courseId, signal), retry: false });
  if (course.isPending) return <StatusPanel title="Đang tải môn học…"/>;
  if (course.isError) return <StatusPanel title={course.error.status === 404 ? 'Không tìm thấy môn học' : 'Không thể tải môn học'} retry={course.error.status === 404 ? undefined : () => course.refetch()}><p>{course.error.message}</p><Link to="/app/courses">← Môn học của tôi</Link></StatusPanel>;
  return <section className="course-detail"><Link className="back-link" to="/app/courses">← Môn học của tôi</Link><div className="workspace-heading page-heading"><div><span className="eyebrow">KHÔNG GIAN MÔN HỌC</span><h1>{course.data.name}</h1><p className="course-description">{course.data.description || 'Tập hợp nguồn học và khám phá kiến thức từ tài liệu của bạn.'}</p></div><CourseDialog course={course.data} trigger="Sửa môn học"/></div>
    <nav className="workspace-nav" aria-label="Các phần trong môn học"><Button aria-expanded={sourcesOpen} aria-controls="course-sources" onClick={()=>setSourcesOpen(value=>!value)}><Files size={18}/>{sourcesOpen?'Thu gọn nguồn PDF':'Mở nguồn PDF'} · {course.data.readyDocumentCount} sẵn sàng</Button><Button className={!studyOpen?'workspace-mode-active':''} aria-pressed={!studyOpen} aria-controls="course-chat" onClick={()=>changeView('chat')}><Sparkles size={18}/>Hỏi đáp</Button><Button className={studyOpen?'workspace-mode-active':''} aria-pressed={studyOpen} aria-controls="course-study" onClick={()=>changeView('study')}><Layers size={18}/>Quiz & flashcard</Button></nav>
    <div className={`course-workspace-grid${sourcesOpen?' has-sources':''}${studyOpen?' mode-study':''}`}><div id="course-sources" className="course-source-drawer" hidden={!sourcesOpen}><DocumentsPanel key={courseId} courseId={courseId}/></div><div id="course-chat" hidden={studyOpen}><ChatPanel key={`chat-${courseId}`} courseId={courseId} readyDocumentCount={course.data.readyDocumentCount} isActive={!studyOpen}/></div><div id="course-study" hidden={!studyOpen}><StudyPanel key={`study-${courseId}`} courseId={courseId}/></div></div></section>;
}
