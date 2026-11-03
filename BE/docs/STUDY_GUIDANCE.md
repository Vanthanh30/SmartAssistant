# Hướng dẫn ôn tập theo tài liệu

Các yêu cầu như “các kiến thức trọng tâm 12 cần nắm nên tập trung vào phần nào” được xử lý như yêu cầu hướng dẫn học, không phải tìm đáp án nguyên văn.

Luồng:

1. Nhận diện yêu cầu chọn phần cần ôn, lập kế hoạch/lộ trình hoặc gợi ý cách học. Các câu định nghĩa, câu hỏi dữ kiện thông thường giữ luồng hỏi đáp cũ.
2. Khảo sát các chunk của những PDF sẵn sàng trong phạm vi người dùng đã chọn, vẫn kiểm tra chủ sở hữu, môn học, tài liệu chưa xóa. Không phụ thuộc điểm tương đồng với các từ “trọng tâm”, “nên học”. Giới hạn 128 chunk như luồng tổng hợp; không xử lý ngoài phạm vi được cấp quyền.
3. Tạo khảo sát rút gọn, ưu tiên tiêu đề và các đoạn hoàn chỉnh với tổng ngân sách văn bản khoảng 7.000 ký tự. Gọi Gemini để nhận diện chủ đề thực có trong nguồn và đề xuất phương pháp ôn tập, tối đa 6 nhóm và 4 gợi ý.
4. Kiểm tra chunk IDs, rồi gọi API kiểm chứng độc lập. Kiến thức mô tả phải được nguồn chứng minh; gợi ý phương pháp không cần xuất hiện nguyên văn nhưng không được thêm nội dung chuyên môn hoặc khẳng định trọng tâm thi chính thức.
5. Câu trả lời phân biệt “Các chủ đề tìm thấy trong tài liệu đã chọn” và “Gợi ý ôn tập của AI”, nêu giới hạn khảo sát, hỏi mục tiêu để người dùng điều chỉnh tiếp. Nếu không phù hợp hoặc chưa xác minh được, hỏi làm rõ; không tự chuyển sang kiến thức chung.

Kiểm tra chỉ đọc với môn 24, PDF 21 và 22, câu hỏi trong ảnh: trả lời thành công, kiểm chứng đạt, khoảng 6,8 giây. Kết quả xác định các nhóm vật lí nhiệt, chất khí, từ trường/cảm ứng điện từ và hạt nhân/phóng xạ, sau đó đưa gợi ý ôn tập. Không ghi hội thoại hoặc sửa tài liệu trong phép thử.

Giới hạn: đây là hướng dẫn theo khảo sát tài liệu, không phải đánh giá trọng tâm đề thi hay xác nhận đầy đủ chương trình lớp 12. Chưa dùng điểm yếu cá nhân hoặc lịch học để cá nhân hóa tự động; người dùng cung cấp mục tiêu/thời gian trong hội thoại để trao đổi tiếp.
