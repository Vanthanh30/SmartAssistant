# Study Assistant Backend

BE/FE đã nối database phát triển `SmartAssistant`: **16 bảng, 124 cột, 21 khóa ngoại**. Không thêm bảng/cột ngoài ERD. MySQL Windows chuẩn hóa tên bảng thành chữ thường.

## Chạy dự án

Yêu cầu Node.js22.13+ hoặc24, MySQL8, Python và dependencies `rag-service/requirements.txt`. Máy hiện tại đã có `.venv` ở thư mục gốc và cấu hình riêng; không ghi đè `.env` bằng file mẫu.

Terminal thứ nhất, từ thư mục gốc:

```powershell
cd BE
npm ci
npm run verify:database
npm run dev
```

Launcher khởi động API4000, worker phục hồi và RAG8001. Đợi log launcher `ready`; lần đầu tải model có thể lâu. Chỉ chạy một tiến trình RAG.

Terminal thứ hai, từ thư mục gốc:

```powershell
cd FE
npm ci
npm run dev
```

Mở `http://localhost:5173`. Học sinh đăng ký `/register`; quản trị viên đăng nhập `/admin/login`. Tài khoản quản trị ban đầu lấy từ `ADMIN_EMAIL`/`ADMIN_PASSWORD` trong `BE/.env`, mật khẩu DB là bcrypt. Seed không đổi mật khẩu tài khoản có sẵn, không in credentials.

## Cấu hình

- `DB_SCHEMA_VERSION=16`, `DB_NAME=SmartAssistant`; các biến MySQL theo `.env.example`.
- Cloudinary cần `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. PDF/ảnh công thức là tài nguyên riêng tư.
- RAG dùng `intfloat/multilingual-e5-base`, revision cố định. `RAG_SERVICE_TOKEN` giống nhau BE/Python. Xem `rag-service/.env.example`.
- AI hiện dùng `LLM_PROVIDER=gemini`, `LLM_MODEL=gemini-2.5-flash`, `GEMINI_API_KEY`, `LLM_MODEL_CONTEXT_TOKENS=1048576`. REST Gemini, JSON Schema, đếm token và kiểm chứng nguồn; API key chỉ ở BE. Nguồn liên quan được gửi tới nhà cung cấp. Nhánh OpenAI vẫn có thể cấu hình riêng, không có fallback tự động. Xem [cấu hình Gemini](docs/GEMINI_API.md).
- Bộ29 câu có thể cần tăng `LLM_MAX_OUTPUT_TOKENS` tới8000–16000, `LLM_TIMEOUT_MS` tới120000 trong giới hạn model. Kết quả bị cắt/sai cấu trúc báo lỗi, không lưu bộ thiếu hoặc giả thành công.
- Google cần `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY` theo validation cấu hình và `GOOGLE_REDIRECT_URI=http://localhost:4000/api/v1/ket-noi/google/callback`. URI phải trùng tuyệt đối Google Cloud. Bật Calendar API, cấu hình consent/test users, kết nối qua giao diện; không tự điền refresh token trong env.

## Schema và storage

`database/schema.sql` chỉ bootstrap DB mới. `npm run db:create` từ chối DB đã tồn tại, không DROP/reset. Hợp đồng `database/schema-contract/model.json`; `npm run db:erd` xuất ERD DB thật ra `docs/ERD_CURRENT.md`.

DB lưu nghiệp vụ tiếng Việt: học sinh, hoạt động, sẵn sàng, trắc nghiệm… REST DTO giữ mã hiện hành student/ready/quiz để FE tương thích; ánh xạ tại biên DB. Tên model thật, hash, ID Google, khóa chỉ mục, nội dung nguồn/người dùng giữ nguyên.

Metadata xử lý ở TAI_LIEU.cau_hinh_xu_ly; đoạn/vị trí trang ở DOAN_TAI_LIEU; model/vị trí FAISS ở BIEU_DIEN_NOI_DUNG. Phạm vi/ngữ cảnh hỏi đáp có bảng riêng. Cấu hình bộ học ở cau_hinh_tao; phạm vi trang/request ID/revision Google của lịch ở dieu_kien_hoc.

Storage mới cô lập dưới storage/erd16, storage/erd16-security, storage/erd16-upload-spool; không tự nạp dữ liệu ERD cũ. Bảo toàn MySQL, private storage và Cloudinary khi sao lưu. Thu hồi phiên/audit ở private filesystem vì ERD không có bảng tương ứng: hỗ trợ một API instance hoặc filesystem riêng tư dùng chung. Nhắc nội bộ khi mở app; Google chỉ nhắc buổi đã đồng bộ. Không có email/outbox hay tự gửi toàn bộ lịch.

