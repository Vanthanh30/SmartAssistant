# Lượt 4 — PDF nâng cao

Ngày thực hiện: 27/10/2026. Đã triển khai và kiểm thử trên source. Không xử lý lại tài liệu người dùng, không thay dữ liệu vector/FAISS, không gọi Gemini hoặc Cloudinary trong lượt này.

## Báo cáo

| Hạng mục | Hiện trạng trước lượt 4 | Vấn đề | Đề xuất / thay đổi đã thực hiện | File liên quan | Mức ưu tiên |
|---|---|---|---|---|---|
| Hai cột | Ghép các item cùng baseline rồi đọc từng dòng | Trộn câu ở cột trái với cột phải | Tìm gutter có hỗ trợ từ nhiều dòng; đọc hết từng cột theo từng vùng, giữ dòng vượt gutter làm ranh giới | FE pdfTextGeometry.js; BE rag/pdfLayout.js | P0 |
| Bảng số liệu | Chỉ có văn bản phẳng | Mất quan hệ tiêu đề–giá trị | Nhận diện bảng ngắn có header và cột thẳng hàng, đủ dòng số liệu; lặp nhãn cột tại mỗi hàng; giữ số liệu, dấu thập phân và đơn vị | rag/pdfLayout.js | P0 |
| Bảng không chắc | Không có cờ hạn chế | Có thể ghép nhầm ô, merged cells hoặc dòng quấn | Giữ văn bản và gắn table-structure-uncertain; không tự suy ra ô ghép hoặc quan hệ cột | rag/pdfLayout.js; sourceLimitations.js | P0 |
| Bảng nhiều trang | Không có liên kết cấu trúc | Có thể nhầm hai bảng không liên quan | Gắn continuationOf khi header và vị trí cột khớp, bảng chạm cuối/đầu hai trang liên tiếp; không gộp số liệu hoặc đoán header thiếu | rag/pdfLayout.js | P1 |
| Heading/paragraph | Xuống dòng thuần | Chunk có thể tách heading khỏi giải thích | Ghép các dòng prose liên tiếp có điều kiện; heading nối với đoạn sau; ranh giới paragraph/hàng bảng dùng dòng trống cho chunker hiện có | rag/pdfLayout.js | P1 |
| Header/footer | Có thể lặp lại trong truy hồi | Nhiễu keyword/context | Chỉ bỏ các dòng chữ lặp chính xác ở lề ngoài 7%, xuất hiện >=3 trang và >=60% số trang; giữ lần đầu và metadata dấu vết | rag/pdfLayout.js | P1 |
| Công thức hỏng | Có thể có ký hiệu rời, số mũ hoặc glyph thiếu | Dễ viết lại công thức sai | Không khôi phục LaTeX hoặc suy diễn ký hiệu; đánh dấu formula-order-uncertain cho dạng khó và truyền giới hạn cho generation/verifier | pdfLayout.js; sourceLimitations.js | P0 |
| Crop công thức | Anchor lặp có thể được lọc chỉ bằng một trong hai phía | Chọn nhầm lần xuất hiện hoặc cột | Anchor lặp phải có ngữ cảnh phân biệt và mọi biên đã cung cấp phải khớp; thêm thứ tự đọc theo cột làm fallback | FE pdfFormulaRegion.js | P0 |
| Tính toàn vẹn ảnh | Cache dựa trên hash trong metadata xử lý | Hash metadata có thể không phải hash tài liệu hiện tại | Cache v4 dùng hash PDF trên hàng tài liệu; worker kiểm tra hash byte đầu vào, giới hạn trang/PNG; sai hash từ chối | documents/formulaService.js; rag/formulaCrop*.js | P0 |
| Worker crop | Exit 0 không có message có thể làm promise treo | Người dùng chờ vô hạn | Xử lý cả exit im lặng, constructor/error, payload sai và timeout; luôn kết thúc worker | rag/formulaCrop.js | P0 |
| Vị trí ảnh trong câu trả lời | Ảnh được thêm cuối câu trả lời | Ảnh xa phần lý thuyết tương ứng | Thay đúng anchor duy nhất bằng ảnh ngay giữa phần giải thích; không đoán vị trí của paraphrase; crop lỗi thì thay tại chỗ bằng lời mở trang nguồn | conversations/sourceMedia.js; service.js | P0 |
| PDF scan/hình/biểu đồ | Không có OCR/vision | Không thể hiểu phần chỉ có pixel | PDF không có text báo lỗi rõ, không giả vờ đã OCR; capabilities công khai trong metadata là false | pdfExtractionThread.js; documents/service.js | P0 |
| Grounding | Verifier chưa nhận hạn chế bố cục | Có thể xác nhận quan hệ ô/công thức dựa trên text hỏng | Truyền limitations nội bộ; bỏ fast path khi nguồn có cảnh báo; thêm chính sách cho generation và kiểm chứng | provider.js; aiService.js; summaryService.js | P0 |
| Metadata lớn | Chưa có layout metadata | Nguy cơ phình JSON khi nhiều block/ô | Không nhân đôi toàn bộ text trong metadata; vượt 4 MiB thì rút chi tiết, báo layout-metadata-limited và giữ nguyên toàn bộ văn bản trang | rag/pdfLayout.js | P1 |

