import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("push worker shows generic reminder and clicks only navigate within this app", async () => {
  const listeners = {},
    shown = [],
    navigated = [];
  const worker = {
    location: { origin: "https://study.example" },
    addEventListener: (type, handler) => {
      listeners[type] = handler;
    },
    registration: { showNotification: async (...args) => shown.push(args) },
    clients: {
      matchAll: async () => [
        {
          url: "https://study.example/app/profile",
          navigate: async (url) => navigated.push(url),
          focus: async () => {},
        },
      ],
    },
  };
  vm.runInNewContext(
    await readFile(
      new URL("../public/study-push-sw.js", import.meta.url),
      "utf8",
    ),
    { self: worker, URL },
  );
  let pending;
  listeners.push({
    data: {
      json: () => ({
        body: "Bạn có thông báo học tập mới.",
        tag: "one",
        url: "https://evil.test",
      }),
    },
    waitUntil: (p) => {
      pending = p;
    },
  });
  await pending;
  assert.equal(shown.length, 1);
  assert.equal(shown[0][1].data.url, "/app/study-calendar");
  listeners.notificationclick({
    notification: { close: () => {} },
    waitUntil: (p) => {
      pending = p;
    },
  });
  await pending;
  assert.equal(navigated[0], "https://study.example/app/study-calendar");
  listeners.notificationclick({
    notification: {
      close: () => {},
      data: { url: "/app/study-calendar/sessions/37319038097580148" },
    },
    waitUntil: (p) => {
      pending = p;
    },
  });
  await pending;
  assert.equal(
    navigated[1],
    "https://study.example/app/study-calendar/sessions/37319038097580148",
  );
});
