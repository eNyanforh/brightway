import { resourceFetch } from "./read-cache";
import { ApiError } from "./auth";
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
async function request(path, method = "GET", body, signal, management = false) {
  let response;
  try { response = await resourceFetch(base + path, { method, credentials: "include", cache: "no-store", signal, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }, management ? "management" : "personal"); }
  catch (e) { if (e.name === "AbortError") throw e; throw new ApiError("Unable to reach billing. Keep your payment reference and retry with the same details."); }
  let r; try { r = await response.json(); } catch { throw new ApiError("Unexpected billing response. Check saved records before retrying.", response.status); }
  if (!response.ok || !r.success) throw new ApiError(r.message || "Billing is unavailable.", response.status);
  return r.data;
}
const root = (id, management) => management ? `/management/billing/${encodeURIComponent(id)}` : `/organization-workspace/${encodeURIComponent(id)}/campus/billing`;
export const billingApi = {
  statement: (id, management, signal, cursor) => request(root(id, management) + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""), "GET", undefined, signal, management),
  history: (id, management, kind, cursor, signal) => request(root(id, management) + "/history/" + kind + "?cursor=" + encodeURIComponent(cursor), "GET", undefined, signal, management),
  semester: (id, body) => request(root(id) + "/semesters", "POST", body),
  reconcile: (id, body = {}) => request(root(id) + "/reconcile", "POST", body),
  report: (id, body) => request(root(id) + "/payments", "POST", body),
  queue: (signal, cursor) => request("/management/billing" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""), "GET", undefined, signal, true),
  accounts: (signal, q = "") => request("/management/billing/accounts?q=" + encodeURIComponent(q), "GET", undefined, signal, true),
  decide: (id, paymentId, body) => request(root(id, true) + `/payments/${encodeURIComponent(paymentId)}/decision`, "POST", body, undefined, true),
  adjust: (id, chargeId, body) => request(root(id, true) + `/charges/${encodeURIComponent(chargeId)}/adjustments`, "POST", body, undefined, true),
};
