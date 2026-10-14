import { EmptyState } from '../../components/EmptyState.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listCourses } from './api.js';
import { CourseDialog } from './CourseDialog.jsx';
import { StatusPanel } from '../../components/StatusPanel.jsx';
import { useAuth } from '../auth/useAuth.js';
import { BookOpen, Search, ArrowUpRight, Files, Sparkles } from 'lucide-react';
export function CoursesPage() {
  const { data: auth } = useAuth();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ q: '', page: 1, pageSize: 20 });
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setFilters(previous => previous.q === search.trim() ? previous : { ...previous, q: search.trim(), page: 1 }), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const courses = useQuery({ queryKey: ['courses', 'list', auth?.user.id, filters], queryFn: ({ signal }) => listCourses(filters, signal), retry: false });
  const saved = () => setNotice('Đã lưu môn học.');
  return <section className="courses-page"><div className="course-welcome"><div><span className="eyebrow"><Sparkles size={16} aria-hidden="true"/> HỌC TẬP CÙNG AI</span><h1>Chào {auth?.user.fullName},<br/><span>hôm nay bạn muốn học gì?</span></h1><p>Mỗi môn học là một không gian riêng để lưu tài liệu,<br className="desktop-break"/> khám phá kiến thức và ôn tập theo cách của bạn.</p><CourseDialog trigger="Tạo môn học" onSaved={saved}/></div><div className="welcome-art" aria-hidden="true"><div className="art-orbit"/><div className="art-book"><BookOpen size={64} strokeWidth={1.4}/></div><span className="art-spark"><Sparkles size={25}/></span><span className="art-tag">Tài liệu → Kiến thức</span></div></div>
    <div className="page-heading course-list-heading"><div><span className="eyebrow">THƯ VIỆN CÁ NHÂN</span><h2>Môn học của tôi {courses.data && <span className="count-pill">{courses.data.meta.total}</span>}</h2><p>Gom tài liệu, hỏi đáp và bộ học vào cùng một nơi.</p></div></div>
    <div className="search-row"><label className="sr-only" htmlFor="course-search">Tìm môn học</label><div className="search-input"><Search size={19} aria-hidden="true"/><Input id="course-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm theo tên môn…" maxLength={150}/></div>{search && <button onClick={() => setSearch('')}>Xóa từ khóa</button>}</div>
    {notice && <p role="status" className="success-text">{notice}</p>}
    {courses.isPending ? <StatusPanel title="Đang tải môn học…"/> : courses.isError ? <StatusPanel title="Không thể tải môn học" retry={() => courses.refetch()}><p>{courses.error.message}</p></StatusPanel> : <>
      {!courses.data.data.length ? <EmptyState title={filters.q ? 'Không tìm thấy môn học' : 'Bắt đầu với môn học đầu tiên'}><p>{filters.q ? 'Thử từ khóa khác hoặc xóa từ khóa để xem lại thư viện.' : 'Tạo môn học, thêm PDF và biến tài liệu thành không gian học tập của bạn.'}</p>{!filters.q && <CourseDialog trigger="Tạo môn học đầu tiên" onSaved={saved}/>}</EmptyState> : <div className="course-grid">{courses.data.data.map((course, index) => <article className={`course-card course-tone-${index % 3}`} key={course.id}><div className="course-card-top"><span className="course-icon"><BookOpen size={24} aria-hidden="true"/></span><span className="course-label">MÔN HỌC</span></div><h3><Link to={`/app/courses/${course.id}`}>{course.name}</Link></h3><p className="course-card-description">{course.description || 'Thêm mô tả để ghi lại mục tiêu học tập của môn này.'}</p><span className="course-meta"><Files size={16} aria-hidden="true"/>{course.readyDocumentCount} tài liệu sẵn sàng</span><div className="course-card-footer"><Link to={`/app/courses/${course.id}`} className="course-open">Mở môn học <ArrowUpRight size={17} aria-hidden="true"/></Link><CourseDialog course={course} trigger="Sửa" onSaved={saved}/></div></article>)}</div>}
      <nav className="pagination" aria-label="Phân trang môn học"><button disabled={filters.page === 1} onClick={() => setFilters(previous => ({ ...previous, page: previous.page - 1 }))}>Trang trước</button><span>Trang {filters.page} · {courses.data.meta.total} môn học</span><button disabled={filters.page * filters.pageSize >= courses.data.meta.total} onClick={() => setFilters(previous => ({ ...previous, page: previous.page + 1 }))}>Trang sau</button></nav>
    </>}</section>;
}
