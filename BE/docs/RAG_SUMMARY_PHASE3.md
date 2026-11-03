# Lượt 3 — Tóm tắt tài liệu bằng Gemini

Ngày: 27/10/2026. Đã triển khai trên source; chưa gọi Gemini thật hoặc ghi thử vào database người dùng.

Cập nhật sau lượt 4: đã kiểm thử live theo xác nhận riêng của người dùng, phát hiện quota Gemini và sửa nhánh kiểm chứng/ngân sách. Xem [báo cáo chẩn đoán](SUMMARY_FAILURE_20261027.md); các số liệu kiểm thử và số API call bên dưới là ghi nhận tại thời điểm lượt 3.

## Báo cáo thay đổi

| Hạng mục | Hiện trạng trước lượt 3 | Vấn đề | Đề xuất / thay đổi đã thực hiện | File liên quan | Mức ưu tiên |
|---|---|---|---|---|---|
| Tóm tắt qua chat | Đã nhận diện yêu cầu và gọi Gemini | Chưa lưu kết quả; yêu cầu lặp gọi lại model | Nối luồng hỏi đáp với dịch vụ tóm tắt có lưu/cache | conversations/service.js; documents/summaryService.js | P0 |
| Lưu kết quả | Có cột noi_dung_tom_tat LONGTEXT nhưng chưa sử dụng | Không tái sử dụng qua hội thoại hoặc lần khởi động | Lưu JSON chứa nội dung, evidence, model, revision, fingerprint và thời điểm trong chính cột hiện có | documents/summaryRepository.js | P0 |
| Tính hợp lệ bản lưu | Không có kiểm tra phiên bản | PDF/chunk thay đổi có thể khiến bản cũ không còn đúng | Fingerprint gồm model/provider, hash PDF, dữ liệu extraction, nội dung/thứ tự/vị trí của toàn bộ chunk và revision pipeline | documents/summaryService.js | P0 |
| Tóm tắt tài liệu dài | Map theo nhóm, nhưng ghép mọi phần vào một prompt | Vượt context hoặc giới hạn evidence khi quá nhiều phần | Hợp nhất theo cây tối đa 4 phần mỗi nhóm; chia tiếp khi bị từ chối ngân sách context; không cắt top-k để giả làm toàn tài liệu | conversations/summaryService.js | P0 |
| Bao phủ và căn cứ | Verifier cuối chủ yếu đọc các quote đã chọn | Không nhận ra chủ đề đã bị bỏ trước khi chọn quote | Verifier từng map đọc toàn bộ phần nguồn; verifier mỗi merge kiểm tra mọi bản con; cuối cùng kiểm tra quote nguyên văn và căn cứ | conversations/summaryService.js | P0 |
| Tạo lại | Chưa có lối đi riêng | Có thể ghi đè bản tốt bằng lỗi | Nhận diện tóm tắt lại / tạo lại bản tóm tắt; chỉ ghi sau khi đạt kiểm chứng và nguồn vẫn khớp | summaryIntent.js; documents/summaryService.js | P0 |
| Đồng thời | Khóa theo hội thoại không chặn hai hội thoại cùng tóm tắt một PDF | Tốn Gemini trùng lặp | MySQL GET_LOCK theo PDF, không chờ; yêu cầu trùng nhận SUMMARY_IN_PROGRESS | documents/summaryRepository.js | P0 |
| Nhiều PDF | Có phạm vi PDF từ lượt 2 | Cần tránh trộn bản lưu hoặc nguồn | Tóm tắt/lưu riêng từng PDF và hiển thị từng phần có tên nguồn; không tự hợp nhất kiến thức mâu thuẫn giữa các PDF | documents/summaryService.js | P0 |
| Văn bản thiếu | Không thông báo rõ trang chưa có văn bản | Dễ hiểu nhầm đã phân tích cả ảnh/scan/bảng | Đối chiếu trang có chunk và extraction; thêm giới hạn và trang chưa có văn bản | documents/summaryService.js | P1 |
| UI | Có chat và chọn scope nhưng chưa có thao tác tóm tắt | Người dùng phải tự gõ câu lệnh | Hai nút Tóm tắt PDF và Tạo lại tóm tắt, dùng scope đã chọn, giữ bản nháp; loading/error/citation qua chat hiện có | FE ChatPanel.jsx | P1 |
| Hiệu năng/chi phí | Có timeout từng Gemini request | Tổng job nhiều phần chưa có giới hạn chung | Tối đa 150 giây toàn job, 96 thao tác structured chung các PDF; preflight job quá lớn; token counting giữ nguyên | aiService.js; các summaryService.js | P1 |

