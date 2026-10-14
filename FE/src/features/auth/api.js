import { api } from "../../lib/api.js";
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
export const logout = (csrfToken) =>
  api("/auth/logout", { method: "POST", csrfToken });
