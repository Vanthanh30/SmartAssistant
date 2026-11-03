import { LessonContent } from "./LessonContent.jsx";
import { DateTime } from "luxon";
import { Button } from "../../components/ui/Button.jsx";
import { ZONE } from "./dates.js";

export function ChatDraftPreview({
  proposal,
  onChange,
  disabled,
  onConfirm,
  onRestart,
}) {
  const patch = (id, key, value) =>
    onChange({
      ...proposal,
      slots: proposal.slots.map((s) =>
        s.requestId === id ? { ...s, [key]: value } : s,
      ),
    });
  const time = (value) =>
    DateTime.fromISO(value, { zone: ZONE }).toFormat("yyyy-MM-dd'T'HH:mm");
  return (
    <section className="chat-draft-preview" aria-label="Bản nháp lịch học">
      <h3>Bản nháp · {proposal.slots.length} buổi</h3>
      {proposal.unscheduledLessons?.length > 0 && (
        <p role="status">
          Chưa xếp được giờ cho:{" "}
          {proposal.unscheduledLessons.map((s) => s.title).join("; ")}. Hãy thêm
          giờ rảnh hoặc dành nội dung này cho tuần sau.
        </p>
      )}
      {proposal.coverage?.map((report) => (
        <div className="session-notice" key={report.courseId}>
          <strong>
            Đã phân bổ toàn bộ nguồn của {report.documents.length} tài liệu vào{" "}
            {proposal.slots.length} buổi.
          </strong>
          <ul>
            {report.documents.map((d) => (
              <li key={d.documentId}>
                {d.fileName}: {d.covered}/{d.total} phần nội dung đã phân bổ
              </li>
            ))}
          </ul>
          <p>
            Đây là độ bao phủ nguồn đã xử lý, không phải cam kết thành thạo mọi
            kiến thức trong thời lượng đã chọn.
          </p>
        </div>
      ))}
      <p className="hint">
        Chưa lưu vào lịch học, chưa tạo nhắc hay sự kiện Google. Xem và chỉnh
        giờ bên dưới, rồi bấm xác nhận. Bạn có thể chọn giờ tùy ý, không cần
        khai báo lại giờ rảnh. Chỉ tránh trùng các buổi trong bản nháp và lịch
        đã có.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm();
        }}
      >
        <fieldset disabled={disabled}>
          {proposal.slots.map((s, i) => (
            <div className="chat-draft-slot" key={s.requestId}>
              <label>
                Nội dung buổi {i + 1}
                <input
                  required
                  maxLength={200}
                  value={s.title}
                  onChange={(e) => patch(s.requestId, "title", e.target.value)}
                />
              </label>
              <label>
                Bắt đầu buổi {i + 1}
                <input
                  required
                  type="datetime-local"
                  value={time(s.start)}
                  onChange={(e) => {
                    if (e.target.value)
                      patch(
                        s.requestId,
                        "start",
                        DateTime.fromISO(e.target.value, { zone: ZONE })
                          .toUTC()
                          .toISO(),
                      );
                  }}
                />
              </label>
              <label>
                Kết thúc buổi {i + 1}
                <input
                  required
                  type="datetime-local"
                  value={time(s.end)}
                  onChange={(e) => {
                    if (e.target.value)
                      patch(
                        s.requestId,
                        "end",
                        DateTime.fromISO(e.target.value, { zone: ZONE })
                          .toUTC()
                          .toISO(),
                      );
                  }}
                />
              </label>
              <details>
                <summary>Kiến thức, hoạt động và nguồn buổi học</summary>
                <LessonContent
                  lesson={s.lesson}
                  onChange={(lesson) =>
                    onChange({
                      ...proposal,
                      slots: proposal.slots.map((v) =>
                        v.requestId === s.requestId
                          ? { ...v, lesson, goal: lesson.objectives.join("\n") }
                          : v,
                      ),
                    })
                  }
                />
              </details>
              <Button
                disabled={proposal.slots.length === 1}
                onClick={() =>
                  onChange({
                    ...proposal,
                    slots: proposal.slots.filter(
                      (v) => v.requestId !== s.requestId,
                    ),
                  })
                }
              >
                Bỏ buổi {i + 1}
              </Button>
            </div>
          ))}
        </fieldset>
        <div className="actions">
          <Button type="submit" variant="primary" disabled={disabled}>
            Xác nhận lưu {proposal.slots.length} buổi
          </Button>
          <Button disabled={disabled} onClick={onRestart}>
            Đổi giờ rảnh
          </Button>
        </div>
      </form>
      <p className="hint">
        Sau khi lưu, bấm Đồng bộ Google Calendar trên trang Lịch học để gửi tất
        cả buổi đã chọn một lần. Việc lưu kế hoạch không tự kết nối Google.
      </p>
    </section>
  );
}
