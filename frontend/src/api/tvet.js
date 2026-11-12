import { resourceFetch } from "./read-cache";
import { ApiError } from "./auth";
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
const root = id => `/organization-workspace/${encodeURIComponent(id)}/campus/tvet`;
async function request(path, method = "GET", body, signal) {
  let response;
  try { response = await resourceFetch(base + path, { method, signal, credentials: "include", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); }
  catch (e) { if (e.name === "AbortError") throw e; throw new ApiError("Cannot reach your training institution. Keep your work and retry."); }
  let result;
  try { result = await response.json(); } catch { throw new ApiError("Unexpected training response. Reload before continuing.", response.status); }
  if (!response.ok || result.success !== true) throw new ApiError(result.message || "Training operations are unavailable.", response.status);
  return result.data;
}
const query = data => { const value = new URLSearchParams(Object.entries(data || {}).filter(([, v]) => v)); return value.size ? "?" + value : ""; };
export const tvetApi = {
 setup:(id,intakeId,signal)=>request(root(id)+query({intakeId}),"GET",undefined,signal),
 configure:(id,kind,body)=>request(root(id)+"/"+kind,"POST",body),
 start:(id,intakeId,expectedVersion)=>request(root(id)+`/intakes/${intakeId}/start`,"POST",{expectedVersion}),
 assign:(id,body)=>request(root(id)+"/assignments","POST",body),
 reassign:(id,key,body)=>request(root(id)+`/assignments/${key}/instructor`,"PUT",body),
 training:(id,key,signal)=>request(root(id)+`/assignments/${key}`,"GET",undefined,signal),
 admissions:(id,filters,signal)=>request(root(id)+"/admissions"+query(filters),"GET",undefined,signal),
 enrolments:(id,filters,signal)=>request(root(id)+"/enrolments"+query(filters),"GET",undefined,signal),
 enrol:(id,body)=>request(root(id)+"/enrolments","POST",body),
 status:(id,kind,key,body)=>request(root(id)+`/${kind}/${key}/status`,"PUT",body),
 report:(id,key,signal)=>request(root(id)+`/enrolments/${key}/report`,"GET",undefined,signal),
 complete:(id,key,expectedVersion)=>request(root(id)+`/enrolments/${key}/complete`,"POST",{expectedVersion}),
 certificate:(id,key,body)=>request(root(id)+`/enrolments/${key}/certificate`,"POST",body),
 revokeCertificate:(id,key,body)=>request(root(id)+`/certificates/${key}/revoke`,"PUT",body),
 schedule:(id,body)=>request(root(id)+"/schedules","POST",body),
 removeSchedule:(id,key)=>request(root(id)+`/schedules/${key}`,"DELETE"),
 createAttendance:(id,body)=>request(root(id)+"/attendance","POST",body),
 attendance:(id,key,body)=>request(root(id)+`/attendance/${key}`,"PUT",body),
 assessment:(id,body)=>request(root(id)+"/assessments","POST",body),
 result:(id,key,enrolmentId,body)=>request(root(id)+`/assessments/${key}/results/${enrolmentId}`,"PUT",body),
 supporter:(id,body)=>request(root(id)+"/supporters","POST",body),
 revokeSupporter:(id,key,expectedVersion)=>request(root(id)+`/supporters/${key}`,"PUT",{expectedVersion,decision:"REVOKE"}),
 myReport:(id,signal)=>request(`/my-campus/tvet/enrolments/${id}`,"GET",undefined,signal),
 supporterReport:(id,signal)=>request(`/my-campus/tvet/supporters/enrolments/${id}`,"GET",undefined,signal),
 supporterDecision:(id,body)=>request(`/my-campus/tvet/supporters/${id}`,"PUT",body),
};
