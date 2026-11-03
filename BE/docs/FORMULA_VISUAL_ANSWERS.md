# Trả lời từ ảnh công thức

Ảnh crop hỗ trợ câu trả lời; không thay lời giải bằng thông báo kỹ thuật.

- Khi câu hỏi công thức có một vùng nguồn bị hỏng ký hiệu rõ ràng, bỏ lượt sinh từ văn bản lỗi và chuyển thẳng sang ảnh crop.
- Đọc tối đa ba ảnh bằng model/API key đã cấu hình, cùng câu hỏi và ngữ cảnh nguồn trong đúng phạm vi đã được kiểm tra quyền.
- Sinh lời giải bằng lời. Không chép lại công thức thành LaTeX hoặc tự sửa công thức của tài liệu; giữ ảnh gốc để hiển thị phân số/chỉ số chính xác.
- Kiểm chứng độc lập lời giải với ảnh và ngữ cảnh. Chỉ chuyển sang trạng thái trả lời/kiểm chứng đạt khi có kết quả hợp lệ và đúng mã ảnh nguồn.
- Lưu cache kết quả đã kiểm chứng theo câu hỏi, model, hash ảnh, vị trí ảnh và ngữ cảnh nguồn. Không lưu ảnh base64 vào lượt chat.
- Lỗi API, ảnh không rõ hoặc kiểm chứng không đạt không được biến thành một đáp án tự suy đoán.

Tích hợp Gemini sử dụng các phần văn bản và ảnh inline thay vì stringify ảnh thành chuỗi JSON. Tham khảo [tài liệu ảnh của Google](https://ai.google.dev/gemini-api/docs/image-understanding).

Kiểm tra thật bằng API hiện tại với ảnh số mol trang 7: lời giải nêu cách tính theo khối lượng hoặc số phân tử và qua bước kiểm chứng ảnh. Các lượt kiểm tra này không ghi DB và không thay đổi PDF/chỉ mục. Kiểm tra tự động bao gồm từ chối ảnh URL bên ngoài, kiểm chứng thất bại không được cache, mã ảnh không tồn tại bị từ chối, cache chỉ tái sử dụng kết quả đã kiểm chứng và service lưu lời giải trước ảnh nguồn.
