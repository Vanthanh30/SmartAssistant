import "./notifications.css";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck, Settings, X } from "lucide-react";
import { Button } from "../../components/ui/Button.jsx";
import { useStudyReminders } from "./useStudyReminders.js";
import { when } from "./format.js";
import {
  notificationDestination,
  notificationLabel,
  permissionLabel,
} from "./notificationModel.js";
import {
  currentPush,
  enablePush,
  disablePush,
  pushSupported,
} from "./browserPush.js";

export function StudyReminderBell({ auth }) {
  const [open, setOpen] = useState(false),
    [onlyUnread, setOnlyUnread] = useState(false);
  const [permission, setPermission] = useState(() =>
    "Notification" in window ? Notification.permission : "unsupported",
  );
  const [pushEnabled, setPushEnabled] = useState(false),
    [pushBusy, setPushBusy] = useState(false),
    [pushError, setPushError] = useState("");
  const root = useRef(null),
    trigger = useRef(null);
  const { inbox, mark, toasts, dismiss } = useStudyReminders(auth);
  const unread = inbox.data?.pages[0]?.unreadCount || 0;
  const rows = [
    ...new Map(
      (inbox.data?.pages.flatMap((p) => p.notifications) || []).map((n) => [
        n.id,
        n,
      ]),
    ).values(),
  ];
  useEffect(() => {
    if (!open) return;
    void currentPush()
      .then((s) => {
        setPushEnabled(Boolean(s));
        setPermission(
          "Notification" in window ? Notification.permission : "unsupported",
        );
      })
      .catch(() => {});
    const outside = (e) => {
      if (!root.current?.contains(e.target)) setOpen(false);
    };
    const escape = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const visit = (row) => {
    if (!row.read) mark.mutate(row.id);
    setOpen(false);
    dismiss(row.id);
  };
  const togglePush = async () => {
    setPushBusy(true);
    setPushError("");
    try {
      if (pushEnabled) {
        await disablePush(auth.csrfToken);
        setPushEnabled(false);
      } else {
        await enablePush(auth.csrfToken);
        setPushEnabled(true);
      }
    } catch (error) {
      setPushError(error.message);
    } finally {
      setPushEnabled(Boolean(await currentPush().catch(() => null)));
      setPermission(
        "Notification" in window ? Notification.permission : "unsupported",
      );
      setPushBusy(false);
    }
  };
  return (
    <div className="study-reminder-bell" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="icon-button notification-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Thông báo, ${unread} chưa đọc`}
        aria-expanded={open}
        aria-controls="study-notification-panel"
      >
        <Bell size={21} />
        {unread > 0 && (
          <span className="notification-count">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <section
          className="notification-panel"
          id="study-notification-panel"
          aria-label="Thông báo học tập"
        >
          <header>
            <div>
              <h2>Thông báo</h2>
              <p>
                {unread
                  ? `${unread} thông báo chưa đọc`
                  : "Bạn đã xem tất cả thông báo"}
              </p>
            </div>
            <button
              className="icon-button"
              aria-label="Đóng thông báo"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <X size={19} />
            </button>
          </header>
          <div className="notification-toolbar">
            <div className="notification-tabs">
              <button
                aria-pressed={!onlyUnread}
                onClick={() => setOnlyUnread(false)}
              >
                Tất cả
              </button>
              <button
                aria-pressed={onlyUnread}
                onClick={() => setOnlyUnread(true)}
              >
                Chưa đọc
              </button>
            </div>
            <button
              className="notification-read-all"
              disabled={!unread || mark.isPending}
              onClick={() => mark.mutate(null)}
            >
              <CheckCheck size={16} /> Đọc tất cả
            </button>
          </div>
          <div className="notification-list" aria-live="polite">
            {inbox.isPending ? (
              <p className="notification-empty" role="status">
                Đang tải thông báo…
              </p>
            ) : inbox.isError ? (
              <div className="notification-empty" role="alert">
                <p>Chưa tải được thông báo.</p>
                <Button onClick={() => inbox.refetch()}>Thử lại</Button>
              </div>
            ) : !rows.filter((n) => !onlyUnread || !n.read).length ? (
              <div className="notification-empty">
                <Bell size={32} />
                <strong>
                  {onlyUnread
                    ? "Không có thông báo chưa đọc"
                    : "Chưa có thông báo"}
                </strong>
                <p>Nhắc học và thay đổi lịch sẽ xuất hiện tại đây.</p>
              </div>
            ) : (
              rows
                .filter((n) => !onlyUnread || !n.read)
                .map((row) => (
                  <article
                    key={row.id}
                    className={`notification-row ${row.read ? "" : "is-unread"}`}
                  >
                    <span
                      className="notification-dot"
                      aria-label={row.read ? "Đã đọc" : "Chưa đọc"}
                    />
                    <div>
                      <span className="notification-kind">
                        {notificationLabel(row.kind)}
                      </span>
                      <Link
                        to={notificationDestination(row)}
                        onClick={() => visit(row)}
                      >
                        {row.title || row.session.title}
                      </Link>
                      <p>{when(row.session.start)}</p>
                      <small>
                        {when(row.dueAt)}
                        {row.withdrawn
                          ? " · Lịch đã thay đổi hoặc đã kết thúc"
                          : ""}
                      </small>
                      {!row.read && (
                        <button
                          className="notification-mark"
                          disabled={mark.isPending}
                          onClick={() => mark.mutate(row.id)}
                        >
                          Đánh dấu đã đọc
                        </button>
                      )}
                    </div>
                  </article>
                ))
            )}
            {inbox.hasNextPage && (
              <Button
                disabled={inbox.isFetchingNextPage}
                onClick={() => inbox.fetchNextPage()}
              >
                Xem thêm thông báo
              </Button>
            )}
          </div>
          {mark.isError && (
            <p className="field-error" role="alert">
              Chưa lưu được trạng thái đọc. Vui lòng thử lại.
            </p>
          )}
          <details className="notification-settings">
            <summary>
              <Settings size={15} /> Cài đặt nhắc học
            </summary>
            <p>
              Thông báo trình duyệt:{" "}
              <strong>{permissionLabel(permission)}</strong>
            </p>
            <p>
              Nhắc nền trên thiết bị:{" "}
              <strong>{pushEnabled ? "Đã bật" : "Chưa bật"}</strong>
            </p>
            {pushSupported() && permission !== "denied" && (
              <Button disabled={pushBusy} onClick={togglePush}>
                {pushBusy
                  ? "Đang cập nhật…"
                  : pushEnabled
                    ? "Tắt nhắc nền"
                    : "Bật nhắc khi đóng tab"}
              </Button>
            )}
            {permission === "denied" && (
              <p>
                Cho phép thông báo trong cài đặt quyền của trang trên trình
                duyệt.
              </p>
            )}
            {pushError && <p role="alert">{pushError}</p>}
            <p>
              Lịch sử được lưu tối đa 30 ngày, 200 thông báo mỗi kế hoạch. Nhắc
              nền phụ thuộc kết nối và cài đặt thiết bị. Google Calendar nhắc
              riêng các buổi đã đồng bộ.
            </p>
          </details>
          <footer>
            <Link to="/app/study-calendar" onClick={() => setOpen(false)}>
              Mở lịch học →
            </Link>
          </footer>
        </section>
      )}
      <div className="study-reminder-toasts" aria-live="polite">
        {toasts.map((row) => (
          <div className="study-reminder-toast" key={row.id}>
            <strong>{notificationLabel(row.kind)}</strong>
            <p>{row.session.title}</p>
            <div className="actions">
              <Link
                to={notificationDestination(row)}
                onClick={() => visit(row)}
              >
                {row.kind === "missed" ? "Xem buổi học" : "Học ngay"}
              </Link>
              <Button onClick={() => dismiss(row.id)}>Đóng</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