## Phạm vi áp dụng

- Extraction mới dùng `layoutVersion: 3`. Metadata nằm trong `cau_hinh_xu_ly.extraction.layout` hiện có; cảnh báo theo trang đi vào JSON vị trí chunk hiện có.
- Python vẫn nhận đúng `{pageNumber, text}`. Không thêm field vào hợp đồng Page của Python; service lọc payload trước khi gửi.
- Không thay tokenizer, thuật toán chunking Python, embedding model, schema/PK/FK/ENUM hoặc endpoint/DTO. Thay văn bản đầu vào của PDF xử lý mới sẽ dẫn đến chunk/vector mới theo cơ chế upload bình thường.
- Không ép vô hiệu extraction đã cache cùng hash, không đổi trạng thái tài liệu đã sẵn sàng. `process()` vẫn trả ngay cho PDF sẵn sàng. Upload trùng vẫn theo cơ chế chống trùng cũ.
- Cải thiện crop/đặt ảnh có thể áp dụng cho câu trả lời mới từ chunk cũ nếu anchor xác định được; không sửa tin nhắn lịch sử hoặc ảnh đã lưu.
- Không chạy embedding, build index, truy cập PDF trên cloud hoặc ghi thử database thật trong lượt này. Schema thật đã được kiểm tra đọc: 16 bảng, 124 cột, 21 FK.

## Bảo toàn nguồn và giới hạn

Văn bản bảng có cấu trúc là biểu diễn extraction, không phải bản sao kiểu chữ của PDF. Mỗi hàng ghi lại nhãn cột lấy từ header thật; metadata có bbox bảng/hàng/ô và vị trí đầu/cuối block trong text trang. Khi metadata bị giới hạn dung lượng, chi tiết ô có thể không được giữ; văn bản không bị cắt và cờ giới hạn được lưu rõ.

Không nhận diện chắc mọi bảng. Heuristic hiện chỉ phục hồi một tập bảng số liệu đều cột, ít nhất 3 dòng, có header chứa tên cột nhận biết và >=2 dòng số liệu. Header trùng, ô ghép, wrapping phức tạp hoặc thiếu header không được tự điền. Các PDF có hai cột cũng có thể được đánh dấu chưa chắc quan hệ bảng; hệ thống ưu tiên kiểm chứng thay vì fast path trong trường hợp đó.

PDF xoay, text geometry lỗi hoặc page origin khác chuẩn bị đánh dấu hạn chế và không được nhận diện bảng/cột như trường hợp chắc chắn. Không khẳng định đã sửa thứ tự đọc của mọi layout. Crop vẫn từ PDF thật, không dùng ảnh tổng hợp hoặc công thức do model dựng lại.

Giới hạn crop: tối đa 4 trang ứng viên, PNG <=2 MiB, khoảng 4 triệu pixel, worker heap 256 MiB và timeout 30 giây. Anchor/đối chiếu không đủ rõ thì fallback trang nguồn, không cắt cả trang để giả làm công thức. Ảnh chỉ được chèn nếu tìm thấy duy nhất anchor trong câu trả lời; paraphrase không có anchor không bị gán ảnh tùy ý.

OCR và giải thích hình/biểu đồ chưa triển khai: không có thư viện/dịch vụ mới được cài, không gửi ảnh sang Gemini. Lựa chọn tiếp theo cần đánh giá riêng: OCR cục bộ thêm runtime/ngôn ngữ tiếng Việt và chi phí CPU; OCR/vision bên ngoài thêm chi phí gọi dịch vụ và truyền dữ liệu. Chưa báo giá hoặc cam kết accuracy khi chưa benchmark trên tập PDF scan thật và xác minh dịch vụ/model cụ thể.

## File đã kiểm tra

- BE: rag/{pdfExtractor,pdfExtractionThread,formulaCropThread,documentRetrieval}; rag-service/{app,pipeline}.py.
- BE: modules/documents/{service,formulaService,sourceService,summaryService,mapper,repository}.
- BE: modules/conversations/{service,provider,aiService,summaryService,presentation,compoundAnswer,documentAnswer,topicSectionAnswer}.
- BE: config/env, controllers/pdf.controller, database/schema.sql và schema thực tế.
- FE: features/chat/{pdfFormulaRegion,AnswerContent,FormulaImage,MessageList}; features/documents/DocumentStatus; vite.config.

## File thay đổi

Thêm:

- BE/src/rag/{pdfLayout,formulaCrop,sourceLimitations}.js.
- BE/src/modules/conversations/sourceMedia.js.
- FE/src/features/chat/pdfTextGeometry.js — logic geometry dùng chung extraction và crop; giữ nguyên hàm pdfTextLines cũ qua re-export.
- BE/scripts/inspect-pdf-layout.js — đọc PDF local và in chẩn đoán, không DB/API/index.
- BE/tests/modules/pdf-layout.test.js; BE/tests/modules/fixtures/pdf.js — tạo PDF thật trong RAM bằng định dạng PDF tối thiểu, không thêm package.
- BE/docs/RAG_PDF_PHASE4.md.