## Kiểm tra sau thay đổi

Tối ưu truy hồi không thay đổi schema database: cache FAISS đầy đủ/phạm vi trong RAM (tối đa 8 mục, ngân sách dữ liệu index khoảng 16 MiB), vẫn đọc và kiểm tra SHA-256 của file mỗi lần tìm, và vẫn xác nhận phạm vi từ MySQL. Kiểm tra nguồn trước khi lưu được gom thành một truy vấn thay vì hai truy vấn cho mỗi đoạn. Log `rag/retrieved` có `searchMs` (gọi Python) và `elapsedMs` (toàn bước truy hồi) để phân biệt thời gian truy hồi với sinh câu trả lời/tạo ảnh công thức. Khởi động lại backend để áp dụng cache Python.

Đo local trên tài liệu hiện tại: kiểm tra 20 đoạn từ 40 truy vấn/17,06 ms xuống 1 truy vấn/0,68 ms (trung vị 5 lần). Benchmark FAISS 31 vector, cùng vector câu hỏi, 100 lần: toàn phạm vi 0,791 → 0,693 ms; một phần phạm vi 0,781 → 0,701 ms. Đây là số đo từng bước, không phải tốc độ toàn bộ hỏi đáp, không gồm embedding/LLM/tạo ảnh. Script và kết quả chẩn đoán tại `BE/.cache/benchmark-retrieval.py`, `BE/.cache/benchmark-source-validation.mjs` (file local bị Git bỏ qua).

Hỏi đáp ưu tiên trích nguyên văn với câu hỏi tra cứu đơn giản (công thức, định nghĩa) khi đoạn truy hồi khớp đủ từ chủ đề; công thức phải có dấu quan hệ trong nguồn. Nhánh này không gọi LLM để sinh hoặc kiểm chứng, trả nhãn `document-extractive` và trạng thái kiểm chứng `chưa kiểm chứng` theo ENUM của database; người dùng cần đối chiếu trang nguồn. Câu hỏi giải thích, so sánh, tổng hợp hoặc chưa khớp đoạn rõ vẫn dùng LLM và kiểm chứng như trước; hết hạn mức vẫn có thể lỗi ở nhánh này. Đây là quy tắc chọn đoạn, không phải kiểm chứng ngữ nghĩa bằng AI.

RAG giữ tối đa 128 vector câu hỏi gần nhất trong RAM của tiến trình, vẫn kiểm tra phạm vi và tính toàn vẹn index mỗi lần tìm. Khi toàn bộ vector nằm trong phạm vi DB cho phép, tìm trực tiếp trên index thay vì dựng lại bản sao. Không đổi model embedding hoặc dữ liệu chỉ mục; khởi động lại BE/RAG để áp dụng.

```powershell
npm run lint
npm run verify:database
```

Trong FE chạy `npm run lint` và `npm run build`. Theo yêu cầu ngày26/10/2026, bộ file kiểm thử tự động schema version 16 và lệnh old version-specific test command đã được xóa. Kiểm tra database chỉ xác nhận schema, không thay thế kiểm tra các luồng PDF, hỏi đáp, học tập và Google thực tế. Tùy chọn `--kiem-tra-du-lieu` của verify:database vẫn là công cụ chẩn đoán DB, ghi trong transaction rồi rollback.

24/10/2026: lint BE/FE, build FE, HTTP/MySQL, PDF/Cloudinary/E5/FAISS, ảnh công thức, Edge desktop/mobile đạt. **OpenAI thật trả429 hết hạn mức; hỏi đáp/quiz AI thật chưa đạt smoke test. Google thật chưa kiểm thử OAuth/event.** Adapter kiểm soát không thay thế nhà cung cấp thật. Build có cảnh báo bundle chính >500KB.

26/10/2026: đã gỡ nhánh tương thích schema cũ; cấu hình chỉ chấp nhận schema version 16. Bộ kiểm thử schema version 16 đã được xóa theo yêu cầu tiếp theo. Không xóa dữ liệu DB/private storage trong đợt dọn mã nguồn.

Chi tiết: [kiểm tra và dọn mã nguồn](../docs/DATABASE_SCHEMA_REVIEW.md), [API](../docs/API_REFERENCE.md), [ERD database thực tế](../docs/ERD_CURRENT.md).
