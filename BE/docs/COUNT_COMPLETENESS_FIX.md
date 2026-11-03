# Sửa câu trả lời đếm/phân loại bị thiếu nội dung

Ngày: 27/10/2026.

## Nguyên nhân đã đối chiếu

- Câu trả lời đếm trước đây tìm thấy tiêu đề “Ba loại ARN chủ yếu” rồi trả ngay, không đọc danh sách bên dưới.
- Trong PDF 18 thuộc môn 25, mARN và tARN ở chunk 55 (thứ tự 7); rARN và ghi chú về ARN khác ở chunk 56 (thứ tự 8). Kết thúc chunk 55 là dấu chấm nên không thể chỉ dựa dấu câu để kết luận danh sách đã đủ.
- Lượt hỏi 53 thực tế là “có bao nhiêu **lại** ARN”. “Lại” không phải từ chỉ phân loại; gate giữ nó trong chủ đề nên từ chối. Đây là lỗi gõ khác với câu “có bao nhiêu loại ARN” viết đúng.

## Thay đổi

1. Sửa hẹp “lại” thành “loại” trong mẫu hỏi số loại ở đầu câu hoặc sau “có bao nhiêu/mấy”; không thay từ “lại” trong văn xuôi hay câu hỏi yêu cầu giải thích lại.
2. Planner, gate và nhánh trả lời dùng cùng cách chuẩn hóa; không đổi ADN thành ARN hoặc bỏ điều kiện như “ở người”.
3. Nhánh trích xuất số lượng lấy cả mục phân loại và mô tả từng loại. Ghép tối đa hai chunk kế tiếp có sẵn trong kết quả truy hồi, cùng PDF và đúng thứ tự; bỏ overlap, không nhảy qua chunk thiếu hoặc nguồn khác.
4. Dừng ở câu hỏi/mục không liên quan; cho phép giữ mục “loại khác” có tên đúng chủ thể để không biến “ba loại chủ yếu” thành khẳng định “chỉ có ba loại”.
5. Chỉ đánh dấu đầy đủ khi số mục liệt kê phù hợp con số nêu rõ trong tài liệu. Nếu chỉ có tiêu đề hoặc thiếu phần danh sách, trả phần có căn cứ kèm thông báo thiếu thay vì coi là đáp án hoàn chỉnh.
6. Giữ trích dẫn nguyên văn riêng theo từng chunk và thứ tự nguồn theo nội dung trả lời.

File thêm: src/modules/conversations/countAnswer.js.

File sửa: src/modules/conversations/{localAnswer,queryTerms,topicEvidence,aiService}.js; src/rag/questionPlan.js; tests/modules/topic-count.test.js; scripts/format-foundation.js.

## Kết quả kiểm tra

- 76/76 Node tests qua; lint và format:check qua.
- Replay đọc dữ liệu thật và gọi RAG/FAISS hiện có cho ba câu: “ARN có bao nhiêu loại”, “có bao nhiêu loại ARN”, “có bao nhiêu lại ARN”.
- Cả ba trả status answered, model document-extractive, cùng danh sách mARN/tARN/rARN, mô tả chức năng và ghi chú miRNA/siRNA/snRNA từ tài liệu; evidence lấy ở chunk 55 và 56.
- Replay dùng caller Gemini bị chặn chủ ý trong test: 0 lượt gọi Gemini. Không ghi database, tạo account, thay chunk, PDF hoặc FAISS.
- Test phủ việc thiếu chunk, khác PDF, ranh giới mục không liên quan, giữ điều kiện câu hỏi và không suy số loại ARN từ bốn loại base.

Đây là sửa nhánh đếm/phân loại có bằng chứng rõ, không phải bảo đảm mọi câu hỏi phức tạp đều trả đủ. Backend chạy bằng launcher hiện tại không tự reload: cần Ctrl+C trong terminal BE rồi npm run dev, sau đó gửi một lượt hỏi mới. Không tự khởi động thêm backend ngầm; tin nhắn lịch sử cũ không được sửa.
