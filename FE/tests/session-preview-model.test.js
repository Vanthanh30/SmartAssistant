import test from "node:test";
import assert from "node:assert/strict";
import { sessionPreviewModel } from "../src/features/studyCalendar/sessionPreviewModel.js";
test("preview removes duplicated title from old goals", () => {
  const model = sessionPreviewModel({
    title: "toàn bộ tài liệu",
    goal: "toàn bộ tài liệu · Vật lí.pdf, trang 4–7",
    courseId: "24",
    status: "planned",
  });
  assert.equal(model.goal, "Vật lí.pdf, trang 4–7");
  assert.equal(model.canStudy, true);
  assert.equal(model.canEdit, true);
  assert.equal(
    sessionPreviewModel({ title: "Ôn tập", goal: "Ôn tập" }).goal,
    "",
  );
});
test("preview stays short and leaves full lesson content in the classroom", () => {
  const model = sessionPreviewModel({
    lesson: { objectives: ["A", "B", "C"], resources: [1, 2, 3, 4] },
  });
  assert.deepEqual(model.objectives, ["A", "B"]);
  assert.deepEqual(model.resources, [1, 2]);
  assert.equal(model.extraResources, 2);
});
test("healthy Google sync does not expose retry or resume-delete actions", () => {
  const model = sessionPreviewModel({
    syncStatus: "synced",
    status: "completed",
    courseId: "24",
  });
  assert.equal(model.canOpenGoogle, true);
  assert.equal(model.needsSyncRetry, false);
  assert.equal(model.needsDeleteRetry, false);
  assert.equal(model.canEdit, false);
  assert.equal(model.canStudy, true);
});
test("preview groups repeated PDF chunks into accurate page ranges without hiding the other PDF", () => {
  const model = sessionPreviewModel({
    lesson: {
      resources: [
        { documentId: "21", pageFrom: 1, pageTo: 2 },
        { documentId: "21", pageFrom: 2, pageTo: 3 },
        { documentId: "22", pageFrom: 1, pageTo: 4 },
      ],
    },
  });
  assert.equal(model.resources.length, 2);
  assert.deepEqual(model.resources[0].ranges, [[1, 3]]);
  assert.equal(model.resources[1].documentId, "22");
});
test("retry actions are specific to the actual sync operation", () => {
  assert.equal(
    sessionPreviewModel({ syncStatus: "error" }).needsSyncRetry,
    true,
  );
  const deleting = sessionPreviewModel({
    syncStatus: "pending_delete",
    status: "cancelled",
  });
  assert.equal(deleting.needsDeleteRetry, true);
  assert.equal(deleting.needsSyncRetry, false);
  assert.equal(deleting.canStudy, false);
});
