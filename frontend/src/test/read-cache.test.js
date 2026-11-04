import { afterEach, expect, it, vi } from "vitest";
import { resourceFetch, setReadIdentity, invalidateReads, expireReadSnapshots } from "../api/read-cache";
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
