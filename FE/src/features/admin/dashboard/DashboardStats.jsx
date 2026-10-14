import { Link } from 'react-router-dom';
import { Users,BookOpen,Files,MessagesSquare } from 'lucide-react';
import { number } from './format.js';
export function DashboardStats({ data }) {
  return (
    <div className="dashboard-stats">{[{icon:Users,title:'Người dùng · hiện tại',value:data.totals.users.total,detail:`${number(data.totals.users.active)} hoạt động · ${number(data.totals.users.blocked)} bị khóa`,to:'/admin/users'},{icon:BookOpen,title:'Môn học · hiện tại',value:data.totals.courses,detail:'Môn học cá nhân trên hệ thống'},{icon:Files,title:'PDF đang sử dụng · hiện tại',value:data.totals.documents.total,detail:`${number(data.totals.documents.ready)} sẵn sàng · ${number(data.totals.documents.processing)} đang xử lý · ${number(data.totals.documents.failed)} lỗi · ${number(data.totals.documents.unsupported)} không hỗ trợ`,to:'/admin/documents'},{icon:MessagesSquare,title:'Lượt hỏi · trong khoảng ngày',value:data.activity.total,detail:`${number(data.activity.processing)} đang xử lý · chỉ tính câu hỏi, không đếm đôi câu trả lời`}].map(({icon:Icon,title,value,detail,to})=>
    <article className="dashboard-card" key={title}>
    <Icon size={22} aria-hidden="true"/>
    <h2>{title}</h2>
    <strong className="dashboard-value">{number(value)}</strong>
    <p>{detail}</p>{to&&<Link to={to}>Xem quản lý →</Link>}</article>)}</div>
  );
}
export function DashboardMetrics({ data }) {
  return (
    <div className="dashboard-metrics">
    <article className="dashboard-card">
    <h2>Phản hồi trung bình</h2>
    <strong>{data.activity.averageLatencyMs==null?'Chưa có dữ liệu':`${number(data.activity.averageLatencyMs/1000)} giây`}</strong>
    <p>{number(data.activity.latencySamples)} lượt đã đo toàn luồng · không suy diễn lịch sử.</p>
    </article>
    <article className="dashboard-card">
    <h2>Tỷ lệ thiếu ngữ cảnh</h2>
    <strong>{data.activity.insufficientRate==null?'Chưa có dữ liệu':`${number(data.activity.insufficientRate*100)}%`}</strong>
    <p>{number(data.activity.insufficient)} / {number(data.activity.answered+data.activity.insufficient)} lượt có kết quả nghiệp vụ.</p>
    </article>
    <article className="dashboard-card">
    <h2>Hỏi đáp thất bại</h2>
    <strong>{number(data.activity.failed)}</strong>
    <p>Trong khoảng ngày · tách khỏi mẫu số thiếu ngữ cảnh.</p>
    </article>
    </div>
  );
}

export function AnswerOrigins({ activity }) {
  const origins = activity.origins;
  return <article className="dashboard-card"><h2>Nguồn trả lời · trong khoảng ngày</h2><p>Chỉ các lượt answered; mỗi câu hỏi đếm một lần, lịch sử còn lưu.</p><dl><dt>Dựa trên tài liệu</dt><dd>{number(origins?.grounded)}</dd><dt>Kiến thức chung</dt><dd>{number(origins?.general)}</dd><dt>Chưa xác định (unknown)</dt><dd>{number(origins?.unknown)}</dd></dl><p className="hint">Nguồn được ghi từ phiên bản015. Dữ liệu cũ giữ unknown; không suy từ model hoặc citation. Tỷ lệ thiếu ngữ cảnh ở trên bao gồm mọi answered, kể cả general/unknown.</p></article>;
}
