import {
  notificationDestination,
  notificationLabel,
} from "./notificationModel.js";
import { useEffect, useState, useRef } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "../../lib/api.js";
import { calendarWrite, calendarKey } from "./api.js";
import { currentPush } from "./browserPush.js";
export function useStudyReminders(auth) {
  const owner = auth.user.id;
  const client = useQueryClient();
  const [visible, setVisible] = useState(!document.hidden);
  const [toasts, setToasts] = useState([]);
  const seen = useRef(new Set());
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const inbox = useInfiniteQuery({
    queryKey: [...calendarKey(owner), "notifications"],
    initialPageParam: null,
    queryFn: ({ signal, pageParam }) =>
      api("/thong-bao-hoc" + (pageParam ? "?cursor=" + pageParam : ""), {
        signal,
      }),
    getNextPageParam: (page) => page.nextCursor || undefined,
    enabled: visible,
    refetchInterval: visible ? 15000 : false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
  });
  const mark = useMutation({
    mutationFn: (id) =>
      calendarWrite(
        id
          ? `/thong-bao-hoc/${encodeURIComponent(id)}/doc`
          : "/thong-bao-hoc/doc-tat-ca",
        {},
        auth.csrfToken,
        id ? "PATCH" : "POST",
      ),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: [...calendarKey(owner), "notifications"],
      }),
  });
  useEffect(() => {
    if (!visible || !inbox.data) return;
    let disposed = false;
    const key = `study-calendar:${owner}:seen`;
    const channel =
      "BroadcastChannel" in window
        ? new BroadcastChannel(`study-calendar:${owner}:notifications`)
        : null;
    const observed = seen.current;
    channel?.addEventListener("message", (event) => {
      if (typeof event.data === "string") observed.add(event.data);
    });
    const claim = async (notification) => {
      const backgroundPush = await currentPush().catch(() => null);
      if (notification.kind === "before" || notification.kind === "start") {
        try {
          const latest = await api(`/lich-hoc/${notification.session.id}`);
          if (
            latest.status !== "planned" ||
            latest.version !== notification.session.version
          )
            return;
        } catch {
          return;
        }
      }
      const notify = () => {
        if (disposed || observed.has(notification.id)) return;
        let previous = [];
        try {
          previous = JSON.parse(localStorage.getItem(key)) || [];
        } catch {
          /* unavailable */
        }
        if (previous.includes(notification.id)) return;
        observed.add(notification.id);
        try {
          localStorage.setItem(
            key,
            JSON.stringify([...previous, notification.id].slice(-500)),
          );
        } catch {
          /* memory fallback */
        }
        channel?.postMessage(notification.id);
        setToasts((values) => [...values, notification].slice(-3));
        if (
          !backgroundPush &&
          "Notification" in window &&
          Notification.permission === "granted"
        )
          try {
            const browser = new Notification(
              notificationLabel(notification.kind),
              {
                body: notification.session.title,
                tag: `study-${notification.id}`,
              },
            );
            browser.onclick = () => {
              window.focus();
              window.location.assign(notificationDestination(notification));
            };
          } catch {
            /* bell/toast remain available */
          }
      };
      if (navigator.locks)
        await navigator.locks.request(
          `study-reminder:${owner}:${notification.id}`,
          { ifAvailable: true },
          (lock) => {
            if (lock) notify();
          },
        );
      else notify();
    };
    for (const page of inbox.data.pages) {
      const now = +new Date(page.serverNow);
      for (const notification of page.notifications) {
        const due = +new Date(notification.dueAt);
        if (
          !notification.read &&
          notification.session.status === "planned" &&
          now >= due &&
          now - due <= 300000 &&
          +new Date(notification.session.end) > now
        )
          void claim(notification);
      }
    }
    return () => {
      disposed = true;
      channel?.close();
    };
  }, [inbox.data, owner, visible]);
  return {
    inbox,
    mark,
    toasts,
    dismiss: (id) => setToasts((values) => values.filter((v) => v.id !== id)),
  };
}
