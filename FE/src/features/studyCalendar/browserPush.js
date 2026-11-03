import { api } from "../../lib/api.js";
export const pushSupported = () =>
  window.isSecureContext &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;
const keyBytes = (key) =>
  Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
export async function currentPush() {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration?.pushManager.getSubscription() || null;
}
export async function enablePush(csrfToken) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("Chưa được cấp quyền thông báo.");
  const config = await api("/thong-bao-hoc/push");
  if (!config.enabled)
    throw new Error(
      "Máy chủ chưa bật nhắc nền. Bạn vẫn nhận thông báo trong hệ thống.",
    );
  await navigator.serviceWorker.register("/study-push-sw.js", { scope: "/" });
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(config.publicKey),
    }));
  try {
    await api("/thong-bao-hoc/push", {
      method: "POST",
      csrfToken,
      body: subscription.toJSON(),
    });
    return true;
  } catch (error) {
    await subscription.unsubscribe();
    throw error;
  }
}
export async function disablePush(csrfToken) {
  const subscription = await currentPush();
  if (!subscription) return;
  // Stop local delivery even if the API is unavailable. The push service then
  // returns 410 and the worker removes the expired server registration.
  await subscription.unsubscribe();
  await api("/thong-bao-hoc/push", {
    method: "POST",
    csrfToken,
    body: { endpoint: subscription.endpoint },
    timeoutMs: 3000,
  });
}
