# Lượt 5 – Regression

## Kết quả và phạm vi

Đã chạy regression sau các lượt refactor/tối ưu, bổ sung 11 test nghiệp vụ và smoke HTTP chỉ đọc với MySQL local thật. Lượt này chỉ thêm test, script smoke, script npm và tài liệu; không sửa nghiệp vụ, schema, dữ liệu hiện tại, model, thuật toán retrieval hoặc dependency. Không tạo tài khoản thử, không reindex và không chạy recovery trên dữ liệu thật.

## Ma trận kiểm thử

| Nhóm | Kiểm tra đã chạy | Môi trường |
| --- | --- | --- |
| Auth | Register hash mật khẩu, login, authenticate, refresh, CSRF, token giả, mật khẩu sai, tài khoản khóa, email trùng; cookie HTTP | Service/repository thật với pool giả; HTTP contract fixture |
| User | Profile update/DTO, thiếu avatar, ảnh sai định dạng | Service thật, repository giả; Sharp decode thật với dữ liệu không hợp lệ |
| Courses | List/DTO, ownership bindings, FK conflict khi xóa, rollback/release | HTTP fixture và repository với connection giả |
| Documents | Quyền sở hữu trước download, bytes/name/size, PDF không hợp lệ, process tài liệu ready không gọi lại extraction/reindex | Service/repository thật với pool và cloud/RAG adapter giả |
| PDF HTTP | Byte range, HEAD, 416, header, content | Server Express localhost thật với buffer PDF giả |
| RAG/AI | Hybrid/batch, scope/ownership, cache invalidation, nguồn thay đổi/xóa, query nhiều ý; câu ADN trên nguồn nhiệt học trả “Tài liệu không đề cập…” mà không gọi LLM | JS/Python tests dùng fixture; không gọi Gemini hay FAISS production |
| LLM | Gemini request/count/generation/verification, citations, quota/rate/timeout, không fallback key | Fetch/adapter giả |
| Quiz | Giấu đáp án trước confirm, reveal khi confirm, chặn đổi đáp án, submit chấm 100 | Service/repository thật, trạng thái SQL mô phỏng trong RAM |
| Flashcard | Đọc đáp án, chặn choice của quiz, ghi memory, hoàn thành với score null | Service/repository thật, trạng thái SQL mô phỏng trong RAM |
| Study Plans | Đề xuất tránh giờ bận, giới hạn phút/số buổi, khoảng nghỉ, UUID ổn định | Scheduler thật với clock cố định |
| Calendar | Version/STALE_VERSION, không UPDATE hoặc gọi Google khi stale; rollback/release | Service/repository thật, connection/adapter giả |
| Google | OAuth state/CSRF/expiry/one-time, crypto owner/account binding, event ownership/revision/reminder | Service/mapping/crypto thật với adapter giả |
| Admin | Role guard, DTO, filter parameterization, bảo vệ quản trị viên cuối cùng, audit tail | HTTP/service/repository fixture và filesystem tạm |
| Tối ưu lượt 4 | Citation batch chỉ lấy trang hiển thị, thứ tự/sourceDeleted/cursor, trang rỗng; audit Unicode/dòng dài/byte đọc | Fixture + file tạm |
| API tổng thể | Inventory 65 method/path, 401/403/404/413/422/429, JSON limits, CORS, request ID | HTTP contract fixture |
| MySQL thật | Schema 16 bảng/124 cột/21 FK, kiểm tra dữ liệu mồ côi; readiness HTTP | MySQL development local, chỉ đọc |
| FE | ESLint và production build | Source FE thực tế; không phải browser E2E |

## Lệnh và kết quả

Từ `BE`:

```powershell
npm test
npm run test:regression
npm run lint
npm run format:check
npm run verify:database
npm run smoke:readonly
..\.venv\Scripts\python.exe -m unittest discover -s tests/rag -p 'test_*.py'
```

- Toàn bộ JavaScript: **78/78** (67 test đã có + 11 regression mới).
- Regression mới: **11/11**.
- Python: **11/11**.
- Backend lint/format: đạt.
- `verify:database`: schema và integrity đạt, không truyền cờ kiểm tra ghi dữ liệu.
- `smoke:readonly`: 4/4 HTTP checks đạt: live 200, ready 200, courses không đăng nhập 401/SESSION_EXPIRED, endpoint không tồn tại 404/NOT_FOUND; request ID body/header khớp.

Từ `FE`: `npm run lint`, `npm run build` đạt. Build tạo lại artifact local `dist` và PDF assets; không triển khai/publish. Vite còn cảnh báo bundle vượt 500 kB; Python có cảnh báo deprecation Starlette/httpx. Không đổi thư viện để xử lý cảnh báo ngoài phạm vi này.

## File thay đổi và cách chạy lại

- `tests/modules/regression.test.js`: các luồng nghiệp vụ và trường hợp từ chối ở trên. SQL writes trong test chỉ mô phỏng trong RAM; không có kết nối MySQL trong fixture.
- `scripts/smoke-readonly.js`: khởi tạo `createApp` trên cổng localhost ngẫu nhiên với pool thật, gọi các GET công khai/không đăng nhập rồi đóng server/pool. Chỉ cho phép config development + DB host local. Không import `server.js` vì startup thông thường có recovery cập nhật bản ghi.
- `package.json`: thêm `test:regression`, `smoke:readonly`. `npm test` đã bao gồm file regression qua glob modules.
- `scripts/format-foundation.js`: thêm script smoke vào phạm vi format.
- Báo cáo này ghi bằng chứng và giới hạn. Không thêm dependency và không thay package lock.

Smoke script không in credentials, cookie hoặc nội dung lỗi từ dịch vụ. Tên mã lỗi auth được kiểm tra theo contract hiện hữu `SESSION_EXPIRED`, không đổi ứng dụng sang mã mới.

## Giới hạn và vấn đề còn lại

Đã hoàn thành lượt regression trong môi trường hiện có; chưa thể kết luận toàn bộ production/end-to-end đã đạt. Không thực hiện đăng nhập/UI bằng tài khoản thật, upload/process/delete PDF thật, ghi/chấm bài trên MySQL thật, thanh toán/quota Gemini, hoặc consent/upsert/delete event Google thật. API trên cổng cấu hình và RAG service không chạy tại lúc khảo sát; smoke dùng server tạm để tránh khởi chạy recovery. Không cài browser driver hoặc dịch vụ mới.

Pool giả xác minh orchestration, query arguments và response; không thay thế MySQL transaction isolation, FK execution hoặc concurrency/load test. Kiểm tra schema/integrity thật không chứng minh các luồng ghi này. Các known issues về xác thực Courses lặp, response 429, mapping SyntaxError/upload và cleanup lock/N+1 còn lại được giữ nguyên như báo cáo lượt 3/4.

Không tuyên bố thêm cải thiện tốc độ trong lượt 5; số đo lượt 4 vẫn là benchmark fixture. Không có quyết định bắt buộc phải xác nhận để sử dụng test/script đã thêm. Nếu kiểm thử E2E có ghi dữ liệu hoặc Google/Gemini thật ở bước tiếp theo, cần xác định môi trường test và tài khoản/nguồn thử phù hợp trước khi chạy các thao tác đó.
