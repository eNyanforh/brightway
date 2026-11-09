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
const explorePost = (source, id) => `/explore/posts/${source}/${encodeURIComponent(id)}`;
export const memberPhotoUrl = (username, photoId) => `${base}/explore/members/${encodeURIComponent(username)}/photo/${encodeURIComponent(photoId)}`;
const query = params => "?" + new URLSearchParams(params);

export const organizationPostsApi = {
  feed: (view, cursor, signal) => readPage("/explore/posts" + query({ view, ...(cursor ? { cursor } : {}) }), signal),
  readPost: (source, id, signal) => request(explorePost(source, id), signal),
  setLike: (source, id, liked, signal) => request(explorePost(source, id) + "/like", signal, "PUT", { liked }),
  registerEvent: (id, registered, signal) => request(explorePost("member", id) + "/register", signal, "PUT", { registered }),
  eventRequests: (id, signal) => request(explorePost("member", id) + "/registration-requests", signal),
  decideEventRequest: (id, requestId, approved, signal) => request(
    explorePost("member", id) + "/registration-requests/" + encodeURIComponent(requestId),
    signal, "PUT", { approved }),
  recordView: (source, id, signal) => request(explorePost(source, id) + "/view", signal, "PUT"),
  reportQuestion: (id, payload, signal) => request(explorePost("member", id) + "/report", signal, "POST", payload),
  answers: (id, sort, signal) => request(explorePost("member", id) + "/answers" + query({ sort }), signal),
  addAnswer: (id, payload, signal) => request(explorePost("member", id) + "/answers", signal, "POST", payload),
  deleteAnswer: (id, signal) => request("/explore/answers/" + encodeURIComponent(id), signal, "DELETE"),
  voteAnswer: (id, value, signal) => request("/explore/answers/" + encodeURIComponent(id) + "/vote", signal, "PUT", { value }),
  answerComments: (id, signal) => request("/explore/answers/" + encodeURIComponent(id) + "/comments", signal),
  addAnswerComment: (id, draft, signal) => request("/explore/answers/" + encodeURIComponent(id) + "/comments", signal, "POST", draft),
  deleteAnswerComment: (id, commentId, signal) => request("/explore/answers/" + encodeURIComponent(id) + "/comments/" + encodeURIComponent(commentId), signal, "DELETE"),
  setReposted: (source, id, reposted, signal) => request(explorePost(source, id) + "/repost", signal, "PUT", { reposted }),
  setSaved: (source, id, saved, signal) => request(explorePost(source, id) + "/save", signal, "PUT", { saved }),
  comments: (source, id, cursor, signal) => readPage(explorePost(source, id) + "/comments" + (cursor ? query({ cursor }) : ""), signal),
  addComment: (source, id, draft, signal) => request(explorePost(source, id) + "/comments", signal, "POST", draft),
  deleteComment: (source, id, commentId, signal) => request(explorePost(source, id) + "/comments/" + encodeURIComponent(commentId), signal, "DELETE"),
  memberList: (cursor, signal) => readPage("/posts/me" + (cursor ? query({ cursor }) : ""), signal),
  memberPublish: (body, signal) => request("/posts/me", signal, "POST", body),
  memberEdit: (postId, payload, signal) => request("/posts/me/" + encodeURIComponent(postId), signal, "PATCH", payload),
  memberWithdraw: (postId, signal) => request("/posts/me/" + encodeURIComponent(postId), signal, "DELETE"),
  list: (id, cursor, signal) => readPage(workspacePath(id) + (cursor ? query({ cursor }) : ""), signal),
  publish: (id, body, signal) => request(workspacePath(id), signal, "POST", body),
  edit: (id, postId, payload, signal) => request(workspacePath(id) + "/" + encodeURIComponent(postId), signal, "PATCH", payload),
  withdraw: (id, postId, signal) => request(workspacePath(id) + "/" + encodeURIComponent(postId), signal, "DELETE"),
};