Sửa:

- BE/src/rag/{pdfExtractionThread,formulaCropThread,documentRetrieval}.js.
- BE/src/modules/documents/{service,formulaService,summaryService}.js.
- BE/src/modules/conversations/{service,provider,aiService,summaryService}.js.
- FE/src/features/chat/pdfFormulaRegion.js.
- BE/scripts/format-foundation.js.

## Kiểm thử và so sánh

Baseline đầu lượt: 50/50 Node tests qua. Sau thay đổi: **68/68 qua**, trong đó 18 test PDF/layout/crop mới. Lint BE và FE, format:check BE và build FE qua; build còn cảnh báo bundle >500 kB như trước.

| Fixture | Trước | Sau |
|---|---|---|
| Hai cột có 4 dòng mỗi cột | Left0, Right0, Left1, Right1… | Left0…Left3, rồi Right0…Right3 |
| Bảng Name/Value/Unit có số thập phân | Text phẳng, không giữ quan hệ header trong hàng | Name: Mass \| Value: 1.25 \| Unit: kg |
| Cùng công thức xuất hiện hai lần | Có thể lọc bằng một phía ngữ cảnh | Không có ngữ cảnh thì từ chối; biên trước/sau xung đột thì từ chối |
| Ảnh công thức | Thêm ở cuối | Thay anchor ngay giữa lý thuyết trước và giải thích sau |
| Worker exit 0, không message | Promise có thể chưa settle | Lỗi có kiểu, worker kết thúc |
| File ảnh không có text | Không có OCR | Vẫn không OCR; lỗi được giải thích rõ thay vì giả định có nội dung |

Test bao gồm geometry tiếng Việt, giữ đơn vị/dấu thập phân, bảng có/không đường viền, bảng mơ hồ/header trùng, nối bảng qua trang, footer lặp, page rotation/origin, glyph công thức lỗi, crop anchor lặp/cột, media placement, metadata budget và truyền cảnh báo vào verifier.

Đã chạy worker pdfjs và canvas thật với PDF tạo trong RAM: hai cột, bảng, PDF chỉ có raster image, hash không khớp và ảnh PNG crop. Worker lifecycle dùng giả lập để ép constructor lỗi, exit im lặng, timeout, message null/bytes sai. Các bài grounding/Gemini vẫn mock; không gọi API tính phí. Đây là kiểm thử kỹ thuật trên fixtures, chưa phải đánh giá accuracy/latency trên bộ PDF của người dùng.

Chưa chạy browser end-to-end, upload Cloudinary thật, live Gemini hoặc xử lý lại PDF thật. Chưa benchmark OCR, merged cells hay tất cả bảng nhiều trang; không tuyên bố hỗ trợ đầy đủ các dạng này. Tối ưu hiệu năng toàn tuyến thuộc lượt 5.

Có thể xem chẩn đoán PDF local mà không thay hệ thống:

```powershell
cd BE
node scripts/inspect-pdf-layout.js --pdf="C:/duong-dan/tai-lieu.pdf"
```

Script chỉ in hash, phiên bản, số trang, số block/bảng và cảnh báo; không in nội dung học thuật hoặc secrets. Khi metadata đã rút gọn, số bảng/công thức trong phần chi tiết có thể chỉ phản ánh các block còn giữ; detailsOmitted và cảnh báo thể hiện giới hạn này.

## Kế hoạch riêng nếu áp dụng cho PDF đã lập chỉ mục

Chưa thực hiện và chưa cần xác nhận để hoàn tất phần code lượt 4. Việc áp dụng extraction v3 cho tài liệu cũ cần được duyệt riêng vì văn bản/thứ tự/offset chunk có thể đổi và đòi hỏi embedding/index mới:

1. Đọc danh sách tài liệu, phiên bản extraction, số chunk và index manifest; xác định phạm vi từng PDF, không tự chọn toàn bộ hệ thống.
2. Chuẩn bị bản sao metadata/chunk/vector mappings, index manifest và snapshot citation liên quan; lập báo cáo diff extraction/chunking trước khi công bố index mới.
3. Thiết kế staging artifact và thao tác publish dưới khóa môn học, giữ nguyên quyền truy cập và model. Không xóa chunk đang được lịch sử tham chiếu; phải xác minh FK và chính sách snapshot trước khi viết công cụ cập nhật.
4. Kiểm chứng mapping trang/chunk, scope/ownership, câu hỏi đối chứng; có kế hoạch rollback pointer/mapping và giữ artifact cũ cho đến khi xác nhận an toàn.

Không hướng dẫn sửa trạng thái SQL trực tiếp để lách nhánh ready hoặc xóa index cũ. Không tự động chạy kế hoạch trên dữ liệu hiện có.
