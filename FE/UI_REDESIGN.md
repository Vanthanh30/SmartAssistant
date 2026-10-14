# Redesign frontend — 10/10/2026

Đã chỉnh trực tiếp FE theo phong cách Modern AI EdTech SaaS. Tham chiếu đặc tả gốc và `docs/wireframes.md`; giữ React/Vite/Router/TanStack Query, các API, schema, authentication, authorization và mutation/query đang có. Không sửa source BE hoặc migrations. Fixtures kiểm tra là dữ liệu trên DB `_test` thật, không thay API bằng mock.

## Giao diện

- Tokens riêng trong FE: pastel blue `#6B9DFF`, nền `#F7F9FC`, surface trắng, chữ `#172B4D`, border `#E5EAF2`, accent `#DCEAFF`. CTA dùng chữ đậm tối trên nền pastel để dễ đọc.
- Be Vietnam Pro được đóng gói local bằng Fontsource; Lucide React cung cấp icon. Không thêm UI framework lớn.
- Sidebar active/collapsible, breadcrumb, menu tài khoản, avatar riêng tư; mobile drawer có Escape, focus loop và trả focus, ngăn tab tới sidebar khi đã đóng. Role và các route guard giữ nguyên.
- Trang môn học có welcome, CTA, tìm kiếm debounce cũ, card grid 3/2/1 cột, trạng thái rỗng có CTA. Số môn và số tài liệu lấy từ API.
- Banner xác nhận email gọn, giữ nguyên resend/pending/queued/error.
- Workspace desktop đặt nguồn PDF và chat cạnh nhau, quiz/flashcard phía dưới; màn hình nhỏ xếp một cột. Link nội trang đến từng phần. Viewer, trích dẫn, retry, polling và các cảnh báo nghiệp vụ giữ nguyên.
- Chat có phân biệt người hỏi/trợ lý, timestamp, citation chip, empty state và composer. Quiz, flashcard, hồ sơ, lịch sử, admin users/documents và các dialog dùng chung typography, cards, forms, focus/hover/disabled states.
- Landing và login/register được redesign; mọi field, validation, submit và điều hướng sau đăng nhập được giữ.
- Không thêm route lịch học/cài đặt/dashboard hoặc danh sách quiz/flashcard toàn hệ thống vì chưa tồn tại. Quiz/flashcard vẫn ở môn học và `/app/learning/:setId`.

## Files

| Phần | File |
|---|---|
| Layout | `src/layouts/AccountLayout.jsx` |
| Reusable UI | `src/components/Brand.jsx`, `SectionHeading.jsx`, `EmptyState.jsx` |
| Design system/font | `src/styles/tokens.css`, `global.css`, `src/main.jsx` |
| Landing/auth | `src/features/LandingPage.jsx`, `auth/AuthForm.jsx`, `auth/EmailVerification.jsx`, `src/app/App.jsx` |
| Môn học/workspace | `src/features/courses/{CoursesPage,CoursePage,CourseDialog}.jsx` |
| PDF/chat | `src/features/documents/{DocumentsPanel,UploadDialog}.jsx`, `chat/{ChatPanel,MessageList}.jsx` |
| Bộ học/hồ sơ/lịch sử | `src/features/learning/{StudyPanel,StudyPage}.jsx`, `profile/ProfilePage.jsx`, `history/HistoryPage.jsx` |
| Admin | `src/features/admin/users/AdminUsersPage.jsx`, `admin/documents/AdminDocumentsPage.jsx` |
| Dependencies/test | `package.json`, `package-lock.json`, `vite.config.js`, `playwright.config.js`, `tests/{auth,profile-courses}.spec.js` |

CSS chung cũng áp dụng cho các trang chi tiết, PDF viewer, source citation và dialogs không cần thay logic JSX của chúng.

## Kiểm tra

- `npm run build`: pass; Vite vẫn cảnh báo main chunk khoảng526 kB, không phải lỗi build.
- Regression Chromium: **8/8 pass**, real Express API/MySQL `_test`, không mock API. Bao gồm đăng ký/validation/khôi phục phiên/quyền/logout/session replay, admin navigation/sidebar collapse, mật khẩu/mobile, tài khoản bị khóa, tạo/sửa/hủy/Escape môn học, tìm kiếm riêng tư, từ chối course của tài khoản khác, hồ sơ/email readonly/avatar local thật và drawer mobile/keyboard/overflow.
- Sau thay bố cục workspace cuối, chạy lại nhóm profile/course: **4/4 pass**. Đã kiểm overflow workspace desktop và390px/mobile.
- Các file UI mới/sửa trong danh sách lint riêng: pass. Lint toàn FE còn2 lỗi cũ `react-hooks/set-state-in-effect` ở AdminUsersPage/AdminDocumentsPage (`setSearch(q)` trong effect). Không thay logic đồng bộ filter hoặc tắt rule để che lỗi.
- Chromium kiểm public landing/login/register/verify-email trên desktop và public landing/login/register trên390px: không có pageerror hoặc horizontal overflow ở các trang đã kiểm.
- Screenshot nằm trong `ui-review/`: courses empty/grid/mobile, workspace desktop/mobile, profile, admin users/documents, auth và landing.

Playwright config tách `.vite-e2e` cache để không tranh chấp với dev5173; test API4001/FE5174 và DB hậu tố `_test` theo config hiện có. Provider Cloudinary/SMTP được để trống riêng trong môi trường regression nhằm tránh kế thừa credentials BE local; avatar regression dùng chế độ local thật có sẵn. Không gửi mail hoặc upload cloud trong các ca này.

Các lần chạy ban đầu bị sai cwd test runner, tranh chấp Vite cache và cleanup test chưa xóa email_accounts; đã điều chỉnh cấu hình/cleanup/selectors FE tests trước lượt pass. Lượt test đầu có provider được kế thừa còn ghi nhận BE trả500 `ER_DATA_TOO_LONG` khi upload avatar. Không sửa BE trong task này; cần kiểm riêng storage_key Cloudinary của avatar (UUID + `.webp` dài41 ký tự trong khi migration010 khai báo40) ở task backend.

## Còn cần kiểm thủ công

PDF thật có nhiều trang, câu trả lời LLM/citation/nguồn bị xóa, tạo/nộp/chấm quiz và lật bộ flashcard đã sinh, xóa tài liệu/hội thoại, resend email và Cloudinary thực tế chưa được chạy lại end-to-end trong đợt UI này. CSS/JSX cho các phần đó đã cập nhật, logic nguồn được tái sử dụng; không tuyên bố tất cả luồng provider đã nghiệm thu. Kiểm thêm tablet, màn hình hẹp320px, tên/file rất dài và điều hướng keyboard với dữ liệu thật.

Chạy dev như cũ: terminal BE `npm run dev`, terminal FE `npm run dev`; dùng `http://localhost:5173`. Nếu Vite đã mở trước khi cài dependencies mới, khởi động lại terminal FE rồi tải lại trang.
