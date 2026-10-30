import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { it, expect, vi } from "vitest";
import AuthProvider from "../auth/AuthProvider";
import AppRoutes from "../routes/AppRoutes";
import { authDestination } from "../auth/auth-destination";
import { theme } from "../styles/theme";
const account = { id: "staff", username: "founder", person: { firstName: "Named", lastName: "Administrator" } };
const management = { allowed: true, accountId: account.id, username: account.username, fullName: "Named Administrator", role: { label: "Super Admin", isSuperAdmin: true, version: 1, grantedAt: "2026-10-30T12:00:00Z" }, tools: [{ key: "identity", label: "Identity reviews", allowed: true, to: "/admin/manual-identity" }, { key: "credentials", label: "Credential reviews", allowed: false, to: "/admin/credentials" }], audits: [] };
const reply = (data, status = 200) => new Response(JSON.stringify({ success: status < 400, ...(status < 400 ? { data } : { message: data }) }), { status, headers: { "Content-Type": "application/json" } });
function Path() { return <output aria-label="Current path">{useLocation().pathname}</output>; }
function mount(path, handler, authenticated = false) {
  const fetch = vi.fn(async (url, options) => {
    if (url.endsWith("/auth/me")) return authenticated ? reply({ account }) : reply("Sign in required", 401);
    if (url.endsWith("/profile/me")) return reply({ profile: { version: 0, photo: null, location: {}, skills: [], interests: [] } });
    if (url.endsWith("/work/access")) return reply({ hasWork: false });
    return handler(url, options);
  }); vi.stubGlobal("fetch", fetch);
  render(<ThemeProvider theme={theme}><MemoryRouter initialEntries={[path]}><Path /><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter></ThemeProvider>);
  return { user: userEvent.setup(), fetch };
}
async function passwordStep(user) {
  await user.type(await screen.findByLabelText("Username or email"), " FOUNDER "); await user.type(screen.getByLabelText("Password"), " password with spaces ");
  await user.click(screen.getByRole("button", { name: "Continue securely" }));
}
it("direct superadmin access leads to the dedicated dark login without public administrator signup", async () => {
  mount("/superadmin", () => reply({})); await screen.findByRole("heading", { name: "Management sign-in" });
  expect(screen.getByLabelText("Current path").textContent).toBe("/superadmin/login"); expect(document.querySelector(".bw-superadmin-login")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Create an account" })).toBeNull(); expect(screen.queryByRole("navigation", { name: "Footer navigation" })).toBeNull();
});
it("management sign-in requires the second step and returns to superadmin with only the MFA code", async () => {
  const f = mount("/superadmin", url => reply(url.endsWith("/auth/login") ? { mfaRequired: true } : url.endsWith("/verify-login") ? { account } : management));
  await passwordStep(f.user); await screen.findByLabelText("Authenticator or backup code"); expect(f.fetch.mock.calls.some(([url]) => url.endsWith("/management"))).toBe(false);
  await f.user.type(screen.getByLabelText("Authenticator or backup code"), "123456"); await f.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  await screen.findByRole("heading", { name: "Welcome, Named Administrator" }); expect(screen.getByLabelText("Current path").textContent).toBe("/superadmin");
  expect(document.querySelector(".bw-management-shell")).toBeTruthy();
  const first = f.fetch.mock.calls.find(([url]) => url.endsWith("/auth/login")); expect(JSON.parse(first[1].body)).toEqual({ identifier: "founder", password: " password with spaces " });
  const second = f.fetch.mock.calls.find(([url]) => url.endsWith("/verify-login")); expect(JSON.parse(second[1].body)).toEqual({ code: "123456" }); expect(second[1].credentials).toBe("include");
});
it("a wrong management MFA code retains the code without opening the workspace", async () => {
  const f = mount("/superadmin/login", url => url.endsWith("/auth/login") ? reply({ mfaRequired: true }) : reply("Invalid second factor", 401));
  await passwordStep(f.user); await f.user.type(await screen.findByLabelText("Authenticator or backup code"), "123456"); await f.user.click(screen.getByRole("button", { name: "Verify and log in" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Invalid second factor"); expect(screen.getByLabelText("Authenticator or backup code").value).toBe("123456"); expect(f.fetch.mock.calls.some(([url]) => url.endsWith("/management"))).toBe(false);
});
it("ordinary signed-in users see denied access and cannot open operational routes", async () => {
  const f = mount("/superadmin/credentials", () => reply("Management permission required", 403), true);
  expect((await screen.findByRole("alert")).textContent).toContain("Management permission required"); expect(screen.queryByRole("heading", { name: "Credential Review" })).toBeNull(); expect(f.fetch.mock.calls.some(([url]) => url.includes("/credentials/reviews"))).toBe(false);
});
it("legacy management links lead through management login to the canonical route", async () => {
  mount("/management", () => reply({})); await screen.findByRole("heading", { name: "Management sign-in" }); expect(screen.getByLabelText("Current path").textContent).toBe("/superadmin/login");
});
it("signed-in staff can continue from management login and sign out back to its login", async () => {
  const f = mount("/superadmin/login", url => reply(url.endsWith("/logout") ? {} : management), true);
  await f.user.click(await screen.findByRole("button", { name: "Continue to Management" })); await screen.findByRole("heading", { name: "Welcome, Named Administrator" });
  await f.user.click(screen.getByRole("button", { name: "Open account menu" })); await f.user.click(screen.getByRole("button", { name: "Log out" }));
  await screen.findByRole("heading", { name: "Management sign-in" }); expect(screen.getByLabelText("Current path").textContent).toBe("/superadmin/login");
});
it("an unassigned operational deep link stays gated before its component can fetch private data", async () => {
  const f = mount("/superadmin/credentials", () => reply(management), true); await screen.findByRole("heading", { name: "Permission required" });
  expect(screen.queryByRole("heading", { name: "Credential Review" })).toBeNull(); expect(f.fetch.mock.calls.some(([url]) => url.includes("/credentials/reviews"))).toBe(false);
});
it("assigned operations retain the management shell and disappear after management revocation", async () => {
  let denied = false;
  const f = mount("/superadmin/identity", url => url.endsWith("/management") ? denied ? reply("Management revoked", 403) : reply(management) : reply({ requests: [] }), true);
  await screen.findByRole("heading", { name: "Identity review workspace" }); expect(document.querySelector(".bw-management-shell")).toBeTruthy(); expect(screen.getByRole("navigation", { name: "Management tools" })).toBeTruthy(); expect(screen.getByRole("link", { name: "Identity reviews", exact: true }).getAttribute("aria-current")).toBe("page");
  denied = true; act(() => window.dispatchEvent(new Event("focus"))); await waitFor(() => expect(screen.queryByRole("heading", { name: "Identity review workspace" })).toBeNull()); await screen.findByRole("alert"); expect(screen.queryByRole("navigation", { name: "Management tools" })).toBeNull();
  expect(f.fetch.mock.calls.some(([url]) => url.endsWith("/management"))).toBe(true);
});
it("login return destinations reject external and arbitrary paths", () => {
  expect(authDestination("/management")).toBe("/superadmin"); expect(authDestination("/superadmin/identity")).toBe("/superadmin"); expect(authDestination("/superadmin")).toBe("/superadmin");
  for (const path of ["//evil.invalid", "https://evil.invalid", "/superadministrator", "/unknown", undefined]) expect(authDestination(path)).toBe("/explore");
});
