import { ApiError } from "./auth";

const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");

async function request(path, signal, method = "GET", body) {
  let response;
  try {
    response = await fetch(base + path, {
      method, signal, credentials: "include", cache: "no-store",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("Unable to reach BrightWay. Try again shortly.");
  }
  let result;
  try {
    result = await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("BrightWay returned an unexpected response.", response.status);
  }
  if (!response.ok || result?.success !== true) {
    throw new ApiError(result?.message || "Posts are unavailable.", response.status);
  }
  return result.data;
}

async function readPage(path, signal) {
  const data = await request(path, signal);
  if (!Array.isArray(data?.items)) throw new ApiError("BrightWay could not load the post list.");
  return data;
}

const workspacePath = id => "/organization-workspace/" + encodeURIComponent(id) + "/posts";
const query = params => "?" + new URLSearchParams(params);

export const organizationPostsApi = {
  feed: (view, cursor, signal) => readPage("/explore/posts" + query({ view, ...(cursor ? { cursor } : {}) }), signal),
  setLike: (source, id, liked, signal) => request(`/explore/posts/${source}/${encodeURIComponent(id)}/like`, signal, "PUT", { liked }),
  memberList: (cursor, signal) => readPage("/posts/me" + (cursor ? query({ cursor }) : ""), signal),
  memberPublish: (body, signal) => request("/posts/me", signal, "POST", body),
  memberWithdraw: (postId, signal) => request("/posts/me/" + encodeURIComponent(postId), signal, "DELETE"),
  list: (id, cursor, signal) => readPage(workspacePath(id) + (cursor ? query({ cursor }) : ""), signal),
  publish: (id, body, signal) => request(workspacePath(id), signal, "POST", body),
  withdraw: (id, postId, signal) => request(workspacePath(id) + "/" + encodeURIComponent(postId), signal, "DELETE"),
};
