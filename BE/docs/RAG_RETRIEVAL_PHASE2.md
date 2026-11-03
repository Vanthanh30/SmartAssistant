# Lượt 2 — Retrieval, ngày 27/10/2026

Phạm vi được duyệt: planner nhiều ý, hybrid trong RAM, mở rộng chunk có điều kiện, tối ưu truy hồi và test. Không thay schema, model, PDF, chunk, vector đang lưu; không reindex hoặc cài thư viện mới. Benchmark chỉ SELECT; không tạo hội thoại hoặc gọi LLM tính phí.

## Đã triển khai

- `questionPlan.js`: danh sách tối đa 8 ý; các mẫu liệt kê khái niệm/đặc điểm/chức năng/ưu điểm/hạn chế kế thừa chủ thể sau “của”. Giữ nguyên câu hỏi gốc cho generation. Câu vượt giới hạn quay về nguyên câu và log `planLimited`; không âm thầm bỏ các ý cuối.
- `keywordIndex.js`: BM25 tiếng Việt không dấu, số/đơn vị; RRF semantic + keyword; rerank tiêu đề đúng chủ thể. Đây là rule-based ranking, không phải một model reranker mới và không phải kiểm chứng nội dung.
- Keyword cache chỉ giữ postings và tiêu đề, không giữ toàn bộ PDF text. Một scope được cache, ngân sách ước lượng 16 MiB. Vượt ngân sách thì log `keywordEnabled=false` và vẫn truy hồi semantic; không trả kết quả keyword bị cắt âm thầm.
- Catalog quyền sở hữu/PDF/trạng thái được đọc lại mỗi request. Cache key có owner, course, index version, chunk ID/hash. Đọc text theo batch 256 chunk khi cache lạnh. Đọc lại nội dung và kiểm tra quyền/hash trước khi trả kết quả; nguồn đổi hoặc bị xóa giữa request báo `SOURCE_CHANGED`.
- Gộp kết quả theo từng ý, giữ `retrievalParts`, bỏ trùng cùng PDF/hash và giữ provenance riêng giữa các PDF. Không dùng cosine 0,75 để loại kết quả hybrid chỉ vì keyword có cosine thấp.
- Giữ cosine tách biệt với RRF. Keyword-only/neighbor chưa có cosine dùng số 0 tương thích cột NOT NULL hiện có, với `similarityMeasured=false` trong JSON `thong_tin_nguon` sẵn có. Không tạo cột mới.
- Mở rộng trước/sau chỉ khi có dấu hiệu đứt câu/tiêu đề, cùng PDF và thứ tự liền kề; từ chối tiêu đề mới không có overlap. Không kéo chuỗi vô hạn: tối đa 4 chunk thêm, tối đa 2.048 token theo upper bound của embedding contract. Giới hạn toàn bộ kết quả là 20. Kiểm tra exact prompt budget của generation vẫn giữ nguyên.
- Khôi phục thứ tự bên trong nhóm context, đánh dấu `contextIncomplete` khi chưa có phần tiếp. Heuristic chỉ là tín hiệu thiếu ngữ cảnh, không chứng minh đã phục hồi toàn bộ bảng/mục.
- Python `search_many`: tối đa 8 query, encode các query còn thiếu trong một batch; cache query bao gồm model/revision. Đọc/checksum index một lần mỗi batch, tái kiểm tra ở request sau, lọc scope trước top-k. Single endpoint vẫn giữ `version/candidates` và bổ sung timings.
- Node dùng `/indexes/search-batch`; nếu Python cũ trả 404 thì dùng endpoint cũ. Không fallback khi timeout, lỗi quyền, lỗi dữ liệu hay version mismatch.
- Log riêng planning, scope SQL, keyword build, search, reranking, content SQL, expansion; Python mới có embedding, index/scope và FAISS timings. Không ghi nội dung câu hỏi hoặc secrets vào log.

## Kiểm tra

Từ BE:

```powershell
npm run test:retrieval
npm run lint
..\.venv\Scripts\python.exe -m unittest discover -s tests/rag -p 'test_*.py'
node scripts/benchmark-retrieval.js
```

Node: planner, thuật ngữ/số/đơn vị, RRF, giới hạn bộ nhớ, nguồn nhiều trang/PDF, thứ tự context, bỏ trùng, cache invalidation, quyền sở hữu, PDF được chọn, batch/fallback, lỗi kỹ thuật, nguồn bị thay đổi và corpus tổng hợp 1.000 chunk. Python: API/Pydantic, FAISS thật trên vector tổng hợp, model stub xác định, cache và checksum. Không nạp thêm bản model thật hoặc sửa index đang hoạt động. Các ca tổng hợp không thay thế corpus PDF thật có nhãn.

## Benchmark đã chạy

Corpus thật đang sẵn sàng: 1 PDF, 31 chunk. Ba câu đã đối chiếu với trang nguồn trong phiên: từ trường (PDF trang 13), bay hơi/sôi (trang 2), số mol khí (trang 7). Mỗi nhánh đo 30 lượt warm. Baseline tái hiện thuật toán FAISS + round-robin cũ trong cùng script, cùng index. Không đo toàn bộ chat.

| Chỉ số | Baseline | Hybrid |
|---|---:|---:|
| Hạng bằng chứng ba câu | 2 / 4 / 5 | 1 / 1 / 1 |
| Recall@20, chỉ 3 câu | 3/3 | 3/3 |
| MRR, chỉ 3 câu | 0,317 | 1,000 |
| p50 retrieval warm | 12,76 ms | 17,16 ms |
| p95 retrieval warm | 24,37 ms | 28,35 ms |
| LLM API calls | 0 | 0 |

Hybrid tăng chất lượng xếp hạng của các mẫu này, nhưng warm latency chưa nhanh hơn baseline trên corpus nhỏ. Không suy rộng MRR=1 hoặc Recall=3/3 thành độ chính xác tổng thể. Phải mở rộng tập gold trước khi hiệu chỉnh các quy tắc.

Dịch vụ Python đang chạy khi đo vẫn dùng endpoint cũ: fallback đã được kiểm tra live; batch mới được kiểm tra bằng API test và FAISS tổng hợp. Chưa có số đo batch trên model thật sau restart, cold embedding, concurrency production hoặc nhiều PDF thật. Không có kết quả faithfulness/coverage toàn câu trả lời do LLM sinh ở lượt này.

## Giới hạn / bước tiếp theo

- Không sửa extraction/chunking của PDF đang hoạt động. Bảng text trộn cột, ô gộp, scan và bảng nhiều trang chưa được khôi phục layout trong lượt này.
- Generation, phân loại ba trường hợp, Answer Coverage và repair thuộc lượt 3; bộ kiểm tra lexical ở `groundedAi` vẫn có thể từ chối câu nhiều ý dù retrieval đã tìm đủ nguồn. Chưa tuyên bố giải quyết toàn bộ hỏi đáp phức tạp.
- Chưa thay đổi logic Quiz/Flashcard/Calendar. Phần `mapRetrievedSource` giữ hợp đồng tương thích. Không dùng pipeline này để thay nguồn của các tính năng khác.
- Lúc kiểm tra lượt2, `.env` dùng Gemini nhưng validator chỉ nhận OpenAI, gây lỗi `LLM_PROVIDER`; lượt2 giữ nguyên cấu hình. Sau yêu cầu chuyển provider riêng ngày27/10, đã bổ sung adapter Gemini và cập nhật cấu hình. Xem [GEMINI_API.md](GEMINI_API.md) về kiểm thử và cách nạp cấu hình mới.
