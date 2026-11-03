# Kế hoạch tuần theo nội dung PDF

Người dùng chọn nhiều PDF cùng môn, mục tiêu, tuần/ngày bắt đầu và kết thúc trong tuần, giờ rảnh và thời lượng. Chat lên lịch và form nâng cao đều chọn nhiều PDF được. Gemini chia chủ đề, gộp ý trùng và tạo nội dung từng buổi; bộ xếp giờ hiện có tiếp tục xử lý trùng lịch, giờ rảnh, giờ bận và thời gian nghỉ.

Mỗi buổi lưu tiêu đề, độ khó, mục tiêu, các nhóm kiến thức, hoạt động có số phút, nguồn PDF/trang/chunk, số câu quiz và flashcard. Tổng phút hoạt động phải bằng thời lượng buổi. API kiểm chứng độc lập trước khi đưa vào nháp. Nguồn được kiểm tra lại về sở hữu, môn học, trạng thái và chunk khi xác nhận/sửa. Không đổi cấu trúc bảng: lesson nằm trong JSON dieu_kien_hoc.sessions; phiên bản lịch và kiểm tra UUID xét cả nội dung lesson.

Bản nháp cho sửa tiêu đề, giờ, mục tiêu và hoạt động; chỉ xác nhận mới lưu. Nội dung thiếu giờ được liệt kê riêng. Chỉnh giờ và gợi ý lại có thể dùng lại nội dung đã kiểm chứng trong cache 5 phút, tối đa 16 kế hoạch; vẫn đọc và kiểm tra nguồn mới mỗi lần đề xuất. Không dùng lại khi nguồn/mục tiêu/thời lượng/số buổi đổi.

Học ngay mở /app/study-calendar/sessions/:id, hiển thị nội dung, mở PDF đúng trang, tạo/mở bài luyện. sessionId gắn bộ học với buổi; backend giới hạn bài luyện vào đúng tài liệu/chunk/trang đã lưu, không chỉ tin phạm vi do frontend gửi. Bộ học được dùng lại khi phù hợp, không tạo sẵn hàng loạt khi chỉ xem lịch.

Buổi bỏ lỡ có hướng dẫn dời theo cơ chế xem giờ thay thế và xác nhận hiện có. Quiz hoàn thành gần nhất dưới 60/100 kích hoạt gợi ý ôn; người dùng mở bản nháp buổi ôn, chọn giờ, sửa nội dung rồi xác nhận. Đây là ngưỡng sản phẩm để gợi ý, không kết luận năng lực người học. Không tự dời hoặc ghi đè lịch. Google là thao tác tùy chọn theo từng buổi; mô tả sự kiện chứa nội dung hoạt động và liên kết đến buổi học.

Kiểm tra API thật, chỉ đọc: hai PDF môn 24 tạo 3 bài khác nhau, mỗi bài 45 phút, có mục tiêu và nguồn từ nhiều PDF, qua kiểm chứng trong khoảng 13,7 giây. Không tạo buổi thật hoặc sự kiện Google trong phép thử. Kiểm thử tự động bao gồm số buổi/thời lượng, nguồn ngoài phạm vi, quyền sở hữu, giới hạn tuần, round-trip metadata, phiên bản lịch, cache và payload Google.

Giới hạn: tối đa 14 buổi/mục tiêu và 128 chunk trong một lần phân tích. AI khảo sát nguồn rút gọn; không bảo đảm học hết toàn bộ tài liệu khi số buổi ít. Buổi cũ chưa có lesson vẫn giữ nguyên; tạo kế hoạch mới để có nội dung chi tiết. Đã kiểm tra lint/build frontend; chưa chạy kiểm thử thao tác trình duyệt hoặc đồng bộ Google thật trong lượt triển khai này.


## Full-document requests and bulk calendar sync

Explicit requests such as “học full/toàn bộ nội dung hai tài liệu trong 2 buổi” require complete source coverage across exactly the requested session count. The compact planner survey retains a sample from every source chunk (including long paragraphs); one bounded AI repair may fill omitted chunks. Independent verification also checks semantic coverage rather than accepting attached source IDs alone. Sources are merged into contiguous PDF ranges; source IDs remain intact for practice scoping.

Proposal and confirmation independently reject incomplete full-document scope, insufficient scheduled slots and removal of required lessons. Selected PDFs without indexed coverage for all pages cannot be labelled fully covered. Preview reports per-PDF processed-source coverage, which is not a guarantee of mastery. Existing saved plans are not rewritten automatically; generate a new proposal to apply the corrected planner.

The planner has a scoped output allowance (bounded to 8,000 tokens) for structured lesson JSON; proof/one repair reserve bounded input space for the generated plan. Global chat limits are unchanged. Verified plans remain cached for five minutes.

A live read-only check on 2026-10-30 using the two uploaded Physics PDFs (25 and 10 pages, 38 chunks) returned exactly two 60-minute sessions with 38/38 chunks covered, including both PDFs. No internal sessions or Google events were written by this check.

Calendar → Đồng bộ Google Calendar supports the visible range or all saved sessions needing sync (up to 500 saved rows; larger accounts use date ranges). Users review checkboxes before one explicit sync action. Requests use the existing authenticated/version-checked sync endpoint sequentially. Each result is displayed, successful rows are not resent, failures can be retried, and stopping takes effect after the active request. Retry reads the latest session/version; cancelled sessions are not synced. Provider IDs remain deterministic. Google sync rate limiting is separate from expensive AI actions (60 requests/minute); hitting the limit stops the batch so remaining sessions can be resumed. No AI calls are used for sync.

