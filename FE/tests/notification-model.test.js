import test from "node:test";
import assert from "node:assert/strict";
import {
  notificationDestination,
  notificationLabel,
  permissionLabel,
} from "../src/features/studyCalendar/notificationModel.js";
test("notifications enter the precise session, cancelled reminders open the calendar", () => {
  const row = { kind: "start", session: { id: "37319038097580148" } };
  assert.equal(
    notificationDestination(row),
    "/app/study-calendar/sessions/37319038097580148",
  );
  assert.equal(
    notificationDestination({ ...row, kind: "cancelled" }),
    "/app/study-calendar",
  );
  assert.equal(
    notificationDestination({ ...row, withdrawn: true }),
    "/app/study-calendar",
  );
});
test("permission and reminder types have user-facing Vietnamese labels", () => {
  assert.equal(permissionLabel("default"), "Chưa bật");
  assert.notEqual(notificationLabel("start"), notificationLabel("before"));
});
