# Chẩn đoán lỗi tóm tắt ngày 27/10/2026

## Bằng chứng thực tế

- API đang nghe cổng 4000 trước sửa là process khởi động 15:58, trong khi service hiện tại đã được cập nhật đến 17:50. Launcher hiện tại không tự reload source; giao diện mới có thể nói chuyện với backend cũ.
- Lượt hỏi 51 trong hội thoại 25 lúc 17:52:46 đã dùng gemini-2.5-flash và bị đánh giá không đạt; trả lời không đủ ngữ cảnh lúc 17:53:04. Đây không phải thông báo lỗi xác thực API key.
- PDF 18 của môn 25 đang sẵn sàng, có 17 trang, 12 chunk, 15.761 ký tự văn bản; trường tóm tắt chưa có dữ liệu.
- Sau khi người dùng đồng ý gọi Gemini thật, chạy đúng một workflow kiểm thử có giới hạn 16 thao tác, trên chính PDF đó. Generation đầu và kiểm chứng phần đầu thành công; lần generation tiếp theo bị adapter phân loại LLM_QUOTA_EXCEEDED. Tổng 3 lần thử generation và 3 countTokens, khoảng 6,4 giây; dừng ngay, không tự lặp thêm.
- Không có bản tóm tắt hoàn chỉnh được lưu từ lượt kiểm thử bị quota chặn. Không reset tài liệu, chunk hay index.

## Sửa code

1. Verifier cuối của luồng nhiều phần dùng các chunk gốc, thay vì chỉ những quote đại diện 8–160 ký tự. Cách cũ có thể từ chối một khẳng định đúng nhưng không nằm trong các quote ngắn đã chọn.
2. Nếu toàn bộ chunk vượt context, chỉ fallback theo ngân sách sang các phần con đã được kiểm chứng với nguồn gốc. Không dùng fallback để đảo một kết quả supported=false thành true.
3. Quote cuối phải nằm nguyên văn trong nguồn tương ứng; có tối đa một lần sửa evidence sai. Kết quả vẫn bị từ chối nếu thiếu căn cứ hoặc quote/ID không hợp lệ.
4. Trong runtime, thử tóm tắt trực tiếp toàn tài liệu nếu prompt vừa ngân sách. Khi một map duy nhất đã qua verifier độc lập với toàn bộ nguồn, không gọi thêm verifier trùng lặp. Bình thường nhánh này dùng 2 generation; sửa evidence hoặc context splitting có thể làm tăng số lượt. Tài liệu quá lớn tiếp tục đi qua chia phần/hợp nhất có kiểm soát.
5. Log chẩn đoán chỉ ghi scope, số nguồn/quote và các cờ supported/complete/evidenceValid, không ghi API key, nội dung tài liệu hoặc câu trả lời.
6. Stage log của yêu cầu tóm tắt được ghi là summary, không nhầm retrieval.

Files: src/modules/conversations/{summaryService,aiService,service}.js; tests/modules/{summary-verification,summary,summary-persistence}.test.js; scripts/{verify-summary-live,format-foundation}.js.

## Kiểm tra và runtime

- 73/73 kiểm thử Node qua, gồm các ca mới kiểm chứng bằng full source, quote đúng ngoài mẫu quote ban đầu, chặn verdict không đạt, sửa evidence có giới hạn, fallback context và nhánh trực tiếp 2 thao tác.
- Lint và format:check qua. Không đổi frontend, schema, model hay embedding trong lượt sửa này.
- Đã khởi động lại launcher/API/worker/RAG để nạp source mới; API health/ready trả ok. Log lần nạp cuối tại storage/diagnostics/backend-20261027-181032.log và file .error.log tương ứng.
- Lượt gọi API thật đã được thực hiện trước khi bổ sung nhánh trực tiếp, và bị quota chặn như mô tả. Không gọi lại Gemini sau đó; không tuyên bố nhánh mới đã tóm tắt thành công tài liệu thật.

## Việc còn chặn

Hạn mức Gemini của dự án cần còn khả dụng trước khi tạo lại bản tóm tắt. Theo [tài liệu rate limits của Google](https://ai.google.dev/gemini-api/docs/rate-limits), hạn mức áp dụng theo project, không theo API key; đổi key trong cùng project không tạo quota riêng. Kiểm tra model/project đang dùng trong AI Studio và chờ quota phục hồi hoặc điều chỉnh hạn mức theo tài khoản.

Sau khi quota khả dụng, bấm Tạo lại tóm tắt để gửi yêu cầu mới. Tin nhắn lỗi cũ không tự biến thành kết quả thành công. Không sửa secret .env và không chuyển model tự động.

## Lệnh kiểm thử live có chủ ý

```powershell
cd BE
node scripts/verify-summary-live.js --conversation=25 --document=18 --allow-paid
```

Lệnh này chỉ dành cho môi trường development/local, gửi nội dung PDF đến Gemini, có thể tính phí và chỉ lưu kết quả đã kiểm chứng vào trường hiện có. Nó không đăng nhập thay người dùng trên HTTP hoặc tạo account/token/session mới; kiểm thử gọi service nội bộ với phạm vi conversation/document rõ ràng. Không tự chạy trong npm test, không lặp lại khi hết quota.
