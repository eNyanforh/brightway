import { afterEach, expect, it, vi } from "vitest";
import { resourceFetch, setReadIdentity, invalidateReads, expireReadSnapshots, scopeOrganizationReads } from "../api/read-cache";
const reply = value => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
afterEach(() => { setReadIdentity("personal", null); setReadIdentity("management", null); });
it("shares concurrent reads and gives every consumer an independent response body", async () => {
  let release; const fetch = vi.fn(() => new Promise(resolve => { release = resolve; })); vi.stubGlobal("fetch", fetch);
  setReadIdentity("personal", "owner-a");
  const first = resourceFetch("/api/v1/my-workspace"), second = resourceFetch("/api/v1/my-workspace");
  expect(fetch).toHaveBeenCalledTimes(1); release(reply({ rows: [1] }));
  expect(await (await first).json()).toEqual({ rows: [1] }); expect(await (await second).json()).toEqual({ rows: [1] });
  await resourceFetch("/api/v1/my-workspace"); expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValue(reply({ rows: [1] })); expireReadSnapshots(); await resourceFetch("/api/v1/my-workspace"); expect(fetch).toHaveBeenCalledTimes(2);
});
it("an aborted consumer cannot abort a shared request still needed by another view", async () => {
  let release, sharedSignal; const fetch = vi.fn((_url, options) => { sharedSignal = options.signal; return new Promise(resolve => { release = resolve; }); }); vi.stubGlobal("fetch", fetch);
  setReadIdentity("personal", "owner-a"); const a = new AbortController(), b = new AbortController();
  const first = resourceFetch("/api/v1/my-workspace", { signal: a.signal }), second = resourceFetch("/api/v1/my-workspace", { signal: b.signal });
  a.abort(); await expect(first).rejects.toMatchObject({ name: "AbortError" }); expect(sharedSignal.aborted).toBe(false);
  release(reply({ rows: [2] })); expect(await (await second).json()).toEqual({ rows: [2] });
});
it("account changes, permission failures and writes invalidate private snapshots", async () => {
  let denied = false; const fetch = vi.fn(() => Promise.resolve(denied ? new Response('{}', { status: 403 }) : reply({ rows: [1] }))); vi.stubGlobal("fetch", fetch);
  setReadIdentity("personal", "owner-a"); await resourceFetch("/api/v1/my-workspace");
  setReadIdentity("personal", "owner-b"); await resourceFetch("/api/v1/my-workspace"); expect(fetch).toHaveBeenCalledTimes(2);
  await resourceFetch("/api/v1/write", { method: "POST" }); await resourceFetch("/api/v1/my-workspace"); expect(fetch).toHaveBeenCalledTimes(4);
  denied = true; const response = await resourceFetch("/api/v1/admin/check"); expect(response.status).toBe(403); await response.json();
  denied = false; await resourceFetch("/api/v1/my-workspace"); expect(fetch).toHaveBeenCalledTimes(6);
});
it("management and personal reads never share cache entries; protected access is always revalidated", async () => {
  const fetch = vi.fn(() => Promise.resolve(reply({ allowed: true }))); vi.stubGlobal("fetch", fetch);
  setReadIdentity("personal", "owner"); setReadIdentity("management", "staff");
  await resourceFetch("/api/v1/shared"); await resourceFetch("/api/v1/shared", {}, "management"); expect(fetch).toHaveBeenCalledTimes(2);
  await resourceFetch("/api/v1/management"); await resourceFetch("/api/v1/management"); expect(fetch).toHaveBeenCalledTimes(4);
  invalidateReads("management"); await resourceFetch("/api/v1/shared"); expect(fetch).toHaveBeenCalledTimes(4);
});
it("completed organization statistics and staff reads revalidate permissions instead of reusing a previous grant", async () => {
  let denied = false;
  const fetch = vi.fn(() => Promise.resolve(denied ? new Response('{}', { status: 403 }) : reply({ private: "tenant statistics" }))); vi.stubGlobal("fetch", fetch);
  setReadIdentity("personal", "organization-member");
  for (const path of ["/api/v1/organization-workspace/org/dashboard?days=30", "/api/v1/organization-workspace/org/staff"]) {
    denied = false; expect((await resourceFetch(path)).status).toBe(200);
    denied = true; expect((await resourceFetch(path)).status).toBe(403);
  }
  expect(fetch).toHaveBeenCalledTimes(4);
});
it("recent organization data is reused only within the server-returned membership, permission and query scope", async () => {
  const fetch = vi.fn(() => Promise.resolve(reply({ statistics: 7 }))); vi.stubGlobal("fetch", fetch); setReadIdentity("personal", "member");
  const context = { accountId: "member", organization: { id: "school" }, staffVersion: 1, membership: { role: "STAFF", version: 1 }, permissions: ["organization.members.manage"] };
  scopeOrganizationReads(context);
  const path = "/api/v1/organization-workspace/school/dashboard?days=30";
  await resourceFetch(path); await resourceFetch(path); expect(fetch).toHaveBeenCalledTimes(1);
  await resourceFetch(path.replace("30", "90")); expect(fetch).toHaveBeenCalledTimes(2);
  scopeOrganizationReads({ ...context, staffVersion: 2, permissions: [] });
  await resourceFetch(path); expect(fetch).toHaveBeenCalledTimes(3);
  scopeOrganizationReads(context); await resourceFetch(path); expect(fetch).toHaveBeenCalledTimes(3);
  setReadIdentity("personal", "other"); scopeOrganizationReads(context); await resourceFetch(path); await resourceFetch(path); expect(fetch).toHaveBeenCalledTimes(5);
});

it("HTTP error bodies remain readable after the last shared consumer receives headers, and errors are never cached", async () => {
  const signals = [];
  const fetch = vi.fn((_url, options) => {
    const signal = options.signal; signals.push(signal);
    const stream = new ReadableStream({ start(controller) {
      signal.addEventListener("abort", () => controller.error(new DOMException("Aborted body", "AbortError")), { once:true });
      setTimeout(() => { if (!signal.aborted) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ success:false,message:"Temporary case service failure" }))); controller.close(); } },10);
    } });
    return Promise.resolve(new Response(stream,{ status:503,headers:{"Content-Type":"application/json"} }));
  });
  vi.stubGlobal("fetch",fetch); setReadIdentity("management","synthetic-staff");
  const a=resourceFetch("/api/v1/management/tools/cases",{},"management"),b=resourceFetch("/api/v1/management/tools/cases",{},"management");
  expect(fetch).toHaveBeenCalledTimes(1);
  for (const response of await Promise.all([a,b])) expect(await response.json()).toEqual({success:false,message:"Temporary case service failure"});
  expect(signals[0].aborted).toBe(false);
  expect((await (await resourceFetch("/api/v1/management/tools/cases",{},"management")).json()).message).toBe("Temporary case service failure");
  expect(fetch).toHaveBeenCalledTimes(2);
});
