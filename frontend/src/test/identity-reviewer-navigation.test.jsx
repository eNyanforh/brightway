import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { AuthContext } from "../auth/auth-context";
import IdentityReviewerLink from "../components/profile/IdentityReviewerLink";
const response = (data, status = 200) => new Response(JSON.stringify({ success: status < 400, ...(status < 400 ? { data } : { message: data }) }), { status, headers: { "Content-Type": "application/json" } });
function View({ id = "reviewer" }) { return <MemoryRouter><AuthContext.Provider value={{ account: { id, platformRole: "MEMBER" } }}><IdentityReviewerLink /></AuthContext.Provider></MemoryRouter>; }
it("shows an independent workspace entry after dedicated identity permission and MFA pass, without needing a completed personal profile", async () => {
  const fetchMock = vi.fn(async () => response({ allowed: true })); vi.stubGlobal("fetch", fetchMock); render(<View />);
  const link = await screen.findByRole("link", { name: "Identity review workspace" }); expect(link.getAttribute("href")).toBe("/admin/manual-identity");
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/admin/manual-identity/access");
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include", cache: "no-store" });
});
it.each([403, 503])("keeps the reviewer link hidden while access is pending and when the server returns %s", async (status) => {
  let release; const pending = new Promise((resolve) => { release = resolve; }); const fetchMock = vi.fn(() => pending); vi.stubGlobal("fetch", fetchMock); render(<View />);
  expect(screen.queryByRole("link", { name: "Identity review workspace" })).toBeNull();
  await act(async () => { release(response("Reviewer access unavailable.", status)); });
  expect(screen.queryByRole("link", { name: "Identity review workspace" })).toBeNull();
});
it("rechecks on focus and removes the entry after role or MFA access is revoked", async () => {
  let allowed = true;
  const fetchMock = vi.fn(async () => allowed ? response({ allowed: true }) : response("Current MFA and reviewer permission required.", 403)); vi.stubGlobal("fetch", fetchMock); render(<View />);
  await screen.findByRole("link", { name: "Identity review workspace" }); allowed = false;
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(screen.queryByRole("link", { name: "Identity review workspace" })).toBeNull()); expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("does not carry access to another account or accept the previous account's late response", async () => {
  let release; const pending = new Promise((resolve) => { release = resolve; });
  const fetchMock = vi.fn().mockImplementationOnce(() => pending).mockImplementation(async () => response("Access denied.", 403)); vi.stubGlobal("fetch", fetchMock);
  const { rerender } = render(<View id="first-account" />); rerender(<View id="second-account" />);
  await act(async () => { release(response({ allowed: true })); });
  expect(screen.queryByRole("link", { name: "Identity review workspace" })).toBeNull(); expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("does not treat a truthy response value as an access grant", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => response({ allowed: "true" }))); render(<View />);
  await act(async () => {}); expect(screen.queryByRole("link", { name: "Identity review workspace" })).toBeNull();
});
