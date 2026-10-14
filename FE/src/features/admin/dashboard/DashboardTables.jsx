import { Link } from 'react-router-dom';
import { time,labels } from './format.js';
export function RecentDocuments({ data }) {
  return (
    <article className="dashboard-card">
    <h2>PDF tải lên gần đây</h2>
    <Link to="/admin/documents">Quản lý tài liệu →</Link>{!data.recentDocuments.length?<p>Chưa có tài liệu.</p>:<div className="dashboard-table-scroll">
    <table>
    <thead>
    <tr>
    <th>Tài liệu</th>
    <th>Người tải</th>
    <th>Môn học</th>
    <th>Thời gian</th>
    <th>Trạng thái</th>
    </tr>
    </thead>
    <tbody>{data.recentDocuments.map(row=>
    <tr key={row.id}>
    <td>
    <Link to={`/admin/documents/${row.id}`}>{row.fileName}</Link>
    </td>
    <td>{row.uploader}</td>
    <td>{row.courseName}</td>
    <td>{time(row.createdAt)}</td>
    <td>{labels[row.status]??row.status}</td>
    </tr>)}</tbody>
    </table>
    </div>}</article>
  );
}
export function RecentAudit({ data }) {
  return (
    <article className="dashboard-card">
    <h2>Nhật ký quản trị gần đây</h2>{!data.audit.length?<p>Chưa có nhật ký quản trị.</p>:<div className="dashboard-table-scroll">
    <table>
    <thead>
    <tr>
    <th>Quản trị viên</th>
    <th>Hành động</th>
    <th>Đối tượng</th>
    <th>Thời gian</th>
    </tr>
    </thead>
    <tbody>{data.audit.map(row=>
    <tr key={row.id}>
    <td>{row.actor}</td>
    <td>{row.action}</td>
    <td>{['user','document'].includes(row.entityType)?<Link to={`/admin/${row.entityType==='user'?'users':'documents'}/${row.entityId}`}>{row.entityType} #{row.entityId}</Link>:`${row.entityType} #${row.entityId}`}</td>
    <td>{time(row.createdAt)}</td>
    </tr>)}</tbody>
    </table>
    </div>}</article>
  );
}
export function DashboardNotes({ data }) {
  return (
    <aside className="dashboard-card">
    <h2>Phạm vi dữ liệu</h2>
    <ul>{data.notes.map(note=>
    <li key={note}>{note}</li>)}</ul>
    </aside>
  );
}
