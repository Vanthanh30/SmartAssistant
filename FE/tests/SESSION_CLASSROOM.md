# Kiểm tra học từng buổi

Trang /app/study-calendar/sessions/:sessionId có ba bước: nội dung, đọc nguồn và luyện tập. Link Học ngay dùng cùng hàm tạo đường dẫn và giữ ID kiểu chuỗi, không ép số bigint.

Buổi có lesson hiển thị mục tiêu, kiến thức, hoạt động và nguồn AI đã lưu. Buổi cũ vẫn mở PDF và tạo bài luyện theo documentId/pageFrom/pageTo đã lưu; không bịa nội dung AI hoặc bắt tạo lại toàn bộ kế hoạch. Backend xác định phạm vi thật theo sessionId và kiểm tra quyền sở hữu; không tin phạm vi do trình duyệt tự chọn.

PDF viewer nhận pageFrom/pageTo tùy chọn để giới hạn điều hướng trong buổi, các màn hình PDF khác giữ cách dùng cũ. Chuyển bộ luyện tập xóa studyAttempt của bộ trước để tránh mở nhầm lượt làm bài. Buổi hoàn thành có trạng thái mới sau tải lại.

Đã chạy:

- node --test tests/session-study-model.test.js: ID bigint, buổi cũ, phạm vi thiếu, nội dung buổi AI.
- scripts/test-session-classroom.cjs với Playwright có sẵn, FE đang chạy: bấm Học ngay từ lịch, truy cập URL trực tiếp, đọc trang 2–3, làm và xác nhận đáp án quiz, lật flashcard, hoàn thành rồi reload, buổi AI, viewport điện thoại 390px và lỗi 404 của API.
- Browser API được mô phỏng toàn bộ; không đăng nhập tài khoản thật, không ghi dữ liệu thật và không gọi Gemini. Có thể chỉ định PLAYWRIGHT_MODULE và BROWSER_EXECUTABLE khi dùng công cụ ngoài node_modules dự án.

Ảnh kiểm tra nằm trong tests/artifacts/session-classroom-desktop.png và session-classroom-mobile.png. Lint và build được chạy riêng; cảnh báo kích thước bundle 500 kB hiện có không chặn build.

Trang lịch được thu gọn về tạo lịch qua chat; không còn nút Tùy chỉnh nâng cao, Thêm buổi học hoặc thao tác thêm trực tiếp từ ô trống. Bộ lọc môn/trạng thái được mở khi cần. Popup buổi học chỉ hiển thị thời gian, trạng thái, tối đa hai mục tiêu và hai nguồn; sửa/hoàn thành/hủy ở Thao tác khác, Google ở phần mở rộng. Trạng thái đồng bộ khỏe không hiện nút thử lại hoặc tiếp tục xóa. Luồng dời lịch vẫn yêu cầu xem giờ và xác nhận trước khi thay đổi.

test-session-classroom.cjs kiểm tra thêm mở chat, bộ lọc, popup gọn, trạng thái Google, tìm giờ dời và kích thước popup trên điện thoại. Ảnh bổ sung: calendar-hub-desktop.png, session-preview-desktop.png, session-preview-mobile.png. session-preview-model.test.js kiểm tra loại bỏ tiêu đề trùng, giới hạn thông tin và hành động theo trạng thái.
