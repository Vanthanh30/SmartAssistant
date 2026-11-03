# Lượt 3 – Tách business modules

## Kết quả và phạm vi

Đã tách truy vấn MySQL, lưu trạng thái phiên/audit, mapper, request validators và API clients khỏi service/routes. Giữ JavaScript ESM, 65 khai báo HTTP method/path, database/schema, câu SQL, quyền sở hữu, DTO, mã lỗi, model/provider, retry và thuật toán RAG hiện có. Không chạy migration, reindex, seed hoặc ghi dữ liệu MySQL thật; không chỉnh `.env` hay cài dependency mới.

Code trước lượt 3 có SQL trực tiếp trong Auth, Documents, Chat, Learning, Calendar, nguồn công thức và Admin; routes giữ các schema domain; adapter LLM/Google nằm trong business modules. Nguyên nhân là những trách nhiệm này được gom trong các implementation schema version 16 trước đây.

## Mapping file và trách nhiệm mới

| Thành phần cũ | File mới/cập nhật | Trách nhiệm |
| --- | --- | --- |
| `modules/auth/service.js` | Giữ service; thêm `auth/repository.js`, `sessionRepository.js`, `mapper.js` | Service giữ JWT/CSRF, policy và transaction; repository giữ MySQL và trạng thái thu hồi phiên trên filesystem |
| `modules/shared/documents.js` | `modules/documents/service.js`, `repository.js`, `mapper.js` | Điều phối upload/process/delete; lưu tài liệu/chunk/vector; ánh xạ DTO |
| `modules/shared/chat.js` | `modules/conversations/service.js`, `repository.js`, `mapper.js` | Điều phối hỏi đáp, idempotency, kiểm chứng; repository giữ history/search/citations/turns và lock SQL |
| `modules/shared/learning.js` | `modules/learning/service.js`, `repository.js`, `mapper.js` | Sinh/chấm/lưu Quiz/Flashcard và lịch sử bài; repository giữ câu hỏi, câu trả lời và lượt làm |
| `modules/shared/calendar.js` | `modules/studyCalendar/service.js`, `sessionRepository.js`, `sessionMapper.js` | Lập lịch, xung đột và đồng bộ; persistence và DTO buổi học |
| `modules/shared/sourceService.js` | `modules/documents/sourceService.js`, `modules/conversations/sourceRepository.js` | Kiểm tra ownership và lấy nguồn/ảnh công thức; SQL payload câu trả lời được tách riêng |
| `modules/shared/formulas.js` | `modules/documents/formulaService.js` | Giữ pipeline tạo/lưu ảnh công thức và đường dẫn worker hiện có |
| `modules/shared/ai.js`, `learningAi.js` | `modules/conversations/aiService.js`, `modules/learning/aiService.js` | Giữ prompt, ngân sách context, xử lý/kiểm chứng đầu ra của AI |
| `modules/shared/recovery.js` | Giữ orchestration; thêm `recoveryRepository.js` | Recovery gọi repository; không thay policy orphan/lock/retry |
| `modules/admin/service.js` | Thêm `admin/repository.js`, `auditRepository.js`, `mapper.js` | Query/filter SQL và audit filesystem tách khỏi policy admin/DTO composition |
| Schema inline trong `routes/study.routes.js` | `requestSchema.js` trong Documents, Conversations, Learning, StudyCalendar; `shared/idSchema.js` | Giữ nguyên validation, defaults, refinements, strict/passthrough và giới hạn ID |
| `modules/conversations/gemini.js`, transport trong `provider.js` | `integrations/llm/gemini.js`, `openai.js`, `caller.js` | Một điểm chọn provider; HTTP, token count, retry, timeout và mapping lỗi không đổi |
| `modules/studyCalendar/google/adapter.js`, `crypto.js` | `integrations/google/adapter.js`, `crypto.js`; `modules/studyCalendar/google/eventMapper.js` | OAuth/HTTP/mã hóa thuộc integration; mapping ownership/revision/reminder của buổi học thuộc domain |

Đã cập nhật import ở routes, services, các test LLM và script benchmark. Export `responsesCaller` tại provider cũ được giữ để tương thích người gọi hiện hữu, cùng trỏ về integration selector; không có bản transport sao chép thứ hai. Các hàm đã được đặt tên theo chức năng nghiệp vụ; tên định danh không còn gắn với phiên bản lược đồ.