Schema thực tế được kiểm tra trước khi thêm truy vấn bằng `npm run verify:database`: 16 bảng, 124 cột, 21 FK; không có chế độ ghi. Không thêm bảng/cột/migration, không đổi endpoint, request schema, response DTO hoặc ENUM. Không sửa .env, model, thư viện, extraction, chunking, embedding, vector hoặc FAISS.

## Cách dùng

1. Khởi động lại BE để nạp code mới, tải lại FE.
2. Trong môn học, chọn Tất cả PDF sẵn sàng hoặc các PDF cụ thể tại Nguồn hỏi đáp.
3. Bấm **Tóm tắt PDF**. Nội dung và trích dẫn xuất hiện trong chat; bản lưu còn hợp lệ được dùng lại mà không gọi Gemini.
4. Bấm **Tạo lại tóm tắt** để yêu cầu Gemini tạo bản mới. Cũng có thể gõ “tóm tắt lại tài liệu” hoặc “tạo lại bản tóm tắt tài liệu”.

Mở trang hoặc xem lịch sử không tự tạo tóm tắt. UI gọi POST `/conversations/:id/questions` với payload cũ; không tạo API trùng. Khi tải lại trang, bản đã trả lời còn trong lịch sử; yêu cầu tóm tắt mới có thể lấy lại bản lưu của tài liệu. Tóm tắt một chủ đề có tên riêng vẫn đi qua retrieval thông thường, không dùng cache toàn PDF.

## Cơ chế lưu và an toàn

- JSON trong `TAI_LIEU.noi_dung_tom_tat` là envelope nội bộ; API không trả trực tiếp chuỗi JSON này. Những nơi cần đọc trực tiếp cột phải giải mã `result.answer`.
- Không tin bản cũ là plain text, JSON lỗi, fingerprint cũ hoặc evidence không hợp lệ. Chúng không được dùng như kết quả đã kiểm chứng; chỉ bị thay thế sau khi tạo bản mới thành công.
- Ownership, môn, trạng thái sẵn sàng và xóa mềm được kiểm tra trước cả cache. Hash extraction khác PDF bị từ chối, không tóm tắt chunk của phiên bản cũ.
- Sau generation, mở transaction ngắn, kiểm tra phiên đăng nhập, khóa hàng tài liệu và đọc lại fingerprint trước UPDATE. Không giữ transaction mở trong thời gian gọi Gemini.
- Tạo lại bị timeout/quota/lỗi mạng/không đạt kiểm chứng không xóa bản tốt trước đó. Khóa PDF luôn được nhả trong finally. Bản cũ hết hiệu lực không được trả như thể còn hợp lệ nếu tạo bản mới thất bại.
- Cache riêng từng PDF. Với nhiều PDF, các bản đã hoàn thành có thể đã được lưu trước khi PDF tiếp theo gặp lỗi; yêu cầu sau tái sử dụng chúng. Không có transaction bao trùm tất cả PDF.
- Quote/citation dựng từ chunk và metadata thật. Bước lưu lịch sử và kiểm tra snapshot của lượt 2 tiếp tục hoạt động. Nội dung PDF được coi là dữ liệu, không phải chỉ dẫn thực thi.

## Ngân sách và retry

Đọc tuần tự toàn bộ chunk của từng PDF, không dùng FAISS/embedding/top-k cho tóm tắt toàn tài liệu. Chặn trên 4096 chunk hoặc 8 MiB văn bản/PDF; giới hạn 96 thao tác thường sẽ chặn sớm hơn tùy số phần và việc phải chia context. Không âm thầm bỏ phần vượt giới hạn.

Mỗi phần/bước hợp nhất sinh tối đa 1200 ký tự và 8 quote ngắn theo cấu hình structured output. Cấu trúc ưu tiên tổng quan, chủ đề, khái niệm, trọng tâm và điểm cần nhớ nếu nguồn hỗ trợ. Đây là bản tóm tắt ngắn; tài liệu quá lớn có thể cần thu hẹp thay vì cố tạo bản đầy đủ.

