import { ApiError } from "./auth";
const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");
async function request(path, { method = "GET", body, signal, file } = {}) {
  let response;
  try { response = await fetch(base + path, { credentials: "include", cache: "no-store", signal, method,
    ...(file ? { headers: { "Content-Type": file.type }, body: file } : body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) }); }
  catch (error) { if (signal?.aborted) throw error; throw new ApiError("Unable to reach BrightWay. Your changes are still here."); }
  let result;
  try { result = await response.json(); } catch { throw new ApiError("BrightWay returned an unexpected response.", response.status); }
  if (!response.ok || result?.success !== true) throw new ApiError(result?.message || "Opportunities could not be loaded.", response.status);
  return result.data;
}
const query = params => { const clean = Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== "" && v !== null)); return "?" + new URLSearchParams(clean); };
const org = id => "/organization-workspace/" + encodeURIComponent(id);
const app = id => "/applications/me/" + encodeURIComponent(id);
async function list(path, signal) {
  const data = await request(path, { signal });
  if (!Array.isArray(data?.items)) throw new ApiError("BrightWay could not load this list. Try again shortly.");
  return data;
}
export const opportunitiesApi = {
  browse: (params, signal) => list("/opportunities" + query(params), signal),
  detail: (id, signal) => request("/opportunities/" + encodeURIComponent(id), { signal }),
  setSaved: (id, saved, signal) => request("/opportunities/" + encodeURIComponent(id) + "/save", { method: "PUT", body: { saved }, signal }),
  mine: (cursor, signal) => list("/applications/me" + query({ cursor }), signal),
  application: (id, signal) => request(app(id), { signal }),
  save: (id, body, signal) => request("/opportunities/" + encodeURIComponent(id) + "/application", { method: "PUT", body, signal }),
  withdraw: (id, expectedVersion, signal) => request(app(id) + "/withdraw", { method: "POST", body: { expectedVersion }, signal }),
  upload: (id, params, file, signal) => request(app(id) + "/files" + query(params), { method: "POST", file, signal }),
  filesUrl: (applicationId, fileId, organizationId) => base + (organizationId ? org(organizationId) + "/applications/" + encodeURIComponent(applicationId) : app(applicationId)) + "/files/" + encodeURIComponent(fileId),
  list: (id, cursor, signal) => list(org(id) + "/opportunities" + query({ cursor }), signal),
  create: (id, body, signal) => request(org(id) + "/opportunities", { method: "POST", body, signal }),
  edit: (id, opportunityId, body, signal) => request(org(id) + "/opportunities/" + encodeURIComponent(opportunityId), { method: "PATCH", body, signal }),
  status: (id, opportunityId, body, signal) => request(org(id) + "/opportunities/" + encodeURIComponent(opportunityId) + "/status", { method: "PUT", body, signal }),
  reviews: (id, params, signal) => list(org(id) + "/applications" + query(params), signal),
  review: (id, applicationId, signal) => request(org(id) + "/applications/" + encodeURIComponent(applicationId), { signal }),
  decide: (id, applicationId, body, signal) => request(org(id) + "/applications/" + encodeURIComponent(applicationId) + "/status", { method: "PUT", body, signal }),
};
