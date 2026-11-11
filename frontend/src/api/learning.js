import { ApiError } from "./auth";
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
async function request(path, { method = "GET", body, signal, file } = {}) {
  let response;
  try { response = await fetch(base + path, { credentials: "include", cache: "no-store", signal, method,
    ...(file ? { headers: { "Content-Type": file.type }, body: file } : body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) }); }
  catch (error) { if (signal?.aborted) throw error; throw new ApiError("Unable to reach BrightWay. Your changes are still here."); }
  let result;
  try { result = await response.json(); } catch { throw new ApiError("BrightWay returned an unexpected response.", response.status); }
  if (!response.ok || result?.success !== true) throw new ApiError(result?.message || "Learning could not be loaded.", response.status);
  return result.data;
}
const query = params => { const clean = Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== "" && v !== null)); return "?" + new URLSearchParams(clean); };
const org = id => "/organization-workspace/" + encodeURIComponent(id);
const app = id => "/admission-applications/me/" + encodeURIComponent(id);
async function list(path, signal) {
  const data = await request(path, { signal });
  if (!Array.isArray(data?.items)) throw new ApiError("BrightWay could not load this list. Try again shortly.");
  return data;
}
export const learningApi = {
  program: (id, signal) => request("/learning/programs/" + encodeURIComponent(id), { signal }),
  programs: (id, cursor, signal) => list(org(id) + "/programs" + query({ cursor }), signal),
  createProgram: (id, body, signal) => request(org(id) + "/programs", { method: "POST", body, signal }),
  editProgram: (id, programId, body, signal) => request(org(id) + "/programs/" + encodeURIComponent(programId), { method: "PATCH", body, signal }),
  programStatus: (id, programId, body, signal) => request(org(id) + "/programs/" + encodeURIComponent(programId) + "/status", { method: "PUT", body, signal }),
  browse: (params, signal) => list("/learning/discover" + query(params), signal),
  detail: (id, signal) => request("/admission-cycles/" + encodeURIComponent(id), { signal }),
  mine: (cursor, signal) => list("/admission-applications/me" + query({ cursor }), signal),
  application: (id, signal) => request(app(id), { signal }),
  save: (id, body, signal) => request("/admission-cycles/" + encodeURIComponent(id) + "/application", { method: "PUT", body, signal }),
  withdraw: (id, expectedVersion, signal) => request(app(id) + "/withdraw", { method: "POST", body: { expectedVersion }, signal }),
  upload: (id, params, file, signal) => request(app(id) + "/files" + query(params), { method: "POST", file, signal }),
  filesUrl: (applicationId, fileId, organizationId) => base + (organizationId ? org(organizationId) + "/admission-applications/" + encodeURIComponent(applicationId) : app(applicationId)) + "/files/" + encodeURIComponent(fileId),
  list: (id, cursor, signal) => list(org(id) + "/admission-cycles" + query({ cursor }), signal),
  create: (id, body, signal) => request(org(id) + "/admission-cycles", { method: "POST", body, signal }),
  edit: (id, cycleId, body, signal) => request(org(id) + "/admission-cycles/" + encodeURIComponent(cycleId), { method: "PATCH", body, signal }),
  status: (id, cycleId, body, signal) => request(org(id) + "/admission-cycles/" + encodeURIComponent(cycleId) + "/status", { method: "PUT", body, signal }),
  reviews: (id, params, signal) => list(org(id) + "/admission-applications" + query(params), signal),
  review: (id, applicationId, signal) => request(org(id) + "/admission-applications/" + encodeURIComponent(applicationId), { signal }),
  decide: (id, applicationId, body, signal) => request(org(id) + "/admission-applications/" + encodeURIComponent(applicationId) + "/status", { method: "PUT", body, signal }),
};
