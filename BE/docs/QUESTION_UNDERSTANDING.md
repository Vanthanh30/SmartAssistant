# Hiểu câu hỏi trước khi trả lời PDF

Luồng hiện tại giữ nguyên câu hỏi gốc và phạm vi tài liệu của người dùng. Câu hỏi dùng để truy hồi được lưu riêng trong `cau_hoi_truy_hoi`.

1. Chuẩn hóa những cụm hỏi phổ biến như `la j`, `khai niem`, `cong thuc`; không thay số liệu hoặc mã định danh.
2. Giải quyết tham chiếu bằng lịch sử hội thoại. Chỉ dùng chủ thể trước đó nếu xác định được duy nhất một chủ thể. Câu thiếu chủ thể như “công thức” cần hỏi lại khi chưa có ngữ cảnh rõ.
3. Truy hồi trong đúng tài liệu đã chọn. Từ vựng sửa lỗi được lấy từ các đoạn nguồn vừa truy hồi, không từ một kho kiến thức trả lời theo môn học.
4. Chỉ sửa lỗi một ký tự hoặc đảo hai ký tự liền nhau ở từ dài khi có duy nhất một ứng viên trong nguồn; tối đa hai sửa đổi. Không sửa mờ từ ngắn, mã viết hoa, số liệu hoặc biểu thức tính toán.
5. Mở rộng viết tắt từ định nghĩa `Tên đầy đủ (MÃ)` trong nguồn. Một số viết tắt thao tác như `ct` chỉ mở rộng khi cách hiểu có mặt trong nguồn; nếu vừa có “công thức” vừa có “cấu tạo” thì hỏi lại. Không cam kết hiểu mọi viết tắt.
6. Nếu sửa câu hỏi, truy hồi lại tối đa một lần trong nguyên phạm vi. Hiển thị “Mình hiểu câu hỏi là…” để người dùng biết hệ thống đã sửa gì.
7. Đoạn có điểm tương đồng ngữ nghĩa đo được từ 0,75 trở lên và khớp phần truy hồi có thể được chuyển đến Gemini dù không trùng toàn bộ từ khóa. Nhánh này luôn qua sinh đáp án và kiểm chứng độc lập; điểm tương đồng không được coi là bằng chứng.
8. Giữ nguyên kiểm tra trích dẫn, nội dung nguồn, quyền sở hữu và thay đổi nguồn trước khi lưu.

## Giới hạn cần phân biệt

Không truy hồi được bằng chứng không đồng nghĩa tài liệu không có nội dung. Thông báo mặc định đã bỏ khẳng định tuyệt đối “tài liệu không đề cập”.

Các bước trên cải thiện hiểu câu hỏi và tránh loại nhầm đoạn liên quan. Chúng không phục hồi được bảng bị trộn cột, phân số mất cấu trúc hoặc PDF scan không có chữ. Các trường hợp đó cần đọc ảnh/OCR và đối chiếu hình học với trang gốc. Luồng ảnh công thức và liên kết trang nguồn hiện có vẫn được giữ; chưa tuyên bố đọc đúng mọi bảng hoặc mọi PDF.

## Kiểm chứng

- Kiểm tra tự động: câu không dấu, viết tắt mơ hồ/rõ nghĩa, lỗi tên riêng, không đổi ADN thành ARN, không đổi số và công thức, tham chiếu có/không có một chủ thể, nhánh ngữ nghĩa phải qua kiểm chứng.
- Kiểm tra service: lưu nguyên câu gốc; truy hồi lại đúng một lần với cùng owner/course/documentIds; không gọi sinh đáp án khi cần hỏi rõ.
- Kiểm tra chỉ đọc trên tài liệu hiện có của môn 24: `định luật newtoon la j` được chuẩn hóa thành `định luật Newton là gì` từ từ vựng nguồn. Không gọi Gemini, không ghi DB hoặc tạo lại chỉ mục trong lượt kiểm tra này.
