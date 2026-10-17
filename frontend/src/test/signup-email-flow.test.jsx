import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import AuthProvider from "../auth/AuthProvider";
import AppRoutes from "../routes/AppRoutes";
import { theme } from "../styles/theme";

const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const ok = (data = {}) => reply(200, { success: true, data });
const bad = (message, status = 400) => reply(status, { success: false, message });
async function start(handler) {
  const fetchMock = vi.fn(async (url, options) => {
    if (url.endsWith("/me")) return bad("Please log in", 401);
    if (url.endsWith("/signup-drafts")) return ok({ expiresAt: new Date(Date.now() + 1800000).toISOString() });
    if (url.endsWith("/signup-drafts/photo")) return ok({ photoAssetId: "11111111-1111-4111-8111-111111111111" });
    return handler(url, options);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<ThemeProvider theme={theme}><MemoryRouter initialEntries={["/register"]}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter></ThemeProvider>);
  const user = userEvent.setup();
  await screen.findByRole("heading", { name: "Create your BrightWay account" });
  for (const [label, value] of [["First name", "Test"], ["Last name", "User"], ["Username", "tester"], ["Email", "Tester@Example.com"],
    ["Password", "A long personal passphrase!"], ["Confirm password", "A long personal passphrase!"]]) {
    await user.type(screen.getByLabelText(label, { exact: true }), value);
  }
  await user.upload(screen.getByLabelText("Professional profile photo"), new File(["photo"], "photo.png", { type: "image/png" }));
  fireEvent.submit(screen.getByLabelText("Professional profile photo").closest("form"));
  await screen.findByRole("heading", { name: "Verify your email" });
  return { user, fetchMock };
}
const challenge = () => ok({ expiresAt: new Date(Date.now() + 600000).toISOString(), retryAfterSeconds: 60 });

it("never creates an account after a wrong code and keeps entered details when going back", async () => {
  const { user, fetchMock } = await start(async (url) => url.endsWith("/request") ? challenge() : bad("That code is invalid or expired."));
  await user.type(screen.getByLabelText("Verification code"), "000000");
  await user.click(screen.getByRole("button", { name: "Verify email and create account" }));
  expect((await screen.findByRole("alert")).textContent).toContain("invalid or expired");
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/register"))).toBe(false);
  await user.click(screen.getByRole("button", { name: "Back to registration details" }));
  expect(screen.getByLabelText("Email", { exact: true }).value).toBe("Tester@Example.com");
  expect(screen.getByLabelText("Password", { exact: true }).value).toBe("A long personal passphrase!");
  expect(screen.getByText("Selected photo: photo.png")).toBeTruthy();
  expect(screen.getByLabelText("Professional profile photo").required).toBe(false);
});

it("keeps verified email when account creation fails and retries without reusing the code", async () => {
  let registrations = 0;
  const { user, fetchMock } = await start(async (url) => {
    if (url.endsWith("/request")) return challenge();
    if (url.endsWith("/verify")) return ok({ verified: true });
    if (url.endsWith("/register")) {
      registrations++;
      return registrations === 1 ? bad("Temporarily unavailable", 503) : ok({ account: { id: "created" } });
    }
    throw new Error("Unexpected request");
  });
  await user.type(screen.getByLabelText("Verification code"), "123456");
  await user.click(screen.getByRole("button", { name: "Verify email and create account" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Temporarily unavailable");
  expect(screen.getByRole("status").textContent).toContain("Email verified");
  await user.click(screen.getByRole("button", { name: "Create account", exact: true }));
  await screen.findByRole("heading", { name: "Log in to BrightWay" });
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/verify"))).toHaveLength(1);
  expect(registrations).toBe(2);
});

it("reports email delivery failure without claiming verification or creating an account", async () => {
  const { fetchMock } = await start(async () => bad("Verification email could not be sent. Please wait a minute and try again.", 503));
  expect((await screen.findByRole("alert")).textContent).toContain("could not be sent");
  expect(screen.queryByText("Email verified")).toBeNull();
  expect(screen.getByRole("button", { name: /Resend code in/ }).disabled).toBe(true);
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/register"))).toBe(false);
});

it("blocks duplicate submissions and leaving the verification step while verification is pending", async () => {
  let complete;
  const verification = new Promise((resolve) => { complete = resolve; });
  const { user, fetchMock } = await start(async (url) => {
    if (url.endsWith("/request")) return challenge();
    if (url.endsWith("/verify")) return verification;
    if (url.endsWith("/register")) return ok({ account: { id: "created" } });
  });
  await user.type(screen.getByLabelText("Verification code"), "123456");
  const form = screen.getByLabelText("Verification code").closest("form");
  fireEvent.submit(form);
  expect(screen.getByRole("button", { name: "Back to registration details" }).matches(":disabled")).toBe(true);
  fireEvent.submit(form);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/verify"))).toHaveLength(1);
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/register"))).toBe(false);
  complete(ok({ verified: true }));
  await screen.findByRole("heading", { name: "Log in to BrightWay" });
});