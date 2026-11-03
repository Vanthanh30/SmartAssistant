import test from "node:test";
import assert from "node:assert/strict";
import {
  syncCandidates,
  syncSelectedSessions,
} from "../src/features/studyCalendar/bulkSync.js";
const sessions = [
  {
    id: "37319038097580148",
    version: 1,
    status: "planned",
    syncStatus: "local",
  },
  { id: "2", version: 2, status: "completed", syncStatus: "unverified" },
];
test("bulk excludes cancelled, already synced and pending deletion sessions", () => {
  assert.equal(
    syncCandidates([
      ...sessions,
      { status: "cancelled" },
      { syncStatus: "synced" },
      { syncStatus: "pending_delete" },
    ]).length,
    2,
  );
});
test("bulk preserves full IDs, uses guarded existing endpoint, and continues after per-session failure", async () => {
  const results = {},
    calls = [];
  await syncSelectedSessions(
    sessions,
    async (path, body) => {
      calls.push({ path, body });
      if (path.includes("/2/")) throw Error("Provider failed");
      return { syncStatus: "synced", googleConfirmed: true };
    },
    (id, result) => (results[id] = result),
  );
  assert.equal(calls[0].path, "/lich-hoc/37319038097580148/thu-dong-bo");
  assert.equal(calls[1].body.version, 2);
  assert.equal(results[sessions[0].id].status, "success");
  assert.equal(results["2"].status, "error");
});
test("provider confirmation is required and user can stop before the next request", async () => {
  const results = [];
  let stop = false;
  await syncSelectedSessions(
    sessions,
    async () => ({ syncStatus: "synced" }),
    (_id, result) => {
      results.push(result);
      stop = true;
    },
    () => stop,
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "error");
});
