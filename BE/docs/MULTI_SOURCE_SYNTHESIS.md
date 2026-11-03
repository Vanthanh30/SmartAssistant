# Tổng hợp câu trả lời từ nhiều PDF và nhiều trang

Luồng hỏi đáp dùng Gemini để tổng hợp các đoạn liên quan, gộp ý trùng và giữ ý bổ sung. Trích dẫn chỉ được thêm khi bước kiểm chứng độc lập xác nhận bằng chứng thực sự hỗ trợ câu trả lời.

Các thay đổi:

- Phân bổ ngữ cảnh luân phiên giữa các PDF; ưu tiên đoạn định nghĩa trực tiếp khi câu hỏi yêu cầu khái niệm. Khi cắt theo ngân sách token, giữ nguyên nhóm đoạn liên tiếp và tính ưu tiên theo đoạn đầu nhóm, tránh xóa cả nhóm quan trọng vì phần tiếp nối nằm cuối danh sách.
- Nhiều đoạn liên quan của cùng PDF cũng đi qua tổng hợp API, thay vì chọn một đoạn trích cục bộ. Giữ ngoại lệ cho phép đếm danh sách đầy đủ đã có sẵn.
- API kiểm chứng chọn mã đoạn văn; backend ánh xạ về nguyên văn nguồn. Mã không tồn tại, thuộc chunk khác hoặc ngoài phạm vi đều bị từ chối.
- Đoạn định nghĩa rõ ở PDF khác được đưa riêng vào bước đối chiếu. Chỉ gắn thêm khi API xác nhận nó hỗ trợ một khẳng định trong câu trả lời.
- API kiểm chứng báo ý quan trọng bị bỏ sót; hệ thống yêu cầu tổng hợp bổ sung tối đa một lần. Nếu vẫn thiếu, không đánh dấu câu trả lời là hoàn chỉnh.
- Ngân sách kiểm chứng có phần dự phòng cố định 2.048 token cho câu trả lời và mã bằng chứng, vẫn bị chặn bởi giới hạn context của model. Không gửi toàn bộ thư viện, không thay đổi schema hay dữ liệu tài liệu.

Kiểm tra chỉ đọc với dữ liệu thật môn 24, câu “từ trường”: truy hồi 20 đoạn, API trả câu tổng hợp và kiểm chứng đạt; nguồn gồm chunk 100 và 101 của PDF 22 và chunk 85 của PDF 21. Thời gian một lượt khoảng 4,4 giây. Không ghi hội thoại hoặc sửa PDF/chỉ mục trong phép kiểm tra này.

Giới hạn: tổng hợp trong những đoạn đã truy hồi và giữ lại theo ngân sách, không cam kết bao phủ mọi trang của mọi PDF. Nguồn không liên quan không được gắn chỉ để đủ số tài liệu đã chọn.
