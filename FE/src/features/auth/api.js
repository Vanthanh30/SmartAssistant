import { api } from "../../lib/api.js";
import { disablePush } from "../studyCalendar/browserPush.js";
export async function getSession() {
  try {
    return await api("/auth/me");
  } catch (error) {
    if (error.status === 401) return null;
    throw error;
  }
}
export const register = (input) =>
  api("/auth/register", { method: "POST", body: input });
export const login = (input) =>
  api("/auth/login", { method: "POST", body: input });
export const logout = async (csrfToken) => {
  try {
    await disablePush(csrfToken);
  } catch {
    /* Local subscription is already revoked; do not block logout. */
  }
  return api("/auth/logout", { method: "POST", csrfToken });
};
