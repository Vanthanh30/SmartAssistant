import { lazy, Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { useSearchParams, useLocation } from "react-router-dom";
import {
  CalendarDays,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  RotateCw,
  Clock3,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { useAuth } from "../auth/useAuth.js";
import { Modal } from "../../components/Modal.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { StatusPanel } from "../../components/StatusPanel.jsx";
import { GoogleConnectionPanel } from "./GoogleConnectionPanel.jsx";
import { BulkGoogleSync } from "./BulkGoogleSync.jsx";
import { StudySessionForm } from "./StudySessionForm.jsx";
import { SessionDetails } from "./SessionDetails.jsx";
import { calendarKey, loadSessions } from "./api.js";
import { ZONE, localNow, rangeFor, when, businessLabels } from "./dates.js";
const CalendarView = lazy(() =>
  import("./CalendarView.jsx").then((m) => ({ default: m.CalendarView })),
);
const SchedulingChat = lazy(() =>
  import("./SchedulingChat.jsx").then((m) => ({ default: m.SchedulingChat })),
);

export function StudyCalendarPage() {
  const { data: auth } = useAuth(),
    client = useQueryClient();
  const [params, setParams] = useSearchParams(),
    location = useLocation();
  const [date, setDate] = useState(() =>
    /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "") &&
    DateTime.fromISO(params.get("date"), { zone: ZONE }).isValid
      ? params.get("date")
      : localNow().toISODate(),
  );
  const [view, setView] = useState(() =>
    matchMedia("(max-width:650px)").matches ? "listWeek" : "timeGridWeek",
  );
  const [chat, setChat] = useState(false),
    [chatBusy, setChatBusy] = useState(false),
    [filters, setFilters] = useState(false);
  const [courseId, setCourse] = useState(""),
    [status, setStatus] = useState(""),
    [form, setForm] = useState(null),
    [selected, setSelected] = useState(null);
  const range = rangeFor(date, view);
  const query = useQuery({
    queryKey: [
      ...calendarKey(auth.user.id),
      "sessions",
      range,
      courseId,
      status,
    ],
    queryFn: ({ signal }) =>
      loadSessions(
        {
          ...range,
          ...(courseId ? { courseId } : {}),
          ...(status ? { status } : {}),
        },
        signal,
      ),
    retry: false,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const courses = useQuery({
    queryKey: [...calendarKey(auth.user.id), "courses"],
    queryFn: async ({ signal }) => {
      const rows = [];
      for (let page = 1; page <= 20; page++) {
        const result = await api(`/courses?page=${page}&pageSize=50`, {
          signal,
          envelope: true,
        });
        rows.push(...result.data);
        if (rows.length >= result.meta.total) break;
      }
      return rows;
    },
    retry: false,
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: calendarKey(auth.user.id) });
  const navigate = (direction) =>
    setDate(
      DateTime.fromISO(date, { zone: ZONE })
        .plus(
          view === "dayGridMonth"
            ? { months: direction }
            : { weeks: direction },
        )
        .toISODate(),
    );
  const sessions = query.data?.sessions || [],
    day = DateTime.fromISO(date, { zone: ZONE }),
    week = day.startOf("week");
  const weekSessions = sessions.filter(
    (s) =>
      DateTime.fromISO(s.start, { zone: ZONE }) >= week &&
      DateTime.fromISO(s.start, { zone: ZONE }) < week.plus({ weeks: 1 }) &&
      s.status !== "cancelled",
  );
  const completed = weekSessions.filter((s) => s.status === "completed").length;
  const upcoming = sessions
    .filter(
      (s) =>
        s.status === "planned" &&
        new Date(s.end) > new Date(query.data?.serverNow || 0),
    )
    .slice(0, 5);
  const hours = weekSessions.reduce(
    (n, s) => n + (new Date(s.end) - new Date(s.start)) / 3600000,
    0,
  );
  const rangeLabel =
    view === "dayGridMonth"
      ? day.setLocale("vi").toFormat("LLLL yyyy")
      : `${week.toFormat("dd/LL")} – ${week.plus({ days: 6 }).toFormat("dd/LL/yyyy")}`;
  return (
    <section className="study-calendar-page calendar-hub">
      <header className="calendar-hub-heading">
        <div>
          <span className="session-eyebrow">KẾ HOẠCH CÁ NHÂN</span>
          <h1>
            <CalendarDays size={28} />
            Lịch học
          </h1>
          <p>Sắp xếp việc học theo từng buổi, bắt đầu từ tài liệu của bạn.</p>
        </div>
        <div className="actions">
          <BulkGoogleSync sessions={sessions} auth={auth} onChanged={refresh} />
          <Button variant="primary" onClick={() => setChat(true)}>
            <Sparkles size={18} />
            Lên lịch qua chat
          </Button>
        </div>
      </header>
      {params.get("google") && (
        <p role="status" className="session-notice">
          {params.get("google") === "connected"
            ? "Đã quay lại từ Google. Mở phần kết nối bên dưới để kiểm tra."
            : "Chưa hoàn tất kết nối Google. Bạn có thể thử lại bên dưới."}
          <Button
            onClick={() =>
              setParams(
                (previous) => {
                  const next = new URLSearchParams(previous);
                  next.delete("google");
                  return next;
                },
                { replace: true },
              )
            }
          >
            Ẩn thông báo
          </Button>
        </p>
      )}
      <div className="calendar-week-stats" aria-label="Tổng quan tuần đang xem">
        <div>
          <CalendarDays size={19} />
          <span>
            <strong>{query.isPending ? "—" : weekSessions.length}</strong> buổi
            trong tuần
          </span>
        </div>
        <div>
          <CheckCircle2 size={19} />
          <span>
            <strong>{query.isPending ? "—" : completed}</strong> đã hoàn thành
          </span>
        </div>
        <div>
          <Clock3 size={19} />
          <span>
            <strong>
              {query.isPending
                ? "—"
                : new Intl.NumberFormat("vi-VN", {
                    maximumFractionDigits: 1,
                  }).format(hours)}
            </strong>{" "}
            giờ học dự kiến
          </span>
        </div>
      </div>
      <div className="calendar-hub-controls">
        <div className="calendar-period">
          <Button aria-label="Khoảng trước" onClick={() => navigate(-1)}>
            <ChevronLeft size={18} />
          </Button>
          <strong>{rangeLabel}</strong>
          <Button aria-label="Khoảng sau" onClick={() => navigate(1)}>
            <ChevronRight size={18} />
          </Button>
          <Button onClick={() => setDate(localNow().toISODate())}>
            Hôm nay
          </Button>
        </div>
        <div
          className="calendar-hub-views"
          role="group"
          aria-label="Chế độ xem"
        >
          {[
            ["timeGridWeek", "Tuần"],
            ["dayGridMonth", "Tháng"],
            ["listWeek", "Danh sách"],
          ].map(([id, text]) => (
            <button
              type="button"
              key={id}
              aria-pressed={view === id}
              onClick={() => setView(id)}
            >
              {text}
            </button>
          ))}
        </div>
        <Button aria-expanded={filters} onClick={() => setFilters((v) => !v)}>
          <SlidersHorizontal size={16} />
          Bộ lọc{courseId || status ? " · đang lọc" : ""}
        </Button>
        <Button
          aria-label="Làm mới lịch"
          disabled={query.isFetching}
          onClick={refresh}
        >
          <RotateCw size={16} />
        </Button>
      </div>
      {filters && (
        <div className="calendar-hub-filters">
          <label>
            Môn học
            <select
              aria-label="Môn học"
              value={courseId}
              onChange={(e) => setCourse(e.target.value)}
            >
              <option value="">Tất cả môn</option>
              {courses.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Trạng thái
            <select
              aria-label="Trạng thái"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              {Object.entries(businessLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Button
            onClick={() => {
              setCourse("");
              setStatus("");
            }}
          >
            Xóa bộ lọc
          </Button>
        </div>
      )}
      {courses.isError && (
        <p role="alert">
          Chưa tải được các môn học.{" "}
          <Button onClick={() => courses.refetch()}>Thử lại</Button>
        </p>
      )}
      <div className="calendar-workspace">
        <div className="calendar-main">
          {query.isPending ? (
            <StatusPanel title="Đang tải lịch học…" />
          ) : query.isError ? (
            <StatusPanel
              title="Chưa tải được lịch"
              retry={() => query.refetch()}
            >
              <p>{query.error.message}</p>
            </StatusPanel>
          ) : (
            <>
              {!sessions.length && (
                <div className="calendar-hub-empty">
                  <CalendarDays size={26} />
                  <div>
                    <strong>
                      {courseId || status
                        ? "Chưa có buổi phù hợp bộ lọc"
                        : "Tuần này chưa có buổi học"}
                    </strong>
                    <p>
                      {courseId || status
                        ? "Thử đổi môn hoặc trạng thái để xem thêm buổi học."
                        : "Trò chuyện với trợ lý để chia nội dung và chọn giờ học phù hợp."}
                    </p>
                  </div>
                </div>
              )}
              <Suspense fallback={<p role="status">Đang mở lịch…</p>}>
                <CalendarView
                  date={date}
                  view={view}
                  sessions={sessions}
                  onSelect={setSelected}
                />
              </Suspense>
              <p className="calendar-hub-help">
                Chọn một buổi để xem nội dung, bắt đầu học hoặc dời lịch.
              </p>
              <div
                className="calendar-color-legend"
                aria-label="Màu trạng thái buổi học"
              >
                <span>
                  <i className="planned" />
                  Chưa học
                </span>
                <span>
                  <i className="moved" />
                  Đã dời lịch
                </span>
                <span>
                  <i className="completed" />
                  Đã hoàn thành
                </span>
                <span>
                  <i className="cancelled" />
                  Đã hủy
                </span>
              </div>
            </>
          )}
        </div>
        <aside className="calendar-upcoming">
          <header>
            <h2>Buổi sắp tới</h2>
            <span>{upcoming.length}</span>
          </header>
          {!upcoming.length ? (
            <p className="hint">Chưa có buổi sắp tới trong khoảng đang xem.</p>
          ) : (
            upcoming.map((s) => (
              <button
                type="button"
                className="calendar-upcoming-item"
                key={s.id}
                onClick={() => setSelected(s)}
              >
                <span className="upcoming-date">
                  {DateTime.fromISO(s.start, { zone: ZONE }).toFormat("dd/LL")}
                </span>
                <span>
                  <strong>{s.title}</strong>
                  <small>
                    {when(s.start)} ·{" "}
                    {Math.round((new Date(s.end) - new Date(s.start)) / 60000)}{" "}
                    phút
                  </small>
                </span>
                <ArrowRight size={16} />
              </button>
            ))
          )}
          <div className="calendar-week-progress">
            <span>Tiến độ tuần</span>
            <strong>
              {completed}/{weekSessions.length} buổi
            </strong>
            <progress
              max={Math.max(1, weekSessions.length)}
              value={completed}
            />
          </div>
        </aside>
      </div>
      <details
        className="calendar-connection-details"
        open={location.hash === "#google-calendar" || undefined}
      >
        <summary>
          Google Calendar <span>Quản lý kết nối và đồng bộ</span>
        </summary>
        <GoogleConnectionPanel
          owner={auth.user.id}
          csrfToken={auth.csrfToken}
          onChanged={refresh}
        />
      </details>
      {chat && (
        <Suspense fallback={<p>Đang mở trợ lý…</p>}>
          <Modal
            open
            title="Lên lịch cùng trợ lý"
            description="Chọn tài liệu, mục tiêu và giờ rảnh. Bạn sẽ xem từng buổi trước khi xác nhận lưu."
            className="calendar-chat-modal"
            onOpenChange={(value) => {
              if (!chatBusy) setChat(value);
            }}
          >
            <SchedulingChat
              auth={auth}
              courses={courses.data || []}
              onPendingChange={setChatBusy}
              onClose={(chosenWeek) => {
                setChat(false);
                if (chosenWeek) setDate(chosenWeek);
                refresh();
              }}
            />
          </Modal>
        </Suspense>
      )}
      {form && (
        <StudySessionForm
          session={form}
          courses={courses.data || []}
          csrfToken={auth.csrfToken}
          onClose={() => setForm(null)}
          onSaved={refresh}
        />
      )}
      {selected && (
        <SessionDetails
          key={selected.id}
          session={selected}
          csrfToken={auth.csrfToken}
          onClose={() => setSelected(null)}
          onSaved={refresh}
          onEdit={() => {
            setForm(selected);
            setSelected(null);
          }}
        />
      )}
    </section>
  );
}
