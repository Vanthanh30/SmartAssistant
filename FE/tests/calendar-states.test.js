import test from "node:test";
import assert from "node:assert/strict";
import { sessionAppearance } from "../src/features/studyCalendar/sessionAppearance.js";
import { deleteStudySession } from "../src/features/studyCalendar/deleteStudySession.js";
test("cancelled, moved, completed and planned sessions have distinct colors and labels", () => {
  const rows = [
    { status: "cancelled", movedAt: "today" },
    { status: "planned", movedAt: "today" },
    { status: "completed", movedAt: "today" },
    { status: "planned" },
  ];
  assert.equal(new Set(rows.map((s) => sessionAppearance(s).color)).size, 4);
  assert.equal(sessionAppearance(rows[0]).label, "Đã hủy");
  assert.equal(sessionAppearance(rows[1]).label, "Đã dời lịch");
});
test("missing DELETE route with an existing session explains that backend needs reloading", async () => {
  const missing = Object.assign(
    new Error("Không tìm thấy trang hoặc tài nguyên."),
    { status: 404 },
  );
  await assert.rejects(
    () =>
      deleteStudySession(
        "10",
        1,
        async () => {
          throw missing;
        },
        async () => ({ id: "10" }),
      ),
    /Backend đang chạy chưa nạp API/,
  );
});
test("already removed session is reconciled but unconfirmed deletion is never hidden", async () => {
  const missing = Object.assign(
    new Error("Không tìm thấy dữ liệu thuộc tài khoản của bạn."),
    { status: 404 },
  );
  assert.equal(
    (
      await deleteStudySession(
        "10",
        1,
        async () => {
          throw missing;
        },
        async () => {
          throw missing;
        },
      )
    ).deleted,
    true,
  );
  await assert.rejects(
    () =>
      deleteStudySession(
        "10",
        1,
        async () => ({ deleted: false }),
        async () => ({ id: "10" }),
      ),
    /chưa xác nhận/,
  );
});