Mỗi thao tác structured gồm countTokens rồi generation. Tổng job có deadline 150 giây; từng PDF còn chịu deadline tối đa min(150 giây, 3 × LLM_TIMEOUT_MS), từng request giữ timeout cấu hình. Adapter Gemini hiện có tiếp tục retry giới hạn với chờ cho lỗi rate rejection/count an toàn; không tự replay generation sau timeout/network/5xx khi chưa rõ đã tính phí. Sai evidence hoàn tất được sửa tối đa một lần; mọi lần sửa/chia vẫn tính vào ngân sách.

## File đã kiểm tra và thay đổi

Đã kiểm tra: schema thực tế và database/schema.sql; modules/documents/{service,mapper,repository}, modules/shared/repository; conversations/{service,aiService,summaryIntent,summaryService,requestSchema}; rag/{documentRetrieval,pdfExtractionThread}; integrations/llm/gemini; controllers/pdf.controller và routes/study.routes; FE ChatPanel, MessageList, questionRequest, DocumentScope và API tài liệu.

Thêm:

- src/modules/documents/summaryRepository.js — SQL đọc/lưu và khóa PDF.
- src/modules/documents/summaryService.js — cache, phiên bản, scope, transaction và điều phối nhiều PDF.
- tests/modules/summary-persistence.test.js — persistence/cache/version/concurrency/coverage/budget.
- tests/modules/service-summary.test.js — tích hợp luồng chat, giữ DTO và bỏ qua FAISS.
- docs/RAG_SUMMARY_PHASE3.md — báo cáo này.

Sửa:

- src/modules/conversations/{service,aiService,summaryIntent,summaryService}.js.
- tests/modules/summary.test.js — cập nhật mock verifier cho bước kiểm tra coverage mới.
- scripts/format-foundation.js — thêm các file mới vào phạm vi Prettier.
- FE/src/features/chat/ChatPanel.jsx — thao tác tóm tắt theo scope.

## Kiểm thử

Baseline trước lượt này: 34/34 Node tests qua. Sau thay đổi: **50/50 qua**, gồm 23 test liên quan tóm tắt. Lint BE/FE, format:check BE và build FE qua. Build vẫn có cảnh báo bundle >500 kB, không thuộc phạm vi lượt này.

Các test mới bao gồm lưu lần đầu, đọc lại qua instance/hội thoại khác không gọi Gemini, tạo lại thành công/thất bại, không ghi đè bởi lỗi/rỗng/evidence giả, PDF/chunk/vị trí đổi, extraction/hash lệch, scope/quyền/xóa mềm, hai yêu cầu đồng thời, trang thiếu văn bản, nhiều PDF, rollback khi nguồn đổi hoặc phiên bị thu hồi, hợp nhất nhiều tầng, bỏ sót chủ đề, prompt chứa chỉ dẫn, và ngân sách chung.

Kiểm thử dùng repository/transaction và HTTP Gemini giả lập; không ghi thử dữ liệu thật hay gọi API tính phí. Test luồng chat xác nhận response vẫn có đúng answer/blocks/citations/messageId/model/status/verification và nguồn vẫn mở được khi snapshot khớp.

Trong fixture PDF ngắn, pipeline hiện tại có 3 lần generation (map, coverage phần, kiểm chứng quote), kèm countTokens; cache hợp lệ có 0. Đây là kiểm đếm logic với mock, không phải benchmark latency/chi phí Gemini. So với trước lượt 3, bước kiểm chứng thêm làm lần tạo đầu tốn hơn; lợi ích tái sử dụng nằm ở các yêu cầu sau.

Chưa chạy live Gemini (chưa được yêu cầu gọi API tính phí), browser end-to-end, hoặc ghi thử MySQL. Chưa đánh giá faithfulness/completeness trên tập PDF thật có bảng/công thức/scan. Không tuyên bố accuracy tuyệt đối: kiểm chứng bằng model vẫn có thể bỏ sót lỗi. OCR/layout/extraction nâng cao thuộc lượt 4 và không được triển khai trong lượt này.

Không có quyết định bổ sung cần xác nhận để hoàn tất phạm vi code lượt 3. Cần yêu cầu riêng trước khi xử lý lại PDF, reindex hoặc chạy đánh giá Gemini có phí.
