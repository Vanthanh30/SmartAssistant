# Lượt 2 — Retrieval và grounding

Ngày thực hiện: 27/10/2026. Phạm vi: sửa hỏi đáp và kiểm chứng trên nội dung đã xử lý; không triển khai lưu tóm tắt của lượt 3.

## Kết quả và quyết định

| Hạng mục | Hiện trạng | Vấn đề | Đề xuất / thay đổi đã thực hiện | File liên quan | Mức ưu tiên |
|---|---|---|---|---|---|
| Phạm vi PDF | API đã nhận documentIds, Python có tìm kiếm theo scope | UI chưa cho chọn riêng; cần chống scope rỗng và cache vượt quyền | Thêm chọn PDF, chụp danh sách cho từng yêu cầu/retry, kiểm thử ownership trước search và sau cache | FE DocumentScope, questionRequest; tests/rag | P0 |
| Phân rã câu hỏi | Retrieval có planner; gate trả lời dùng cách phân rã riêng | Nhiều ý ở các chunk khác nhau dễ bị từ chối | Dùng chung planner cho retrieval và coverage; lưu nguồn hỗ trợ riêng cho từng ý | questionPlan, answerCoverage, aiService | P0 |
| Thuật ngữ | Keyword và gate chuẩn hóa riêng | RNA/ARN hoặc lỗi dấu hẹp có thể lệch truy hồi | Chuẩn hóa alias xác định; sửa hẹp khái niêm/chưc năng; không fuzzy đổi ADN thành ARN | queryTerms, keywordIndex, topicEvidence | P1 |
| Nhiều trang/PDF | Đã có hybrid trong RAM, batch retrieval và mở rộng liền kề có điều kiện | Không được buộc một chunk trả lời toàn bộ câu hỏi | Kiểm thử batch và bằng chứng từ nhiều PDF; gộp tập nguồn theo từng ý trước generation | documentRetrieval, contextExpansion, tests/rag | P0 |
| Bằng chứng một phần | Gate cũ dễ trả ngoài tài liệu cho cả câu | Mất phần có thể trả lời | Trả phần có nguồn, nêu cụ thể ý thiếu; dùng status insufficient_context hiện có | answerCoverage, aiService | P0 |
| Hỏi tiếp/mơ hồ | Có rewrite bằng model | Có thể đoán chủ thể | Dùng chủ thể rõ ràng từ câu hỏi trước; mơ hồ thì lưu lời yêu cầu làm rõ, bỏ qua retrieval/LLM | followup, service | P1 |
| Giả định sai | Có thể bị gate từ chối vì cụm số lượng | Câu hỏi sai tiền đề vẫn cần đối chiếu nguồn | Nhận diện tiền đề số loại, giữ nguyên câu hỏi cho generation, yêu cầu sửa theo bằng chứng | questionPlan, provider | P1 |
| Coverage sau sinh | Kiểm chứng chưa theo từng yêu cầu | Có bằng chứng nhưng model bỏ sót ý | Model khai báo ID ý; verifier kiểm tra độc lập; tối đa một lượt bổ sung nội dung | provider, aiService | P0 |
| Mâu thuẫn | Fast path có thể lấy đoạn đầu tiên ở nhiều PDF | Che mất nguồn khác biệt | Nhiều PDF đi qua generation/verification; yêu cầu nêu khác biệt, không tự chọn nguồn đúng | aiService, provider | P0 |
| Citation | Có scope và ID guard | Cần quote cho mọi nguồn được dẫn | Kiểm tra ID/document, quote nguyên văn và mỗi citation phải có evidence hợp lệ | aiService, service | P0 |
| Snapshot lịch sử | Có ngữ cảnh lưu tại thời điểm trả lời | PDF/chunk mới có thể khác nội dung cũ | Đối chiếu text, vị trí, trạng thái, hash PDF nếu có; chặn mở nguồn thay đổi, vẫn xem excerpt đã lưu | citationSnapshot, repository; FE CitationSource | P0 |

Không đổi endpoint, cấu trúc response hoặc ENUM. Metadata coverage chỉ dùng nội bộ giữa service và provider. Hash PDF được lưu trong JSON vị trí hiện có; không thêm cột. Cờ sourceDeleted hiện có được dùng cho cả nguồn không còn khớp snapshot. Các snapshot cũ thiếu pageMap sẽ bị chặn mở trang để tránh dẫn sai.

## File đã kiểm tra

- BE: src/modules/conversations/{service,repository,provider,aiService,topicEvidence,localAnswer,topicSectionAnswer,questionParts,summaryIntent,summaryService,presentation}.js.
- BE: src/rag/{documentRetrieval,keywordIndex,questionPlan,contextExpansion,client}.js; rag-service/{app,pipeline}.py; src/integrations/llm/{caller,gemini}.js.
- BE: cấu hình database schema checker, requestSchema, routes/controllers hỏi đáp, các bài kiểm thử còn lại và scripts/benchmark-backend.js.
- FE: src/features/chat/{ChatPanel,CitationSource}.jsx; API tài liệu, trang môn học và luồng chọn/mở PDF.
- Schema thực tế được kiểm tra bằng npm run verify:database trước khi bổ sung SELECT: 16 bảng, 124 cột, 21 FK. Không chạy chế độ ghi dữ liệu.

## File thay đổi trong lượt này

Đường dẫn dưới đây tính từ BE, trừ nhóm FE. Worktree có nhiều thay đổi từ trước, không coi toàn bộ git diff là sản phẩm lượt này.

