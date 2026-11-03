import { PlanDocuments } from "./PlanDocuments.jsx";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/Button.jsx";
import { calendarWrite, calendarKey, toSession } from "./api.js";
import { initialPlan } from "./draft.js";
import { localNow } from "./dates.js";
import { ChatDraftPreview } from "./ChatDraftPreview.jsx";
import { plain, workload, windows } from "./chatPlan.js";

const prompts = {
  course: "Bạn muốn lên lịch cho môn nào?",
  work: "Bạn muốn học nội dung gì, bao nhiêu buổi và mỗi buổi bao lâu? Ví dụ: Ôn chương 1, 3 buổi, 60 phút.",
  week: "Bạn muốn học tuần này hay tuần sau?",
  free: "Bạn rảnh những ngày nào, từ mấy giờ đến mấy giờ? Ví dụ: Thứ 2, 4, 6 từ 19:00 đến 21:00.",
  busy: "Trong các giờ vừa chọn, có khung nào bạn bận cần loại ra không? Nếu không, chọn Không có.",
  reminder:
    "Bạn muốn nhắc trước bao lâu? Chọn bên dưới để tôi tạo bản nháp cho bạn xem trước. Chỉ khi bạn bấm xác nhận, lịch mới được lưu.",
};
function QuickReplies({ options, onChoose }) {
  return options.map((v) => (
    <Button key={String(v.value)} onClick={() => onChoose(v.value)}>
      {v.label}
    </Button>
  ));
}
export function SchedulingChat({
  courseId = null,
  courses = [],
  auth,
  onClose,
  onPendingChange = () => {},
}) {
  const navigate = useNavigate(),
    client = useQueryClient(),
    lock = useRef(false),
    bottom = useRef(null);
  const [attempt, setAttempt] = useState(null);
  const [step, setStep] = useState(courseId ? "work" : "course"),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [proposal, setProposal] = useState(null);
  const [plan, setPlan] = useState(() => ({
    ...initialPlan(),
    goals: [
      {
        courseId,
        goal: "Ôn tập",
        sessions: 3,
        duration: 60,
        priority: "normal",
      },
    ],
    maxSessionsPerDay: 1,
    maxMinutesPerDay: 180,
  }));
  const [messages, setMessages] = useState([
    { role: "user", text: "Lên lịch học" },
    { role: "assistant", text: prompts[courseId ? "work" : "course"] },
  ]);
  useEffect(() => {
    if (bottom.current) bottom.current.scrollTop = bottom.current.scrollHeight;
  }, [messages, pending]);
  function next(answer, key, patch = {}) {
    setMessages((m) => [
      ...m,
      { role: "user", text: answer },
      { role: "assistant", text: prompts[key] },
    ]);
    setPlan((p) => ({ ...p, ...patch }));
    setStep(key);
    setText("");
    setError("");
  }
  async function save(payload) {
    await calendarWrite(
      "/lich-hoc/xac-nhan",
      { constraints: payload.constraints, slots: payload.slots },
      auth.csrfToken,
    );
    await client.invalidateQueries({ queryKey: calendarKey(auth.user.id) });
    navigate(`/app/study-calendar?date=${payload.constraints.week}`);
    onClose(payload.constraints.week);
  }
  async function generate(minutes) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    onPendingChange(true);
    setError("");
    try {
      const constraints = { ...plan, reminderMinutes: minutes };
      const data = await calendarWrite(
        "/lich-hoc/goi-y",
        constraints,
        auth.csrfToken,
      );
      const slots = data.slots.map((s) => ({
        ...toSession(s),
        requestId: crypto.randomUUID(),
        locked: false,
        exceptionConfirmed: false,
      }));
      const payload = {
        constraints,
        slots,
        unscheduledLessons: data.unscheduledLessons || [],
        coverage: data.coverage || [],
      };
      setAttempt(null);
      if (data.errors.length || !slots.length) {
        setAttempt(null);
        throw Error(
          "Chưa tìm được giờ phù hợp. Hãy đổi hoặc mở rộng giờ rảnh; hệ thống không tự giảm thời lượng hay xếp ngoài giờ bạn chọn.",
        );
      }
      setProposal(payload);
      setStep("preview");
      setText("");
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: `Đã tạo bản nháp ${slots.length}/${constraints.goals[0].sessions} buổi${data.summary.some((s) => s.missing) ? "; còn thiếu giờ rảnh để xếp đủ" : ""}. Bạn xem và chỉnh bên dưới. Chưa lưu lịch; cần bấm Xác nhận.`,
        },
      ]);
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setPending(false);
      onPendingChange(false);
    }
  }
  async function retrySave() {
    if (lock.current) return;
    const payload = attempt || proposal;
    if (!payload) return;
    lock.current = true;
    setAttempt(payload);
    setPending(true);
    onPendingChange(true);
    setError("");
    try {
      await save(payload);
    } catch (e) {
      setError(e.message);
      if (e.status >= 400 && e.status < 500 && e.status !== 408)
        setAttempt(null);
    } finally {
      lock.current = false;
      setPending(false);
      onPendingChange(false);
    }
  }
  function answer(value) {
    if (pending) return;
    try {
      if (step === "work") {
        if (auth.schemaVersion === 16 && !plan.goals[0].documentId)
          throw Error("Chọn tài liệu và khoảng trang trước khi tiếp tục.");
        const goal = workload(value);
        next(value, "week", { goals: [{ ...plan.goals[0], ...goal }] });
      } else if (step === "week") {
        const input = plain(value);
        if (!/tuan (nay|sau|toi)/.test(input))
          throw Error("Chọn Tuần này hoặc Tuần sau.");
        next(value, "free", {
          week: localNow()
            .startOf("week")
            .plus({ weeks: /sau|toi/.test(input) ? 1 : 0 })
            .toISODate(),
        });
      } else if (step === "free") next(value, "busy", { free: windows(value) });
      else if (step === "busy")
        next(value, "reminder", {
          busy: /^(khong|khong co|bo qua)[.!]?$/.test(plain(value).trim())
            ? []
            : windows(value),
        });
      else if (step === "reminder") {
        const n = plain(value).trim();
        const minutes = /^khong/.test(n)
          ? null
          : Number(n.replace(/\s*phut\s*$/, ""));
        if (![null, 0, 10, 15, 30, 60].includes(minutes))
          throw Error("Chọn Không, 0, 10, 15, 30 hoặc 60 phút.");
        void generate(minutes);
      }
    } catch (e) {
      setError(e.message);
    }
  }
  const uncertain = !!attempt && !!error;
  return (
    <section className="scheduling-chat" aria-label="Trò chuyện lên lịch học">
      <header>
        <strong>Lên lịch cùng trợ lý</strong>
        <Button disabled={pending} onClick={() => onClose()}>
          Đóng
        </Button>
      </header>
      <div ref={bottom} className="scheduling-messages" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`scheduling-message ${m.role}`}>
            <span>{m.role === "user" ? "Bạn" : "Trợ lý"}</span>
            <p>{m.text}</p>
          </div>
        ))}
      </div>
      {auth.schemaVersion === 16 && step === "work" && (
        <PlanDocuments
          value={plan.goals[0]}
          onChange={(value) => setPlan((p) => ({ ...p, goals: [value] }))}
        />
      )}
      {step === "course" && (
        <div className="scheduling-options">
          {courses.map((c) => (
            <Button
              key={c.id}
              onClick={() =>
                next(c.name, "work", {
                  goals: [{ ...plan.goals[0], courseId: c.id }],
                })
              }
            >
              {c.name}
            </Button>
          ))}
          {!(auth.schemaVersion === 16) && (
            <Button onClick={() => next("Học tự do", "work")}>Học tự do</Button>
          )}
        </div>
      )}
      {!pending && !uncertain && (
        <div className="scheduling-options">
          {step === "week" && (
            <QuickReplies
              options={["Tuần này", "Tuần sau"].map((v) => ({
                label: v,
                value: v,
              }))}
              onChoose={answer}
            />
          )}
          {step === "free" && (
            <Button onClick={() => answer("Hằng ngày 19–21")}>
              Hằng ngày 19–21
            </Button>
          )}
          {step === "busy" && (
            <Button onClick={() => answer("Không có")}>Không có</Button>
          )}
          {step === "reminder" && (
            <QuickReplies
              options={[null, 10, 15, 30, 60].map((n) => ({
                value: n,
                label: n === null ? "Không nhắc trước" : `${n} phút`,
              }))}
              onChoose={generate}
            />
          )}
        </div>
      )}
      {proposal && (
        <ChatDraftPreview
          proposal={proposal}
          onChange={setProposal}
          disabled={pending || uncertain}
          onConfirm={retrySave}
          onRestart={() => {
            setAttempt(null);
            setProposal(null);
            setError("");
            next("Đổi giờ rảnh", "free");
          }}
        />
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {uncertain ? (
        <Button disabled={pending} onClick={retrySave}>
          Kiểm tra / lưu lại cùng yêu cầu
        </Button>
      ) : (
        !proposal &&
        step !== "course" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              answer(text.trim());
            }}
          >
            <label htmlFor="scheduling-reply">Trả lời trợ lý</label>
            <div className="scheduling-compose">
              <input
                autoFocus
                id="scheduling-reply"
                value={text}
                maxLength={500}
                disabled={pending}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  step === "work"
                    ? "Ôn chương 1, 3 buổi, 60 phút"
                    : "Nhập câu trả lời…"
                }
              />
              <Button
                type="submit"
                variant="primary"
                disabled={pending || !text.trim()}
              >
                Gửi
              </Button>
            </div>
          </form>
        )
      )}
      {pending && <p role="status">Đang xử lý yêu cầu…</p>}
      {error && !attempt && !proposal && (
        <Button onClick={() => next("Đổi giờ rảnh", "free")}>
          Khai báo lại giờ rảnh
        </Button>
      )}
      <p className="hint">
        Giờ Việt Nam · Gợi ý ban đầu tối đa 1 buổi/ngày, nghỉ 10 phút giữa buổi.
        Bạn được sửa giờ tùy ý; khi xác nhận chỉ kiểm tra thời gian hợp lệ và
        trùng lịch; không đọc giờ bận từ Google. Bạn có thể sửa hoặc hủy sau khi
        lưu.
      </p>
    </section>
  );
}
