import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { expect, it, vi } from "vitest";
import AuthProvider from "../auth/AuthProvider";
import AppRoutes from "../routes/AppRoutes";
import AccountSecurityPage from "../pages/AccountSecurityPage";
import { theme } from "../styles/theme";
const account = { id: "account", username: "tester", person: { id: "person", firstName: "Test", lastName: "User" } };
const profile = { version: 0, education: { mode: "UNSET", records: [] }, experience: { mode: "UNSET", records: [] }, location: {}, skills: [], interests: [] };
const response = (data, status = 200) => new Response(JSON.stringify({ success: status < 400, ...(status < 400 ? { data } : { message: data }) }), { status, headers: { "Content-Type": "application/json" } });
function loginMount(handler) {
  const fetchMock = vi.fn(async (url, options) => {
    if (url.endsWith("/auth/me")) return response("Log in required", 401);
    if (url.endsWith("/profile/me")) return response({ profile });
    return handler(url, options);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<ThemeProvider theme={theme}><MemoryRouter initialEntries={["/login"]}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter></ThemeProvider>);
  return { user: userEvent.setup(), fetchMock };
}
async function passwordStep(user) {
  await user.type(await screen.findByLabelText("Username or email"), "tester");
  await user.type(screen.getByLabelText("Password"), "correct password");
  await user.click(screen.getByRole("button", { name: "Log in" }));
  await screen.findByLabelText("Authenticator or backup code");
}
it("keeps the user outside protected pages until the second step succeeds and never sends the password again", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const { user, fetchMock } = loginMount((url) => url.endsWith("/auth/login") ? response({ mfaRequired: true }) : pending);
  await passwordStep(user);
  expect(screen.queryByLabelText("Password")).toBeNull();
  expect(screen.getByRole("heading", { name: "Verify your sign-in" })).toBeTruthy();
  await user.type(screen.getByLabelText("Authenticator or backup code"), "123456");
  const form = screen.getByLabelText("Authenticator or backup code").closest("form");
  fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/verify-login"))).toHaveLength(1));
  expect(screen.queryByRole("heading", { name: "Explore" })).toBeNull();
  const options = fetchMock.mock.calls.find(([url]) => url.endsWith("/verify-login"))[1];
  expect(JSON.parse(options.body)).toEqual({ code: "123456" }); expect(options.credentials).toBe("include");
  release(response({ account })); await screen.findByRole("heading", { name: "Explore" });
});
it("a rejected second factor preserves the code and never grants access", async () => {
  const { user } = loginMount(async (url) => url.endsWith("/auth/login") ? response({ mfaRequired: true }) : url.endsWith("/cancel-login") ? response({}) : response("Invalid or expired authentication code.", 401));
  await passwordStep(user); await user.type(screen.getByLabelText("Authenticator or backup code"), "123456");
  await user.click(screen.getByRole("button", { name: "Verify and log in" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Invalid or expired");
  expect(screen.getByLabelText("Authenticator or backup code").value).toBe("123456");
  expect(screen.queryByRole("heading", { name: "Explore" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Use another account" }));
  expect((await screen.findByLabelText("Password")).value).toBe("");
});
function securityMount(handler) {
  const fetchMock = vi.fn(handler); vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><AccountSecurityPage /></MemoryRouter>);
  return { user: userEvent.setup(), fetchMock };
}
it("shows setup only after password confirmation and displays backup codes once after enabling", async () => {
  const codes = ["abcdef-123456-abcdef-123456", "123456-abcdef-123456-abcdef"];
  const { user, fetchMock } = securityMount(async (url) => response(url.endsWith("/setup") ? { secret: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", accountLabel: "BrightWay:tester" } : url.endsWith("/enable") ? { enabled: true, backupCodes: codes } : { enabled: false, backupCodesRemaining: 0 }));
  await screen.findByText("Not enabled");
  expect(screen.queryByText("Setup key")).toBeNull();
  await user.type(screen.getByLabelText("Current password"), "correct password");
  await user.click(screen.getByRole("button", { name: "Set up authenticator" }));
  await screen.findByText("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567");
  expect(screen.queryByLabelText("Current password")).toBeNull();
  await user.type(screen.getByLabelText("Authenticator code"), "123456");
  await user.click(screen.getByRole("button", { name: "Enable two-factor authentication" }));
  await screen.findByRole("heading", { name: "Save your backup codes" });
  expect(screen.queryByText("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567")).toBeNull();
  expect(screen.getByText(codes[0])).toBeTruthy();
  const sent = fetchMock.mock.calls.find(([url]) => url.endsWith("/enable"))[1]; expect(JSON.parse(sent.body)).toEqual({ code: "123456" });
  await user.click(screen.getByRole("button", { name: "I saved my codes" }));
  expect(screen.queryByText(codes[0])).toBeNull(); expect(screen.getByLabelText("Current password").value).toBe("");
});
it("retains an invalid setup code and does not show backup codes after rejection", async () => {
  const { user } = securityMount(async (url) => url.endsWith("/enable") ? response("Invalid authentication code.", 401) : response(url.endsWith("/setup") ? { secret: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", accountLabel: "BrightWay:tester" } : { enabled: false, backupCodesRemaining: 0 }));
  await screen.findByText("Not enabled"); await user.type(screen.getByLabelText("Current password"), "correct password");
  await user.click(screen.getByRole("button", { name: "Set up authenticator" }));
  await user.type(await screen.findByLabelText("Authenticator code"), "123456"); await user.click(screen.getByRole("button", { name: "Enable two-factor authentication" }));
  await screen.findByRole("alert"); expect(screen.getByLabelText("Authenticator code").value).toBe("123456");
  expect(screen.queryByRole("heading", { name: "Save your backup codes" })).toBeNull();
});
it("allows recently authenticated last-code recovery to request new backups without inventing another code", async () => {
  const { user, fetchMock } = securityMount(async (url) => response(url.endsWith("/backup-codes") ? { enabled: true, backupCodes: ["abcdef-123456-abcdef-123456"] } : { enabled: true, backupCodesRemaining: 0, canRegenerateWithPassword: true }));
  await screen.findByText("Enabled"); await user.type(screen.getByLabelText("Current password"), "correct password");
  await user.click(screen.getByRole("button", { name: "Generate new backup codes" }));
  await screen.findByRole("heading", { name: "Save your backup codes" });
  expect(JSON.parse(fetchMock.mock.calls.find(([url]) => url.endsWith("/backup-codes"))[1].body)).toEqual({ password: "correct password" });
});
