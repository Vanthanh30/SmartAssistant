import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";
import { Modal } from "../../components/Modal.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { calendarWrite } from "./api.js";
import { when } from "./format.js";
import { syncCandidates, syncSelectedSessions } from "./bulkSync.js";

export function BulkGoogleSync({ sessions, auth, onChanged }) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState([]),
    [results, setResults] = useState({}),
    [running, setRunning] = useState(false);
  const [available, setAvailable] = useState([]),
    [scope, setScope] = useState("visible"),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const stop = useRef(false),
    lock = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  const candidates = syncCandidates(available);
  const connection = useQuery({
    queryKey: ["study-calendar", auth.user.id, "google"],
    queryFn: ({ signal }) => api("/ket-noi/google", { signal }),
    enabled: open,
    retry: false,
  });
  const connected =
    connection.data?.status === "connected" && connection.data?.configured;
  async function run(retry = false) {
    if (lock.current) return;
    lock.current = true;
    stop.current = false;
    setRunning(true);
    const chosen = available.filter(
      (s) =>
        selected.includes(s.id) &&
        results[s.id]?.status !== "success" &&
        (!retry || results[s.id]?.status === "error"),
    );
    try {
      await syncSelectedSessions(
        chosen,
        async (path, body) => {
          if (retry) {
            const latest = await api(path.replace("/thu-dong-bo", ""));
            if (latest.status === "cancelled")
              throw Error("Buổi học đã hủy, không đồng bộ.");
            setAvailable((rows) =>
              rows.map((s) => (s.id === latest.id ? latest : s)),
            );
            if (latest.syncStatus === "synced")
              return { ...latest, googleConfirmed: true };
            body = { ...body, version: latest.version };
          }
          return calendarWrite(path, body, auth.csrfToken);
        },
        (id, result) => {
          setResults((old) => ({ ...old, [id]: result }));
          if (result.status === "success")
            setAvailable((rows) =>
              rows.map((s) => (s.id === id ? result.session : s)),
            );
        },
        () => stop.current,
      );
    } finally {
      setRunning(false);
      lock.current = false;
      await onChanged();
    }
  }
  const succeeded = Object.values(results).filter(
      (r) => r.status === "success",
    ).length,
    failed = Object.values(results).filter((r) => r.status === "error").length;
  return (
    <>
      <Button
        onClick={() => {
          setAvailable(sessions);
          setScope("visible");
          setSelected(syncCandidates(sessions).map((s) => s.id));
          setResults({});
          setError("");
          setOpen(true);
        }}
      >
        Đồng bộ Google Calendar
      </Button>
      <Modal
        open={open}
        onOpenChange={(value) => {
          if (!running) setOpen(value);
        }}
        title="Đồng bộ nhiều buổi học"
        description="Chọn các buổi đang xem hoặc tất cả buổi đã lưu để gửi lên Google Calendar. Các buổi đã đồng bộ được giữ nguyên."
        className="bulk-google-modal"
      >
        {connection.isPending ? (
          <p role="status">Đang kiểm tra kết nối…</p>
        ) : connection.isError ? (
          <p role="alert">
            Chưa kiểm tra được kết nối.{" "}
            <Button onClick={() => connection.refetch()}>Thử lại</Button>
          </p>
        ) : !connected ? (
          <p role="alert">
            Bạn cần kết nối Google Calendar trước.{" "}
            <a href="#google-calendar" onClick={() => setOpen(false)}>
              Mở phần kết nối
            </a>
          </p>
        ) : (
          <p>
            Đồng bộ vào tài khoản: <strong>{connection.data.email}</strong>
          </p>
        )}
        <label>
          Phạm vi đồng bộ
          <select
            value={scope}
            disabled={running || loading}
            onChange={async (e) => {
              const value = e.target.value;
              setScope(value);
              setResults({});
              setError("");
              setLoading(true);
              setSelected([]);
              try {
                const rows =
                  value === "all"
                    ? (await api("/lich-hoc/can-dong-bo")).sessions
                    : sessions;
                setAvailable(rows);
                setSelected(syncCandidates(rows).map((s) => s.id));
              } catch (e) {
                setAvailable([]);
                setError(e.message);
              } finally {
                setLoading(false);
              }
            }}
          >
            <option value="visible">Các buổi trong khoảng đang xem</option>
            <option value="all">Tất cả buổi đã lưu cần đồng bộ</option>
          </select>
        </label>
        {loading && <p role="status">Đang tải các buổi học…</p>}
        {error && <p role="alert">{error}</p>}
        <fieldset disabled={running || loading}>
          <legend>Các buổi học ({selected.length} đã chọn)</legend>
          <label className="calendar-check">
            <input
              type="checkbox"
              checked={
                candidates.length > 0 &&
                candidates.every((s) => selected.includes(s.id))
              }
              onChange={(e) => {
                setSelected(
                  e.target.checked ? candidates.map((s) => s.id) : [],
                );
                setResults({});
              }}
            />
            Chọn tất cả buổi cần đồng bộ
          </label>
          {!loading && !candidates.length && !selected.length && (
            <p>Không có buổi nào cần đồng bộ trong phạm vi này.</p>
          )}
          <div className="bulk-google-list">
            {available
              .filter(
                (s) =>
                  selected.includes(s.id) ||
                  candidates.some((c) => c.id === s.id),
              )
              .map((s) => (
                <article key={s.id}>
                  <label className="calendar-check">
                    <input
                      type="checkbox"
                      checked={selected.includes(s.id)}
                      disabled={results[s.id]?.status === "success"}
                      onChange={(e) =>
                        setSelected((ids) =>
                          e.target.checked
                            ? [...ids, s.id]
                            : ids.filter((id) => id !== s.id),
                        )
                      }
                    />
                    <span>
                      <strong>{s.title}</strong>
                      <small>{when(s.start)}</small>
                    </span>
                  </label>
                  {results[s.id] && (
                    <p
                      className={
                        results[s.id].status === "error"
                          ? "field-error"
                          : "hint"
                      }
                    >
                      {results[s.id].status === "success"
                        ? "Đã đồng bộ"
                        : results[s.id].message}
                    </p>
                  )}
                </article>
              ))}
          </div>
        </fieldset>
        <p role="status">
          {running ? "Đang đồng bộ… " : ""}
          {succeeded} thành công · {failed} lỗi ·{" "}
          {Math.max(0, selected.length - succeeded - failed)} chưa xử lý
        </p>
        <div className="actions">
          <Button
            variant="primary"
            disabled={
              running ||
              loading ||
              !connected ||
              !selected.length ||
              succeeded === selected.length
            }
            onClick={() => run()}
          >
            Đồng bộ {selected.length} buổi
          </Button>
          {failed > 0 && (
            <Button disabled={running || !connected} onClick={() => run(true)}>
              Thử lại các buổi lỗi
            </Button>
          )}
          {running ? (
            <Button
              onClick={() => {
                stop.current = true;
              }}
            >
              Dừng sau buổi đang xử lý
            </Button>
          ) : (
            <Button onClick={() => setOpen(false)}>Đóng</Button>
          )}
        </div>
      </Modal>
    </>
  );
}
