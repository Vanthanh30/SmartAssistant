import { AdminDashboard } from '../features/admin/dashboard/AdminDashboard.jsx';
import { Routes, Route, Link } from 'react-router-dom';
import { AuthForm } from '../features/auth/AuthForm.jsx';
import { RequireAuth } from '../features/auth/RequireAuth.jsx';
import { AccountLayout } from '../layouts/AccountLayout.jsx';
import { StatusPanel } from '../components/StatusPanel.jsx';
import { ProfilePage } from '../features/profile/ProfilePage.jsx';
import { CoursesPage } from '../features/courses/CoursesPage.jsx';
import { CoursePage } from '../features/courses/CoursePage.jsx';
import { StudyPage } from '../features/learning/StudyPage.jsx';
import { HistoryPage } from '../features/history/HistoryPage.jsx';
import { HistoryDetailPage } from '../features/history/HistoryDetailPage.jsx';
import { AdminUsersPage } from '../features/admin/users/AdminUsersPage.jsx';
import { AdminUserDetailPage } from '../features/admin/users/AdminUserDetailPage.jsx';
import { AdminDocumentsPage } from '../features/admin/documents/AdminDocumentsPage.jsx';
import { AdminDocumentDetailPage } from '../features/admin/documents/AdminDocumentDetailPage.jsx';
import { LandingPage } from '../features/LandingPage.jsx';
export function App() {
  return <Routes><Route path="/" element={<LandingPage/>}/>
    <Route path="/admin/login" element={<AuthForm key="admin-login" mode="admin"/>}/>
    <Route path="/register" element={<AuthForm key="register" mode="register"/>}/><Route path="/login" element={<AuthForm key="login" mode="login"/>}/>
    <Route element={<RequireAuth role="student"/>}><Route element={<AccountLayout role="student"/>}><Route path="/app/courses" element={<CoursesPage/>}/><Route path="/app/courses/:courseId" element={<CoursePage/>}/><Route path="/app/learning/:setId" element={<StudyPage/>}/><Route path="/app/profile" element={<ProfilePage/>}/><Route path="/app/history" element={<HistoryPage/>}/><Route path="/app/history/:conversationId" element={<HistoryDetailPage/>}/></Route></Route>
    <Route element={<RequireAuth role="admin"/>}><Route element={<AccountLayout role="admin"/>}><Route path="/admin/dashboard" element={<AdminDashboard/>}/><Route path="/admin/users" element={<AdminUsersPage/>}/><Route path="/admin/users/:userId" element={<AdminUserDetailPage/>}/><Route path="/admin/documents" element={<AdminDocumentsPage/>}/><Route path="/admin/documents/:documentId" element={<AdminDocumentDetailPage/>}/></Route></Route>
    <Route path="*" element={<StatusPanel title="Không tìm thấy trang"><Link to="/">Về trang chủ</Link></StatusPanel>}/></Routes>;
}
