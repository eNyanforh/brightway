import { ApiError } from "./auth";

const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");

async function request(path, { method = "GET", body, signal } = {}) {
  let response;
  try {
    // These requests have their own lifecycle and do not change profile or workspace data.
    response = await fetch(base + path, {
      method,
      credentials: "include",
      cache: "no-store",
      signal,
      ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError("Unable to reach BrightWay. Try again shortly.");
  }
  let payload;
  try { payload = await response.json(); }
  catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError("BrightWay returned an unexpected response.", response.status);
  }
  if (!response.ok || payload.success !== true) throw new ApiError(payload.message || "Unable to load notifications.", response.status);
  return payload.data;
}

export const notificationsApi = {
  viewProfile: (username, signal) => request(`/profiles/${encodeURIComponent(username)}/view`, { method: "POST", body: {}, signal }),
  list: (cursor, signal, view = "all") => request("/notifications" + (cursor || view === "unread" ? "?" + new URLSearchParams({ ...(cursor ? { cursor } : {}), ...(view === "unread" ? { view } : {}) }) : ""), { signal }),
  markRead: (id, signal) => request(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST", body: {}, signal }),
  dismiss: (id, signal) => request(`/notifications/${encodeURIComponent(id)}/dismiss`, { method: "POST", body: {}, signal }),
  markAllRead: signal => request("/notifications/read-all", { method: "POST", body: {}, signal }),
};
