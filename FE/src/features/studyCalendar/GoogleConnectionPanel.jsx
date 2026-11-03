import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";
import { Button } from "../../components/ui/Button.jsx";
import { calendarWrite } from "./api.js";
export function GoogleConnectionPanel({ owner, csrfToken, onChanged }) {
  const status = useQuery({
    queryKey: ["study-calendar", owner, "google"],
    queryFn: ({ signal }) => api("/ket-noi/google", { signal }),
    retry: false,
  });
  const action = useMutation({
    mutationFn: async (kind) => {
      if (kind === "connect") {
        const data = await calendarWrite(
          "/ket-noi/google/bat-dau",
          {},
          csrfToken,
        );
        const target = new URL(data.url);
        if (
          target.protocol !== "https:" ||
          target.hostname !== "accounts.google.com"
        )
          throw Error("Liên kết Google không hợp lệ.");
        window.location.assign(target.href);
        return;
      }
      return calendarWrite("/ket-noi/google", undefined, csrfToken, "DELETE");
    },
    onSuccess: () => {
      status.refetch();
      onChanged();
    },
  });
  return (
    <section id="google-calendar" className="calendar-google">
      <div>
        <h2>Google Calendar</h2>
        {status.isPending ? (
          <p>Đang kiểm tra kết nối…</p>
        ) : status.isError ? (
          <p role="alert">
            {status.error.message}{" "}
            <Button onClick={() => status.refetch()}>Thử lại</Button>
          </p>
        ) : (
          <>
            <p>
              {!status.data.configured
                ? "Google Calendar chưa được cấu hình trên máy chủ. Quản trị viên cần hoàn tất cấu hình kết nối; lịch và nhắc nội bộ vẫn dùng được."
                : status.data.status === "connected"
                  ? `Đã kết nối: ${status.data.email}`
                  : status.data.status === "reconnect_required"
                    ? "Cần kết nối Google lại"
                    : "Chưa kết nối Google"}
            </p>
            <p className="hint">
              Sau khi kết nối, bấm Đồng bộ Google Calendar trên trang Lịch học
              để chọn tất cả buổi cần đồng bộ một lần, hoặc đồng bộ riêng từng
              buổi. Chỉ gửi các buổi bạn xác nhận; không đọc lịch bận Google.
            </p>
          </>
        )}
      </div>
      <div className="actions">
        <Button
          disabled={!status.data?.configured || action.isPending}
          onClick={() => action.mutate("connect")}
        >
          {status.data?.status === "connected"
            ? "Kết nối lại"
            : "Kết nối Google"}
        </Button>
        {status.data?.status !== "disconnected" && status.data?.email && (
          <Button
            disabled={action.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Ngắt kết nối? Event Google đã tạo vẫn còn và có thể tiếp tục nhắc.",
                )
              )
                action.mutate("disconnect");
            }}
          >
            Ngắt kết nối
          </Button>
        )}
      </div>
      {action.isError && (
        <p role="alert" className="field-error">
          {action.error.message}
        </p>
      )}
      {action.data?.disconnected && (
        <p role="status">
          Đã ngắt trong ứng dụng.{" "}
          {action.data.revoked
            ? "Đã thu hồi token."
            : "Chưa xác nhận thu hồi phía Google."}{" "}
          Event Google đã có vẫn được giữ.
        </p>
      )}
    </section>
  );
}
