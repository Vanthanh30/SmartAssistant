# Gemini API — 27/10/2026

Backend hỗ trợ Gemini bằng REST trực tiếp, không thêm SDK hoặc dependency. Cấu hình chạy hiện tại được chuyển sang Gemini; không có fallback tự động sang OpenAI khi Gemini lỗi.

```dotenv
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.5-flash
GEMINI_API_KEY=your_actual_key
LLM_MODEL_CONTEXT_TOKENS=1048576
```

Giữ key trong `BE/.env`, không đặt ở FE hoặc biến `VITE_*`. Key OpenAI và Gemini khác nhau; không đổi tên một key OpenAI thành Gemini. Adapter Gemini chỉ đọc `GEMINI_API_KEY`. Dự án vẫn hỗ trợ nhánh `openai` nếu cấu hình chủ động; nhánh đó chỉ dùng `OPENAI_API_KEY`.

`GEMINI_THINKING_BUDGET` là tùy chọn cho Gemini 2.5 Flash/Flash-Lite: để trống giữ mặc định model, `0` tắt thinking, `-1` dynamic. Không áp dụng tham số này tự động cho model khác. Cấu hình local hiện tại giữ mặc định thinking của model. Context window không phải ngân sách nguồn: `LLM_CONTEXT_BUDGET_TOKENS` và `LLM_MAX_OUTPUT_TOKENS` vẫn giới hạn prompt/output như trước.

Các bước rewrite, sinh câu trả lời, kiểm chứng, Quiz và Flashcard tiếp tục dùng hợp đồng nội bộ hiện có. Adapter chuyển sang `countTokens`/`generateContent`, truyền system instructions và JSON Schema, rồi chuẩn hóa output. Token counting gửi cùng `generateContentRequest`, gồm system/schema. Chỉ chấp nhận kết quả hoàn thành `STOP`; nội dung bị cắt, safety block, sai JSON hoặc sai trích dẫn vẫn bị từ chối. Không hiển thị thought parts. Không tự retry generation sau network error, timeout hoặc5xx; chỉ retry một lần khi server từ chối rate limit rõ ràng. Lỗi không chứa API key hoặc nguyên văn response nhà cung cấp.

Không thay đổi schema MySQL, embedding/FAISS hoặc dữ liệu PDF/chunk. Nhánh trả lời trích xuất local vẫn không gọi LLM. Nâng cấp coverage/phân loại câu hỏi thuộc lượt3 không được gộp vào thay đổi provider này.

Kiểm tra:

```powershell
npm run test:llm
npm run test:retrieval
npm run lint
```

Đã kiểm tra API thật với key sẵn có: metadata model (input1.048.576/output65.536), token count, JSON structured output, hỏi đáp trên nguồn tổng hợp với kiểm chứng `đạt`, Flashcard1 câu có evidence. Không lưu kết quả kiểm tra vào database và không gửi PDF riêng tư trong smoke test. Test mock bổ sung kiểm tra Quiz/Flashcard, schema nullable, lỗi key/model/quota, output bị cắt, citation sai và retry giới hạn. Đây là kiểm tra kết nối/tương thích, không phải đánh giá độ chính xác tổng thể.

Sau khi dừng backend đang chạy bằng Ctrl+C, dùng `npm run dev` để nạp cấu hình/adapter mới. Google Calendar OAuth tiếp tục dùng các biến `GOOGLE_CLIENT_*` hiện có; không dùng Gemini key cho OAuth.

Tài liệu đối chiếu:

- https://ai.google.dev/api/generate-content
- https://ai.google.dev/api/tokens
- https://ai.google.dev/gemini-api/docs/generate-content/structured-output
- https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash
