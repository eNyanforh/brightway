import { ApiError } from "./auth";
import { invalidateReads, resourceFetch } from "./read-cache";
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
async function request(path, body, method = body ? "POST" : "GET") {
  let response;
  try { response = await resourceFetch(`${base}/management/${path}`, { method, credentials: "include", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }, "management"); }
  catch { throw new ApiError("Unable to reach BrightWay Management. Keep your inputs and retry."); }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) {
    if ([401, 403].includes(response.status)) invalidateReads("management");
    throw new ApiError(payload?.message || "Management authentication failed.", response.status);
  }
  return payload.data;
}
export const managementAuthApi = {
  me: () => request("auth/me"), login: body => request("auth/login", body), verify: body => request("auth/verify", body), logout: () => request("auth/logout", {}),
  recover: email => request("auth/recovery/request", { email }), reset: body => request("auth/recovery/reset", body), backups: body => request("security/backups", body),
  stepUp: body => request("security/step-up", body),
  conflict: body => request("security/conflicts", body),
};
