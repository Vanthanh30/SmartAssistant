# Lượt 2 – Chuẩn hóa nền tảng backend

## Phạm vi và kết quả

Tách lớp HTTP theo Controller–Service, giữ JavaScript ESM và cấu hình runtime hiện có. Không chỉnh schema, migration, dữ liệu, câu SQL, model/provider, thuật toán RAG hoặc reindex. Các đường dẫn artifact, tên cookie, JWT issuer/audience và quyền truy cập được giữ nguyên.

Đã kiểm tra `app.js`, config env/db/schema, middleware auth/validation, routes và controllers Auth/Users/Courses, schema version 16 student/admin, Calendar, PDF transport, package scripts và ESLint. Config đã quản lý kết nối/biến môi trường đúng phạm vi nên giữ nguyên; không tạo lớp config hoặc DI mới. Không đọc hoặc sửa trực tiếp `.env` trong lượt này.

## Mapping và trách nhiệm

| Trước | Sau | Trách nhiệm |
| --- | --- | --- |
| Middleware inline trong `src/app.js` | `src/middlewares/requestId.js`, `bodyParser.js`, `noStore.js`, `errorHandler.js` | Request ID, giới hạn JSON theo route, cache header, 404 và xử lý lỗi |
| `src/shared/validation.js` | `src/middlewares/validate.js` | Validate request, giữ mã lỗi và fields |
| Limiter/upload inline trong routes | `src/middlewares/rateLimit.js`, `upload.js` | Chính sách HTTP hiện có; giữ nguyên cửa sổ, key, giới hạn và handler |
| `src/modules/{auth,users,courses}/routes.js` | `src/routes/{auth,users,courses}.routes.js` | Method, endpoint, middleware, controller và composition |
| `src/modules/{auth,users,courses}/controller.js` | `src/controllers/{auth,users,courses}.controller.js` | Nhận request, gọi service, serialize response/cookie |
| `src/modules/shared/routes.js` | `src/routes/study.routes.js`, `src/controllers/study.controller.js` | Khai báo student API và HTTP adapter |
| Chunk/formula lookup inline | `src/modules/shared/sourceService.js` | Quyền sở hữu, đọc chunk/formula và tải asset theo logic cũ |
| `src/modules/shared/admin.js` | `src/routes/admin.routes.js`, `src/controllers/admin.controller.js`, `src/modules/admin/service.js` | Routes/controller không còn SQL; service giữ nguyên query, transaction, audit và nghiệp vụ cũ |
| `src/modules/studyCalendar/controller.js` | `src/controllers/calendar.controller.js` | Calendar và Google callback HTTP adapter |
| `src/modules/documents/controller.js` | `src/controllers/pdf.controller.js`, `src/helpers/parseRange.js` | HTTP PDF streaming và helper thuần phân tích byte range |
| Health handler inline | `src/controllers/health.controller.js` | Live/readiness response và mapping lỗi readiness |

`app.js` là composition root. Service/repository hiện hữu tiếp tục được sử dụng. Các schema domain inline ở study routes được giữ nguyên; việc gom validators và tách sâu repository/service thuộc lượt 3. Không áp dụng framework DI hoặc abstraction mới.

## Tooling và dependency

- Thêm duy nhất `prettier@3.9.10` vào devDependencies, pin phiên bản, Node engine tương thích. Không thêm dependency runtime.
- ESLint giữ recommended rules, thêm `no-duplicate-imports`, bỏ qua `.cache` chứa snapshot phục vụ review.
- `npm run lint`, `lint:fix`, `format`, `format:check`, `test:contracts`, `test`.
- Format chỉ áp dụng danh sách foundation trong `scripts/format-foundation.js`; không format toàn repository/business modules cũ.
- Khi cài đặt npm báo 5 advisory (2 moderate, 3 high) trong dependency tree. Không chạy auto-fix/upgrade vì ngoài phạm vi lượt 2.

## Kiểm thử và giới hạn

10 characterization test đã chạy đạt trên code trước khi di chuyển. Sau refactor bổ sung test cookie, forwarding của 12 write controllers, body limits, error middleware, PDF range/HEAD/416, CORS và ảnh công thức không tồn tại. Inventory runtime được đối chiếu với fixture chụp trước refactor: giữ đủ 65 method/path declarations.

- `npm test`: 50 test JavaScript (21 foundation/contract, 12 LLM, 17 retrieval).
- `npm run lint`, `npm run format:check`.
- `..\.venv\Scripts\python.exe -m unittest discover -s tests/rag -p 'test_*.py'`: 11 test Python.

Test HTTP dùng server localhost và pool giả; write controller test dùng service giả. Không chạy transaction ghi MySQL thật hoặc gọi Gemini/Cloudinary/Google thật. Các test này bảo vệ phần nền tảng và regression hiện có, chưa thay thế regression nghiệp vụ/integration thực tế ở lượt 5. Test readiness chủ động tạo 503 nên log `DB_NOT_READY` trong test là mong đợi. Python test có cảnh báo deprecation Starlette/httpx; không đổi thư viện trong lượt này.

## Vấn đề còn lại và lượt tiếp theo

Giữ riêng các phát hiện audit để tránh đổi hành vi trong refactor: Courses xác thực hai lần; student limiter trả text 429; mọi SyntaxError bị map thành 400; PDF upload chưa gán uploadKind nên lỗi quá dung lượng có thể mang mã avatar; resource cleanup ở nhánh RELEASE_LOCK lỗi; N+1/history/citation và audit đọc toàn file. Không sửa những vấn đề này trong lượt 2.

Chưa thực hiện tối ưu latency/query và chưa có số đo trước/sau để tuyên bố tăng tốc. Lượt 3 sẽ tách repository, validator, service và integrations theo từng module. Không cần xác nhận bổ sung cho kết quả lượt 2; phạm vi lượt 3 là bước tiếp theo riêng.