Users/Courses đã có service/repository/schema riêng từ trước nên không viết lại. `modules/shared/repository.js` tiếp tục là lớp ownership lookup dùng chung, và `studyCalendar/locks.js` giữ quản lý connection/lock/transaction. Không tạo generic SQL runner hoặc DI framework.

## Quy tắc persistence

- Repository có các thao tác mang tên nghiệp vụ, không nhận SQL tùy ý từ controller.
- Service điều khiển thứ tự nghiệp vụ và transaction; truyền đúng connection hiện tại vào repository. Không đưa truy vấn đang ở transaction lên pool.
- Các thao tác SQL tách trực tiếp giữ mảng positional bindings và MySQL result tuple, tránh chuyển đổi Date, Buffer, null, JSON hoặc ID lớn khi refactor.
- Filter/search SQL của history và admin được chuyển cùng repository, giữ escaping/pagination và thứ tự count/list ban đầu.
- Đường dẫn `storage/erd16-security`, namespace audit/artifact, tên lock, timestamp, JWT/cookie và atomic rename giữ nguyên.
- Việc tạo repository operation không tạo lại tài liệu, embedding hoặc FAISS index.

## Kiểm thử

50 test JavaScript cũ đã chạy đạt trước thay đổi. Chạy lại contract tests sau khi tách validator, repository, storage/mapper và integrations; chạy toàn bộ JavaScript sau khi chuyển module.

Bổ sung 15 test module, trong đó một test đối chiếu 93 thao tác SQL với fixture chụp từ source trước refactor. Kiểm tra SQL, execute/query, giữ nguyên binding và result tuple; kiểm tra thêm filter admin/history, transaction rollback/release, quản trị viên cuối cùng, bài có lịch sử và replay câu hỏi không gọi lại retrieval/AI. Có test validator, OAuth state, mã hóa token, ownership/revision của event và ranh giới kiến trúc/import cycles.

Kết quả kiểm tra cuối:

- `npm test`: **65/65** JavaScript tests (21 contract/foundation, 15 module, 12 LLM, 17 retrieval).
- `npm run test:modules`: **15/15**.
- `npm run lint`: đạt.
- `npm run format:check`: đạt; chỉ format các file thuộc phạm vi đã refactor.
- `..\.venv\Scripts\python.exe -m unittest discover -s tests/rag -p 'test_*.py'`: **11/11** Python tests.
- Đối chiếu source snapshot cục bộ: **151 SQL literals/template prefixes** giữ nguyên. Kiểm tra này bổ sung cho test thực thi repository, không chứng minh kết quả EXPLAIN hoặc dữ liệu DB thật.

Tests dùng pool/connection giả và adapter giả; không gọi Gemini, Cloudinary hoặc Google thật. Chưa chạy integration ghi DB hoặc thao tác end-to-end bằng tài khoản thật. Log `DB_NOT_READY` trong contract test là lỗi giả được chủ động tạo để kiểm tra readiness. Python test còn cảnh báo deprecation Starlette/httpx từ thư viện hiện hữu.

## Dependency, hiệu năng và giới hạn

Không thêm/nâng cấp dependency; thêm script `test:modules`, đưa test module vào `npm test` và mở rộng danh sách format cho các file đã refactor. Không thay package lock trong lượt này.

Lượt này tách trách nhiệm, chưa tối ưu query/latency và không tuyên bố tăng tốc. Query lặp, N+1, giới hạn tần suất, thứ tự kiểm tra quyền và resource cleanup được giữ nguyên. Các service điều phối phức tạp vẫn cần đánh giá theo nghiệp vụ khi tối ưu lượt 4; không rút gọn thuật toán chỉ để giảm số dòng.

Các vấn đề audit lượt 2 vẫn được giữ riêng: Courses xác thực hai lần, student 429 dạng text, SyntaxError map 400, PDF quá dung lượng có thể mang mã avatar, nhánh RELEASE_LOCK lỗi có thể bỏ qua release ở một số flow, audit đọc toàn file và N+1. Test cũng ghi nhận schema submit hiện tại chấp nhận mảng answers rỗng sau safeExtend; không thay validation này trong refactor.

Không cần xác nhận thêm để sử dụng kết quả lượt 3. Lượt 4 là tối ưu có đo lường và phải xác định riêng vấn đề nào được phép thay đổi hành vi.