- Thêm src/modules/conversations/{answerCoverage,queryTerms,followup,citationSnapshot}.js.
- Sửa src/modules/conversations/{aiService,provider,service,repository,topicEvidence,localAnswer,topicSectionAnswer}.js.
- Sửa src/rag/{questionPlan,keywordIndex,documentRetrieval}.js. Không đổi thuật toán FAISS, tham số fusion hay nội dung index.
- Thêm FE/src/features/chat/{DocumentScope.jsx,questionRequest.js,citationSnapshot.js}; sửa ChatPanel.jsx và CitationSource.jsx.
- Thêm tests/contracts/{helpers.js,http.test.js,fixtures/routes.json}, tests/llm/gemini.test.js, tests/rag/{evaluation.fixture.js,retrieval.test.js,test_scoped_search.py}, tests/modules/{coverage.test.js,service-grounding.test.js,fixtures/performance.js}.
- Thêm scripts/evaluate-grounding.js và báo cáo docs/RAG_GROUNDING_{BASELINE,AFTER}.json; cập nhật scripts/format-foundation.js và package.json để chạy bộ kiểm thử hiện có. Khôi phục fixture cần thiết cho benchmark, sửa script regression đang trỏ tới file không còn tồn tại.

## Kiểm thử và so sánh

Baseline trước sửa production: 11 kiểm thử Node còn tồn tại đều qua. Không tuyên bố khôi phục nguyên bộ test cũ đã bị xóa; bổ sung bộ test tập trung tương đương cho phạm vi lượt này.

| Kiểm tra | Kết quả | Loại / giới hạn |
|---|---|---|
| npm test | 34/34 qua | Unit + HTTP integration giả lập repository, không ghi DB thực tế |
| Python unittest tests/rag/test_scoped_search.py | 3/3 qua | FAISS thực trong thư mục tạm, model giả lập; không tải model hay sửa index hiện có |
| npm run lint BE và FE | Qua | Phân tích tĩnh |
| npm run format:check BE | Qua | Phạm vi formatter đã khai báo |
| npm run build FE | Qua | Có cảnh báo bundle >500 kB; chưa tối ưu bundle trong lượt này |
| verify:database | Qua | Đọc schema/integrity thực tế |
| benchmark-backend | Chạy thành công | Fixture giả lập round-trip; không dùng số này để khẳng định tốc độ production |

Offline evaluation được tạo trước sửa gate và chạy lại cùng corpus sau sửa. Dataset SHA-256: c7a0c3ce71c7c6f1f09524c7078495e2cf9ec2e3f42435cc4aba8ef6fadbf026.

| Chỉ số trên 8 câu giả lập | Trước | Sau |
|---|---:|---:|
| Keyword Recall@5 | 1.0 | 1.0 |
| Keyword MRR | 1.0 | 1.0 |
| Phân loại có/không có bằng chứng đúng kỳ vọng | 5/8 | 8/8 |
| Gemini calls trong evaluation | 0 | 0 |

Script lưu P50/P95 keyword search từng câu trong JSON. Corpus nhỏ và đo trên máy phát triển nên không suy ra cải thiện latency thực tế. Chỉ số gate đo trên tập nguồn được scope, tách biệt với ranking. Chưa đo dense Recall, faithfulness, completeness hay citation accuracy trên dữ liệu người dùng. Không dùng kết quả 8/8 để kết luận RAG chính xác tuyệt đối hoặc hiệu chỉnh ngưỡng cosine.

Các test bao gồm nhiều ý/nhiều trang/PDF, alias ARN/RNA, partial, outside-document, tiền đề số lượng, hỏi tiếp mơ hồ, nguồn mâu thuẫn, citation/quote giả, snapshot đổi, ownership, scope rỗng, cache, FAISS version mismatch, quota/timeout và structured response lỗi. Các test Gemini mock HTTP; không gọi dịch vụ tính phí.

## Giới hạn và phần chưa thực hiện

- Chưa chạy end-to-end trên trình duyệt với tài khoản/PDF thực tế hoặc live Gemini. Build và test helper không thay thế kiểm tra tương tác UI.
- Coverage từ từ khóa/nhãn mục là điều kiện định tuyến, không phải chứng minh ngữ nghĩa. Verifier bằng model vẫn có thể sai. Fast path chỉ trích nguyên văn và giữ trạng thái chưa kiểm chứng.
- Khi đủ nhiều PDF/ý, generation và verifier tăng chi phí. Có tối đa một vòng bổ sung nội dung; sửa JSON vẫn dùng giới hạn có sẵn của provider. Vượt ngân sách context phải báo giới hạn, không tự mở rộng vô hạn.
- Không thể lấy lại nội dung mà extraction cũ đã làm mất. Bảng, công thức, scan/OCR, hai cột và nội dung trùng cần tập PDF thật ở lượt 4; không xử lý lại PDF trong lượt này.
- Không thay database/schema, embedding, vector, FAISS hoặc model; không reindex; không cài thư viện/dịch vụ; không sửa secret .env.
- Lượt 3 lưu/cache/tạo lại tóm tắt vào trường hiện có chưa triển khai. Luồng tóm tắt hiện có được giữ và 7 kiểm thử của nó vẫn qua.
- Không cần xác nhận bổ sung để hoàn tất phạm vi lượt 2. Các thay đổi extraction/reindex và triển khai lượt sau cần yêu cầu riêng.
