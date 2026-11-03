# Lượt 4 – Tối ưu có đo lường

Đã xử lý hai điểm có chi phí tăng theo dữ liệu, không thay schema/index/database, API, model/provider hoặc thuật toán RAG. Không thêm dependency và không gọi dịch vụ/DB thật.

| Điểm đo | Trước | Sau |
| --- | --- | --- |
| Mở transcript 50 lượt, không có cursor | 52 truy vấn (ownership + transcript + 50 truy vấn citation) | 3 truy vấn (ownership + transcript + một lô citation) |
| Đọc 20 dòng audit cuối từ fixture 12 MB | 12.000.000 byte | 65.536 byte |

Đo bằng `node scripts/benchmark-backend.js`: fixture DB giả lập round trip 2 ms. Lần chạy tham chiếu: transcript 799,54 → 49,72 ms; audit 63,54 → 4,71 ms. Đây là số đo trên máy cục bộ, chịu ảnh hưởng lịch timer/OS, không phải cam kết latency production hay kết quả EXPLAIN. Số truy vấn và byte đọc là các chỉ số ổn định hơn. Benchmark giữ reference của mẫu đọc N+1 cũ, kiểm tra tổng số citation; test riêng kiểm tra DTO/thứ tự nguồn.

## Thay đổi

- `modules/conversations/repository.js`: thêm `citationsForTurns` dùng placeholders cho các ID trong trang đang hiển thị.
- `modules/conversations/service.js`: kiểm tra ownership/cursor như cũ, lấy transcript rồi đọc citation theo lô. Giữ thứ tự message, thứ tự citation trong từng lượt, sourceDeleted và cursor. Không đọc nguồn của lượt thừa dùng để kiểm tra hasOlderMessages; trang rỗng không phát sinh query nguồn. Luồng ask/replay vẫn dùng query citation đơn như trước. Không cache nguồn hoặc quyền giữa các request.
- `modules/admin/auditTail.js`: đọc ngược từng khối 64 KB, loại dòng đầu chưa đầy đủ trước khi decode kết quả; giữ UTF-8 và quy tắc bỏ dòng rỗng. Đọc thêm khi chưa có đủ 20 dòng. Dòng rất dài hoặc file có nhiều dòng rỗng vẫn có thể cần đọc nhiều khối; không cắt ngắn bản ghi làm đổi dữ liệu.
- `modules/admin/auditRepository.js`: dùng tail reader, giữ ENOENT, mapping, thứ tự, vị trí index, cách xử lý JSON lỗi và response cũ. File handle luôn được đóng khi thành công hoặc lỗi. Không thêm cache nên dashboard thấy dữ liệu mới ở lần đọc tiếp theo.
- `tests/modules/performance.test.js`: kiểm tra 51 lượt với phân trang, 50 lượt hiển thị, ownership, nguồn đã xóa, thứ tự; audit rỗng, Unicode, không có newline cuối, dòng dài và giới hạn byte đọc.
- `scripts/benchmark-backend.js`, fixture helper và phạm vi format được bổ sung.

## Kiểm thử và giới hạn

`npm test`: 67/67 test JavaScript đạt, gồm các test API/LLM/retrieval và hai regression test mới. Lint/format chạy trên source sau thay đổi. Không chạy load test production, EXPLAIN hoặc benchmark dữ liệu thật vì lượt này dùng fixture để tránh tác động dữ liệu và dịch vụ bên ngoài.

Batch citation là một statement đọc thay cho nhiều statement; cập nhật nguồn đồng thời có thể được quan sát nhất quán hơn trong cùng lô. Không bổ sung transaction/snapshot hoặc thay đổi chính sách phân quyền. Audit được đọc theo kích thước tại thời điểm mở; không đưa ra bảo đảm snapshot khi một tiến trình khác sửa/truncate file trong lúc đọc, tương tự việc đọc file trước đây.

Các vấn đề khác được giữ riêng: N+1 nguồn bài ôn tập, Courses xác thực hai lần, chính sách 429, SyntaxError/400, mã lỗi upload và cleanup lock. Chưa đổi các nhánh này vì cần đánh giá semantics và đo riêng; không coi lượt 4 là đã tối ưu toàn bộ hệ thống. Lượt 5 dành cho regression/end-to-end rộng hơn với môi trường tích hợp phù hợp.
