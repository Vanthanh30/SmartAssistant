import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { Link } from "react-router-dom";
import {
  Clock3,
  BookOpen,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  X,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "../auth/useAuth.js";
import { api } from "../../lib/api.js";
import { Modal } from "../../components/Modal.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { TimeWindows } from "./TimeWindows.jsx";
import { initialPlan } from "./draft.js";
import { sessionStudyPath } from "./sessionStudyModel.js";
import { sessionPreviewModel } from "./sessionPreviewModel.js";
import { ZONE, when, weekOf } from "./dates.js";
import { calendarWrite, toSession } from "./api.js";
import { deleteStudySession } from "./deleteStudySession.js";
import { sessionAppearance } from "./sessionAppearance.js";

export function SessionDetails({
  session,
  csrfToken,
  draftPlan,
  onClose,
  onSaved,
  onEdit,
}) {
  const { data: auth } = useAuth(),
    supportsCourseBasedScheduling = auth?.schemaVersion === 16;
  const model = sessionPreviewModel(session);
  const appearance = sessionAppearance(session);
  const client = useQueryClient();
  const [moving, setMoving] = useState(false),
    [googleOpen, setGoogleOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [constraints, setConstraints] = useState(() => ({
    ...initialPlan(),
    ...(draftPlan?.free?.length ? draftPlan : {}),
    week: weekOf(session.start),
    locked: [],
  }));
  const [suggestions, setSuggestions] = useState(null);
  const saved = () => {
    onSaved();
    onClose();
  };
  const action = useMutation({
    mutationFn: ({ path, body }) =>
      calendarWrite(
        `/lich-hoc/${session.id}/${path}`,
        body || { version: session.version },
        csrfToken,
      ),
    onSuccess: saved,
  });
  const remove = useMutation({
    mutationFn: () =>
      deleteStudySession(
        session.id,
        session.version,
        (path, body, method) => calendarWrite(path, body, csrfToken, method),
        api,
      ),
    onSuccess: () => {
      client.setQueriesData(
        { queryKey: ["study-calendar", auth.user.id] },
        (data) =>
          Array.isArray(data?.sessions)
            ? {
                ...data,
                sessions: data.sessions.filter((s) => s.id !== session.id),
              }
            : data,
      );
      saved();
    },
  });
  const move = useMutation({
    mutationFn: () =>
      calendarWrite(
        `/lich-hoc/${session.id}/goi-y-doi-gio`,
        {
          constraints,
          duration: Math.max(
            1,
            Math.round(
              (new Date(session.end) - new Date(session.start)) / 60000,
            ),
          ),
        },
        csrfToken,
      ),
    onSuccess: setSuggestions,
  });
  const apply = useMutation({
    mutationFn: (slot) =>
      calendarWrite(
        `/lich-hoc/${session.id}`,
        {
          version: suggestions.version,
          session: { ...toSession(session), start: slot.start, end: slot.end },
        },
        csrfToken,
        "PATCH",
      ),
    onSuccess: saved,
  });
  const openGoogle = useMutation({
    mutationFn: () =>
      calendarWrite(`/lich-hoc/${session.id}/mo-google`, {}, csrfToken),
    onSuccess: (data) => {
      const url = new URL(data.url);
      if (
        url.protocol === "https:" &&
        ((url.hostname === "calendar.google.com" &&
          /^\/calendar(?:\/|$)/.test(url.pathname)) ||
          (url.hostname === "www.google.com" &&
            /^\/calendar\/(?:event|render)(?:\/|$)/.test(url.pathname)))
      )
        window.location.assign(url.href);
    },
  });
  const google = useQuery({
    queryKey: ["study-calendar", "google-for-session", session.id],
    enabled: googleOpen,
    queryFn: ({ signal }) => api("/ket-noi/google", { signal }),
    retry: false,
  });
  const sync = useMutation({
    mutationFn: () =>
      supportsCourseBasedScheduling
        ? calendarWrite(
            `/lich-hoc/${session.id}/thu-dong-bo`,
            { version: session.version, intent: "sync" },
            csrfToken,
          )
        : calendarWrite(
            `/lich-hoc/${session.id}`,
            {
              version: session.version,
              session: { ...toSession(session), googleSync: true },
            },
            csrfToken,
            "PATCH",
          ),
    onSuccess: saved,
  });
  const busy =
    remove.isPending ||
    action.isPending ||
    apply.isPending ||
    sync.isPending ||
    move.isPending ||
    openGoogle.isPending;
  const error =
    remove.error ||
    sync.error ||
    action.error ||
    move.error ||
    apply.error ||
    openGoogle.error;
  const from = DateTime.fromISO(session.start, { zone: ZONE }).setLocale("vi");
  const to = DateTime.fromISO(session.end, { zone: ZONE });
  const synced = session.syncStatus === "synced";
  return (
    <Modal
      open
      className="session-preview-modal"
      title={session.title}
      description="Thông tin buổi học"
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <Button
        className="session-preview-close"
        aria-label="Đóng chi tiết buổi học"
        disabled={busy}
        onClick={onClose}
      >
        <X size={19} />
      </Button>
      <div className="session-preview-badges">
        <span className={`session-state ${appearance.state}`}>
          {session.status === "completed" && <CheckCircle2 size={14} />}
          {appearance.label}
        </span>
        {synced && (
          <span className="session-google-badge">Đã đồng bộ Google</span>
        )}
      </div>
      <div className="session-preview-time">
        <Clock3 size={20} />
        <div>
          <strong>{from.toFormat("cccc, dd/LL/yyyy")}</strong>
          <span>
            {from.toFormat("HH:mm")} – {to.toFormat("HH:mm")} ·{" "}
            {Math.round(to.diff(from, "minutes").minutes)} phút
          </span>
        </div>
      </div>
      {session.movedAt && session.status === "planned" && (
        <p className="hint">
          Đã dời lịch
          {session.moveHistory?.at(-1)?.from?.start
            ? ` từ ${when(session.moveHistory.at(-1).from.start)}`
            : ""}
          .
        </p>
      )}
      <section className="session-preview-content">
        <h3>Học gì trong buổi này?</h3>
        {model.objectives.length ? (
          <ul>
            {model.objectives.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        ) : (
          <p>
            {model.goal ||
              "Đọc tài liệu và luyện tập theo phạm vi đã lên lịch."}
          </p>
        )}
        {model.resources.length > 0 && (
          <div className="session-preview-sources">
            {model.resources.map((r, i) => (
              <p key={i}>
                <BookOpen size={16} />
                <span>
                  {r.fileName}
                  <small>
                    Trang{" "}
                    {r.ranges
                      ? r.ranges
                          .map(([from, to]) =>
                            from === to ? from : `${from}–${to}`,
                          )
                          .join(", ")
                      : `${r.pageFrom}–${r.pageTo}`}
                  </small>
                </span>
              </p>
            ))}
            {model.extraResources > 0 && (
              <small>
                Và {model.extraResources} phần tài liệu khác trong buổi học.
              </small>
            )}
          </div>
        )}
        {session.lesson?.topics?.length > 0 && (
          <details>
            <summary>
              Xem {session.lesson.topics.length} nhóm kiến thức trong buổi
            </summary>
            <ul>
              {session.lesson.topics.map((topic, i) => (
                <li key={i}>{topic.title}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
      <div className="session-preview-primary">
        {model.canStudy && (
          <Link
            className="button-link session-study-link"
            to={sessionStudyPath(session.id)}
            onClick={onClose}
          >
            Học ngay <ArrowRight size={17} />
          </Link>
        )}
        {model.canEdit && (
          <Button disabled={busy} onClick={() => setMoving((v) => !v)}>
            <CalendarClock size={17} />
            {moving ? "Đóng phần dời lịch" : "Dời lịch"}
          </Button>
        )}
      </div>
      {moving && (
        <section className="session-move-panel">
          <h3>Chọn thời gian thay thế</h3>
          <p>
            Chọn giờ bạn rảnh. Lịch chỉ thay đổi sau khi bạn xác nhận một khung
            giờ.
          </p>
          <label>
            Tuần học
            <input
              type="date"
              value={constraints.week}
              onChange={(e) => {
                if (e.target.value) {
                  setConstraints((v) => ({
                    ...v,
                    week: weekOf(e.target.value),
                    studyFrom: undefined,
                    studyTo: undefined,
                  }));
                  setSuggestions(null);
                }
              }}
            />
          </label>
          <TimeWindows
            title="Giờ có thể học"
            values={constraints.free}
            onChange={(free) => {
              setConstraints((v) => ({ ...v, free }));
              setSuggestions(null);
            }}
          />
          <details>
            <summary>Giờ bận cần loại trừ</summary>
            <TimeWindows
              title="Giờ bận"
              values={constraints.busy}
              onChange={(busy) => {
                setConstraints((v) => ({ ...v, busy }));
                setSuggestions(null);
              }}
            />
          </details>
          <Button
            disabled={busy || !constraints.free.length}
            onClick={() => move.mutate()}
          >
            {move.isPending ? "Đang tìm giờ…" : "Tìm giờ phù hợp"}
          </Button>
          {suggestions && !suggestions.slots.length && (
            <p role="status">Chưa có khung phù hợp. Bạn hãy thêm giờ rảnh.</p>
          )}
          {suggestions?.slots.map((slot) => (
            <div className="session-move-option" key={slot.requestId}>
              <span>
                {when(slot.start)} –{" "}
                {DateTime.fromISO(slot.end, { zone: ZONE }).toFormat("HH:mm")}
              </span>
              <Button disabled={busy} onClick={() => apply.mutate(slot)}>
                Xác nhận dời
              </Button>
            </div>
          ))}
        </section>
      )}
      {session.status === "cancelled" && (
        <section className="session-delete-panel">
          {confirmDelete ? (
            <>
              <h3>Xóa vĩnh viễn buổi học?</h3>
              <p>
                Buổi học sẽ được gỡ khỏi lịch và thông báo.{" "}
                {session.googleSync
                  ? "Sự kiện Google của buổi này cũng sẽ được gỡ trước khi xóa. "
                  : ""}
                PDF và các bộ quiz/flashcard đã lưu được giữ nguyên.
              </p>
              <div className="actions">
                <Button disabled={busy} onClick={() => setConfirmDelete(false)}>
                  Giữ lại
                </Button>
                <Button
                  className="session-danger"
                  disabled={busy}
                  onClick={() => remove.mutate()}
                >
                  {remove.isPending ? "Đang xóa…" : "Xác nhận xóa buổi học"}
                </Button>
              </div>
            </>
          ) : (
            <Button
              className="session-danger"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              Xóa buổi học
            </Button>
          )}
        </section>
      )}
      {model.canEdit && (
        <div className="session-preview-secondary">
          <details className="session-options">
            <summary>
              Thao tác khác <ChevronDown size={15} />
            </summary>
            <div>
              {model.canEdit && (
                <>
                  <Button disabled={busy} onClick={onEdit}>
                    Sửa nội dung buổi
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => action.mutate({ path: "hoan-thanh" })}
                  >
                    Đánh dấu hoàn thành
                  </Button>
                  <Button
                    className="session-danger"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Hủy buổi học này? Bạn có thể gỡ sự kiện Google riêng trong phần Google Calendar.",
                        )
                      )
                        action.mutate({ path: "huy" });
                    }}
                  >
                    Hủy buổi học
                  </Button>
                </>
              )}
              {!model.canEdit && (
                <p>
                  Buổi này đã{" "}
                  {session.status === "completed" ? "hoàn thành" : "hủy"}.
                </p>
              )}
            </div>
          </details>
        </div>
      )}
      <section className="session-preview-google">
        <button
          type="button"
          aria-expanded={googleOpen}
          onClick={() => setGoogleOpen((v) => !v)}
        >
          <span>
            Google Calendar
            <small>
              {synced
                ? "Đã đồng bộ"
                : session.googleSync
                  ? "Có sự kiện cần kiểm tra"
                  : "Chưa đồng bộ"}
            </small>
          </span>
          <ChevronDown size={17} />
        </button>
        {googleOpen && (
          <div className="session-google-options">
            {model.canOpenGoogle && (
              <Button disabled={busy} onClick={() => openGoogle.mutate()}>
                Mở trên Google <ExternalLink size={15} />
              </Button>
            )}
            {google.isPending ? (
              <p>Đang kiểm tra kết nối…</p>
            ) : google.isError ? (
              <p role="alert">
                Chưa kiểm tra được kết nối.{" "}
                <Button onClick={() => google.refetch()}>Thử lại</Button>
              </p>
            ) : !google.data?.configured ||
              google.data?.status !== "connected" ? (
              <p>
                Kết nối Google để quản lý đồng bộ.{" "}
                <Link
                  to="/app/study-calendar#google-calendar"
                  onClick={onClose}
                >
                  Xem kết nối
                </Link>
              </p>
            ) : (
              <>
                {!synced && session.status !== "cancelled" && (
                  <Button disabled={busy} onClick={() => sync.mutate()}>
                    {model.needsSyncRetry
                      ? "Kiểm tra / thử đồng bộ lại"
                      : "Đồng bộ buổi này"}
                  </Button>
                )}
                {session.googleSync && !model.needsDeleteRetry && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Gỡ sự kiện khỏi Google và giữ buổi học trong ứng dụng?",
                        )
                      )
                        action.mutate({ path: "ngung-dong-bo" });
                    }}
                  >
                    Gỡ khỏi Google
                  </Button>
                )}
                {model.needsDeleteRetry && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      action.mutate({
                        path: "thu-dong-bo",
                        body: { version: session.version, intent: "delete" },
                      })
                    }
                  >
                    Tiếp tục gỡ sự kiện
                  </Button>
                )}
                {session.syncStatus === "error" && (
                  <details>
                    <summary>Sự kiện đã bị xóa trên Google?</summary>
                    <Button
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Kiểm tra và tạo lại chỉ khi sự kiện cũ đã bị xóa trên Google?",
                          )
                        )
                          action.mutate({
                            path: "thu-dong-bo",
                            body: {
                              version: session.version,
                              recreate: true,
                              intent: "sync",
                            },
                          });
                      }}
                    >
                      Kiểm tra và tạo lại sự kiện
                    </Button>
                  </details>
                )}
              </>
            )}
          </div>
        )}
      </section>
      {error && (
        <p role="alert" className="field-error">
          {error.message}
          <Button
            onClick={() => {
              onSaved();
              onClose();
            }}
          >
            Tải lại lịch
          </Button>
        </p>
      )}
    </Modal>
  );
}
