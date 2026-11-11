import { resourceFetch } from "./read-cache";
import { ApiError } from "./auth";
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
const schoolPath = id => `/organization-workspace/${encodeURIComponent(id)}/campus/grade-school`;
async function request(path, method = "GET", body, signal) {
  let response;
  try { response = await resourceFetch(base + path, { method, signal, credentials: "include", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); }
  catch (e) { if (e.name === "AbortError") throw e; throw new ApiError("Cannot reach your school. Keep your work and retry."); }
  let result;
  try { result = await response.json(); } catch { throw new ApiError("Unexpected school response. Reload before continuing.", response.status); }
  if (!response.ok || result.success !== true) throw new ApiError(result.message || "School operations are unavailable.", response.status);
  return result.data;
}
const query = data => { const value = new URLSearchParams(Object.entries(data || {}).filter(([, v]) => v)); return value.size ? "?" + value : ""; };
export const schoolApi = {
  setup: (id, periodId, signal) => request(schoolPath(id) + query({ periodId }), "GET", undefined, signal),
  admissions: (id, filters, signal) => request(schoolPath(id) + "/admissions" + query(filters), "GET", undefined, signal),
  configure: (id, kind, body) => request(schoolPath(id) + "/" + kind, "POST", body),
  assign: (id, offeringId, body) => request(schoolPath(id) + `/offerings/${offeringId}/teacher`, "PUT", body),
  registrations: (id, filters, signal) => request(schoolPath(id) + "/registrations" + query(filters), "GET", undefined, signal),
  register: (id, body) => request(schoolPath(id) + "/registrations", "POST", body),
  status: (id, kind, recordId, body) => request(schoolPath(id) + `/${kind}/${recordId}/status`, "PUT", body),
  subject: (id, offeringId, signal) => request(schoolPath(id) + `/offerings/${offeringId}`, "GET", undefined, signal),
  report: (id, registrationId, signal) => request(schoolPath(id) + `/registrations/${registrationId}/report`, "GET", undefined, signal),
  guardian: (id, body) => request(schoolPath(id) + "/guardians", "POST", body),
  revokeGuardian: (id, linkId, expectedVersion) => request(schoolPath(id) + `/guardians/${linkId}`, "PUT", { expectedVersion, decision: "REVOKE" }),
  schedule: (id, body) => request(schoolPath(id) + "/schedules", "POST", body),
  removeSchedule: (id, scheduleId) => request(schoolPath(id) + `/schedules/${scheduleId}`, "DELETE"),
  createSession: (id, kind, body) => request(schoolPath(id) + "/" + kind, "POST", body),
  submit: (id, kind, sessionId, body) => request(schoolPath(id) + `/${kind}/${sessionId}`, "PUT", body),
  myCampus: signal => request("/my-campus", "GET", undefined, signal),
  myReport: (registrationId, signal) => request(`/my-campus/registrations/${registrationId}`, "GET", undefined, signal),
  guardians: signal => request("/my-campus/guardians", "GET", undefined, signal),
  guardianDecision: (linkId, body) => request(`/my-campus/guardians/${linkId}`, "PUT", body),
  guardianReport: (registrationId, signal) => request(`/my-campus/guardians/registrations/${registrationId}`, "GET", undefined, signal),
};
