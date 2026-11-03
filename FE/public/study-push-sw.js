/* Push only: no request interception and no caching of authenticated content. */
const safePath = (path) =>
  typeof path === "string" &&
  /^\/app\/study-calendar\/sessions\/[1-9][0-9]{0,19}$/.test(path)
    ? path
    : "/app/study-calendar";
self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification("Trợ lý học tập", {
      body: data.body,
      tag: data.tag,
      data: { url: safePath(data.url) },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url = new URL(
        safePath(event.notification.data?.url),
        self.location.origin,
      ).href;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find(
        (w) => new URL(w.url).origin === self.location.origin,
      );
      if (existing) {
        await existing.navigate(url);
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
