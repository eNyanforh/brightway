import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import AuthProvider from "../auth/AuthProvider";
import { AuthContext } from "../auth/auth-context";
import { useIdentityStatus } from "../auth/useIdentityStatus";
import AppRoutes from "../routes/AppRoutes";
import VerificationBadge from "../components/VerificationBadge";
import { hasVerifiedIdentity } from "../pages/manual-identity-format";
import { theme } from "../styles/theme";
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
const response = (data, status = 200) => new Response(JSON.stringify({ success: status < 400, ...(status < 400 ? { data } : { message: data }) }), { status, headers: { "Content-Type": "application/json" } });
const account = { id: "owner", username: "tester", identityVerified: true, person: { firstName: "Test", lastName: "User" } };
const profile = { id: "profile", version: 1, identityVerified: true, headline: "Student", bio: null, photo: null,
  location: { countryCode: "US", locality: "City" }, careerField: { mode: "EXPLORING" }, skills: ["Communication"], interests: ["Technology"],
  education: { mode: "NONE", records: [] }, experience: { mode: "NONE", records: [] },
  completion: { profileVersion: 1, complete: true, eligibleToRequestVerification: true, checks: [], manualVerificationEligibility: { requirementsMet: true, checks: [
    { code: "PROFILE_COMPLETE_REQUIRED", satisfied: true }, { code: "VERIFIED_EDUCATION_REQUIRED", satisfied: true }, { code: "VERIFIED_EXPERIENCE_REQUIRED", satisfied: true },
  ] } },
};
const status = (extra = {}) => ({ accountId: "owner", profileVersion: 1, status: "APPROVED", identityVerified: true, identityDetailsComplete: true, canSubmit: false, ...extra });
function mount(handler) {
  const fetchMock = vi.fn(async (url, options) => {
    if (url.endsWith("/work/access")) return response({ hasWork: false });
    if (url.endsWith("/auth/me")) return response({ account });
    if (url.endsWith("/profile/me")) return response({ profile });
    if (url.endsWith("/admin/manual-identity/access")) return response("Access denied.", 403);
    return handler(url, options);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<ThemeProvider theme={theme}><MemoryRouter initialEntries={["/profile"]}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter></ThemeProvider>);
  return { user: userEvent.setup(), fetchMock };
}
it("adds an accessible blue mark beside the approved profile name and removes Verify my identity", async () => {
  const { fetchMock } = mount(async () => response(status()));
  await screen.findByRole("img", { name: "Verified identity" });
  expect(screen.getByRole("heading", { level: 1, name: /Test User/ }).querySelector(".bw-verification-badge")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Verify my identity" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Identity verification requirements" })).toBeNull();
  expect(screen.getByText("Your identity is verified by BrightWay.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "View identity review status" }).getAttribute("href")).toBe("/manual-identity");
  const request = fetchMock.mock.calls.find(([url]) => url.endsWith("/manual-identity/status"))[1];
  expect(request).toMatchObject({ credentials: "include", cache: "no-store" });
});
it.each(["NOT_STARTED", "SUBMITTED", "IN_REVIEW", "ACTION_REQUIRED", "DECLINED", "INVALIDATED", "EXPIRED"])("does not show a blue mark for %s despite forged flags in cached profile/account data", async (state) => {
  const canSubmit = !["SUBMITTED", "IN_REVIEW"].includes(state);
  mount(async () => response(status({ status: state, identityVerified: false, canSubmit })));
  await screen.findByRole("heading", { name: "Test User", exact: true });
  await waitFor(() => expect(screen.queryByText("Checking identity verification status…")).toBeNull());
  expect(screen.queryByRole("img", { name: "Verified identity" })).toBeNull();
  expect(Boolean(screen.queryByRole("link", { name: "Verify my identity" }))).toBe(canSubmit);
});
it("keeps the verification action hidden while status is pending instead of flashing it before approval loads", async () => {
  let release; const pending = new Promise((resolve) => { release = resolve; }); mount(async () => pending);
  await screen.findByRole("heading", { name: "Test User", exact: true });
  expect(screen.queryByRole("link", { name: "Verify my identity" })).toBeNull(); expect(screen.queryByRole("img", { name: "Verified identity" })).toBeNull();
  await act(async () => { release(response(status())); }); await screen.findByRole("img", { name: "Verified identity" });
  expect(screen.queryByRole("link", { name: "Verify my identity" })).toBeNull();
});
it.each([{ accountId: "another-account" }, { profileVersion: 2 }, { identityVerified: "true" }])("rejects mismatched or malformed status without granting a badge: %j", async (override) => {
  mount(async () => response(status(override)));
  await screen.findByText(/Reload your saved profile to check the latest identity verification status/);
  expect(screen.queryByRole("img", { name: "Verified identity" })).toBeNull(); expect(screen.queryByRole("link", { name: "Verify my identity" })).toBeNull();
});
it("removes the badge when current server status invalidates approval and preserves unsaved profile edits", async () => {
  let approved = true;
  const { user, fetchMock } = mount(async () => response(approved ? status() : status({ status: "INVALIDATED", identityVerified: false, canSubmit: true })));
  await screen.findByRole("img", { name: "Verified identity" });
  await user.click(screen.getByRole("button", { name: "Edit introduction", exact: true }));
  fireEvent.change(screen.getByLabelText("Headline", { exact: true }), { target: { value: "Keep my unsaved headline" } });
  await user.click(screen.getByRole("button", { name: "Close editor and keep edits" }));
  approved = false; act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/manual-identity/status"))).toHaveLength(2));
  await waitFor(() => expect(screen.queryByRole("img", { name: "Verified identity" })).toBeNull());
  await user.click(screen.getByRole("button", { name: "Edit introduction", exact: true }));
  expect(screen.getByLabelText("Headline", { exact: true }).value).toBe("Keep my unsaved headline");
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/profile/me"))).toHaveLength(1);
});
it("clears an old badge when a refresh fails and provides an explicit retry", async () => {
  let available = true;
  const { user } = mount(async () => available ? response(status()) : response("Verification service temporarily unavailable.", 503));
  await screen.findByRole("img", { name: "Verified identity" }); available = false;
  await user.click(screen.getByRole("button", { name: "Refresh verification status" }));
  await screen.findByText("Verification service temporarily unavailable."); expect(screen.queryByRole("img", { name: "Verified identity" })).toBeNull(); expect(screen.queryByRole("link", { name: "Verify my identity" })).toBeNull();
  available = true; await user.click(screen.getByRole("button", { name: "Refresh verification status" })); await screen.findByRole("img", { name: "Verified identity" });
});
function StatusHarness({ version }) {
  const { identityStatus } = useIdentityStatus(version);
  return hasVerifiedIdentity(identityStatus) ? <VerificationBadge /> : <span>No current badge</span>;
}
it("immediately stops using approval from an earlier saved profile version while the new version is checked", async () => {
  let release; const pending = new Promise((resolve) => { release = resolve; });
  const fetchMock = vi.fn().mockImplementationOnce(async () => response(status())).mockImplementationOnce(() => pending); vi.stubGlobal("fetch", fetchMock);
  const view = (version) => <AuthContext.Provider value={{ account }}><StatusHarness version={version} /></AuthContext.Provider>;
  const { rerender } = render(view(1)); await screen.findByRole("img", { name: "Verified identity" });
  rerender(view(2)); expect(screen.queryByRole("img", { name: "Verified identity" })).toBeNull();
  await act(async () => { release(response(status({ profileVersion: 2, status: "INVALIDATED", identityVerified: false, canSubmit: true }))); });
  expect(screen.queryByRole("img", { name: "Verified identity" })).toBeNull();
});

it("preserves a completion entry for legacy accounts with missing DOB without offering submission or granting a badge", async () => {
  mount(async () => response(status({ status: "NOT_STARTED", identityVerified: false, identityDetailsComplete: false, canSubmit: false })));
  const link = await screen.findByRole("link", { name: "Complete identity details" }); expect(link.getAttribute("href")).toBe("/manual-identity");
  expect(screen.queryByRole("img", { name: "Verified identity" })).toBeNull(); expect(screen.queryByRole("link", { name: "Verify my identity" })).toBeNull();
});