Validation: BE plan-coverage and intelligent-calendar tests; FE bulk-sync and preview tests; `scripts/test-bulk-google.cjs` checks all-saved selection, per-session failure, retry-only-failure and mobile layout with mocked Google API. Actual Google event creation was not performed during verification.


## Delete cancelled sessions

Cancellation preserves a session in the calendar. A cancelled session now exposes a separate permanent-delete confirmation. `DELETE /lich-hoc/:id` requires CSRF, authenticated student ownership and the current revision. If a Google event exists, the existing guarded provider deletion must succeed before the local row is removed. A provider failure retains the cancelled session for retry.

Deletion removes the session row, its lesson/request/sync metadata and its inbox notices. The plan remains (including device subscriptions), and PDFs and saved quiz/flashcard history remain. A per-plan deleted-session tombstone prevents a retry of an old plan-confirm request from recreating the same deterministic session ID. No schema migration is needed.

Tests: `tests/modules/delete-session.test.js` covers state/version guards, Google-event protection, owner-scoped deletion and metadata isolation. FE `scripts/test-delete-session.cjs` uses mocked APIs to cover confirmation, provider-failure retention, retry, and disappearance after reload; it deletes no real user data.


## Calendar state colors and stale API processes

Calendar events use explicit colors and text labels: planned blue, rescheduled amber, completed green, cancelled red. Permanent deletion removes the event after server acknowledgement; cancelled and deleted are distinct states. New time changes persist `movedAt` and up to ten before/after time entries in existing session JSON. Changes to title/content preserve that history. Older sessions without a reliable movement record are not guessed as rescheduled.

The DELETE client verifies server acknowledgement, removes confirmed deleted IDs from calendar query caches, and reconciles a session already removed elsewhere. If DELETE returns 404 while GET still finds that same session, it reports that the running backend has not loaded the delete API rather than pretending deletion succeeded.

The current `npm run dev` launcher starts plain `node src/server.js`, not a watcher. Backend source edits require stopping and restarting the existing BE process; do not start an additional copy on port 4000. Route integration test `calendar-delete-route.test.js` mounts the real router on a temporary test-only port with a stub calendar service, exercising DELETE, JSON parsing, CSRF and controller dispatch. No production session is deleted.

## In-session document chat

The classroom has an optional chat panel alongside PDF reading and practice. Each session retains its own conversation in existing plan JSON. POST /lich-hoc/:id/hoi-thoai reopens that conversation or explicitly starts a new one; student ownership and CSRF are required. No schema migration is needed.

Question requests include sessionId. The server validates conversation ownership, course and current lesson resources, then restricts retrieval before ranking to those PDFs, page ranges and chunk IDs. Boundary chunks are clipped using their page maps; unreliable boundaries are excluded. Citation snapshots validate clipped content against the unchanged original source. Follow-up context is isolated by session and scope hash; changed lesson scope is checked again before saving an answer. Ordinary course chat remains available separately.

Validation: session-chat.test.js covers scope validation, boundary clipping, citation snapshots and scoped retrieval. The real-router test checks chat route dispatch and CSRF. FE test-session-chat.cjs exercises opening, sending, persistent history, PDF reading, mobile layout and a new conversation with mocked APIs; it does not call a live AI provider. Restart the existing backend process to load the new endpoint.

## Practice requested from chat

Chat recognizes practice requests before question rewriting and opens an editable practice card. It carries the latest unambiguous user topic (or an explicit topic), selected ready PDFs, and sessionId when inside a lesson. Missing/ambiguous topics require input before generation. Users choose quiz/flashcards and 1–29 items; explicit counts and flashcard requests prefill controls. No AI call occurs until confirmation. Requests reuse the same UUID on network retry and use forceNew=false by default.

The learning API validates an optional topic (1–150 characters), includes it in reuse fingerprints/settings, and applies it to generation, repair and semantic verification. Off-topic questions are unsupported. Existing authenticated source/session authorization, evidence checks, attempts and citations are reused. Topic support requires restarting the existing backend; no database migration is required.

Verification: practice-intent.test.js, practice-topic.test.js, lint/build and extended test-session-chat.cjs (mocked APIs; verifies practice does not POST a chat question and carries topic/session/source scope). Live AI output quality was not exercised in this change.

### Confirm recent practice topics

Generic practice requests now require a scope choice: one recent concrete user topic, a combination of up to three recent topics, or a custom topic. Generic examples/pronouns and single-word course names are excluded from suggestions. Generation is disabled until scope is chosen. Explicit topic requests remain editable. Topics are sent as a validated array and included in a versioned reuse fingerprint so older broadly generated sets are not reused.

Before AI generation, exact numbered/Markdown section ranges are selected by topic while preserving original evidence text/offsets. Unstructured chunks must explicitly name a topic; semantic verification remains mandatory. Missing topic sources are rejected before generation, and the verification response must cover every requested topic index. Flash learning defaults use low/no hidden thinking unless configured explicitly. Tests cover recent-topic suggestions, section isolation, complete-topic verification and the browser confirmation flow with mocked APIs. Live provider latency has not been measured for this change.
