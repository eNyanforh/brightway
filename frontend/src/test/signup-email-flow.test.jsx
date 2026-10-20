import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import AuthProvider from "../auth/AuthProvider";
import AppRoutes from "../routes/AppRoutes";
import { theme } from "../styles/theme";
import { enterEmail, verifyEmail, enterPersonalAndPassword, submitPhoto } from "./signup-helpers";

const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const ok = (data = {}) => reply(200, { success: true, data });
const bad = (message, status = 400) => reply(status, { success: false, message });
const challenge = () => ok({ expiresAt: new Date(Date.now() + 600000).toISOString(), retryAfterSeconds: 60 });
async function start(handler) {
  const draftExpiresAt = new Date(Date.now() + 1800000).toISOString();
  const fetchMock = vi.fn(async (url, options) => {
    if (url.endsWith("/me")) return bad("Please log in", 401);
    if (url.endsWith("/signup-drafts")) return ok({ expiresAt: draftExpiresAt });
    if (url.endsWith("/signup-drafts/photo")) return ok({ photoAssetId: "11111111-1111-4111-8111-111111111111" });
    return handler(url, options);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<ThemeProvider theme={theme}><MemoryRouter initialEntries={["/register"]}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter></ThemeProvider>);
  const user = userEvent.setup();
  await enterEmail(user);
  return { user, fetchMock };
}

it("rejects wrong codes before showing personal information, password or photo", async () => {
  const { user, fetchMock } = await start(async (url) => url.endsWith("/request") ? challenge() : bad("That code is invalid or expired."));
  await user.type(screen.getByLabelText("Verification code"), "000000");
  await user.click(screen.getByRole("button", { name: "Verify email and continue" }));
  expect((await screen.findByRole("alert")).textContent).toContain("invalid or expired");
  for (const label of ["First name", "Password", "Professional profile photo"]) expect(screen.queryByLabelText(label, { exact: true })).toBeNull();
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/register") || url.endsWith("/photo"))).toBe(false);
  await user.click(screen.getByRole("button", { name: "Change email" }));
  expect(screen.getByLabelText("Email", { exact: true }).value).toBe("Tester@Example.com");
});

it("keeps verified email and the uploaded photo when account creation fails and allows retry", async () => {
  let registrations = 0;
  const { user, fetchMock } = await start(async (url) => {
    if (url.endsWith("/request")) return challenge();
    if (url.endsWith("/verify")) return ok({ verified: true });
    if (url.endsWith("/register")) return ++registrations === 1 ? bad("Temporarily unavailable", 503) : ok({ account: { id: "created" } });
    throw new Error("Unexpected request");
  });
  await verifyEmail(user);
  await enterPersonalAndPassword(user);
  await submitPhoto(user);
  expect((await screen.findByRole("alert")).textContent).toContain("Temporarily unavailable");
  expect(screen.getByText("Selected photo: photo.png")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Create account", exact: true }));
  await screen.findByRole("heading", { name: "Log in to BrightWay" });
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/verify"))).toHaveLength(1);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/signup-drafts/photo"))).toHaveLength(1);
  expect(registrations).toBe(2);
});

it("reports delivery failure and enforces resend cooldown without advancing", async () => {
  const { fetchMock } = await start(async () => bad("Verification email could not be sent. Please wait a minute and try again.", 503));
  expect((await screen.findByRole("alert")).textContent).toContain("could not be sent");
  expect(screen.getByRole("button", { name: /Resend code in/ }).disabled).toBe(true);
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/register"))).toBe(false);
});

it("blocks duplicate verification and leaving the step while the request is pending", async () => {
  let complete;
  const verification = new Promise((resolve) => { complete = resolve; });
  const { user, fetchMock } = await start(async (url) => url.endsWith("/request") ? challenge() : verification);
  await user.type(screen.getByLabelText("Verification code"), "123456");
  const form = screen.getByLabelText("Verification code").closest("form");
  fireEvent.submit(form); fireEvent.submit(form);
  expect(screen.getByRole("button", { name: "Change email" }).matches(":disabled")).toBe(true);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/verify"))).toHaveLength(1);
  complete(ok({ verified: true }));
  await screen.findByRole("heading", { name: "Tell us about yourself" });
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/register"))).toBe(false);
});

it("requires a new verification after changing the email and preserves personal details", async () => {
  const { user, fetchMock } = await start(async (url) => url.endsWith("/request") ? challenge() : ok({ verified: true }));
  await verifyEmail(user);
  await user.type(screen.getByLabelText("First name"), "Retained");
  await user.click(screen.getByRole("button", { name: "Back", exact: true }));
  const email = screen.getByLabelText("Email", { exact: true });
  await user.clear(email); await user.type(email, "other@example.com");
  await user.click(screen.getByRole("button", { name: "Continue to verification" }));
  await screen.findByRole("heading", { name: "Verify your email" });
  expect(JSON.parse(fetchMock.mock.calls.filter(([url]) => url.endsWith("/request")).at(-1)[1].body)).toEqual({ email: "other@example.com" });
  await verifyEmail(user);
  expect(screen.getByLabelText("First name").value).toBe("Retained");
  expect(screen.getByText("Email verified: other@example.com")).toBeTruthy();
});

it("renews expired proof without losing signup fields or reuploading the photo", async () => {
  let registrations = 0;
  const { user, fetchMock } = await start(async (url) => {
    if (url.endsWith("/request")) return ok({ expiresAt: new Date(Date.now() + 600000).toISOString(), retryAfterSeconds: 0 });
    if (url.endsWith("/verify")) return ok({ verified: true });
    return ++registrations === 1 ? bad("Verify your email before creating your account.", 403) : ok({ account: { id: "created" } });
  });
  await verifyEmail(user); await enterPersonalAndPassword(user); await submitPhoto(user);
  expect((await screen.findByRole("alert")).textContent).toContain("Verify your email");
  await screen.findByRole("heading", { name: "Verify your email" });
  await user.click(screen.getByRole("button", { name: "Resend code", exact: true }));
  await verifyEmail(user);
  expect(screen.getByLabelText("First name").value).toBe("Test");
  expect(screen.getByLabelText("Username").value).toBe("TESTER");
  await user.click(screen.getByRole("button", { name: "Continue", exact: true }));
  expect(screen.getByLabelText("Country of residence").value).toBe("LR");
  await user.click(screen.getByRole("button", { name: "Continue", exact: true }));
  expect(screen.getByLabelText("Password", { exact: true }).value).toBe("A long personal passphrase!");
  await user.click(screen.getByRole("button", { name: "Continue", exact: true }));
  expect(screen.getByText("Selected photo: photo.png")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Create account", exact: true }));
  await screen.findByRole("heading", { name: "Log in to BrightWay" });
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/verify"))).toHaveLength(2);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/signup-drafts/photo"))).toHaveLength(1);
});

it("keeps password and selected photo on Back and rejects mismatched passwords", async () => {
  const { user, fetchMock } = await start(async (url) => url.endsWith("/request") ? challenge() : ok({ verified: true }));
  await verifyEmail(user); await enterPersonalAndPassword(user);
  await user.upload(screen.getByLabelText("Professional profile photo"), new File(["photo"], "photo.png", { type: "image/png" }));
  await user.click(screen.getByRole("button", { name: "Back", exact: true }));
  expect(screen.getByLabelText("Password", { exact: true }).value).toBe("A long personal passphrase!");
  await user.type(screen.getByLabelText("Confirm password"), "wrong");
  await user.click(screen.getByRole("button", { name: "Continue", exact: true }));
  expect(screen.getByRole("alert").textContent).toContain("do not match");
  await user.clear(screen.getByLabelText("Confirm password"));
  await user.type(screen.getByLabelText("Confirm password"), "A long personal passphrase!");
  await user.click(screen.getByRole("button", { name: "Continue", exact: true }));
  expect(screen.getByText("Selected photo: photo.png")).toBeTruthy();
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/signup-drafts/photo"))).toBe(false);
});

it("blocks duplicate final submissions while registration is pending", async () => {
  let complete;
  const registration = new Promise((resolve) => { complete = resolve; });
  const { user, fetchMock } = await start(async (url) => {
    if (url.endsWith("/request")) return challenge();
    if (url.endsWith("/verify")) return ok({ verified: true });
    return registration;
  });
  await verifyEmail(user); await enterPersonalAndPassword(user); await submitPhoto(user);
  const form = screen.getByLabelText("Professional profile photo").closest("form");
  fireEvent.submit(form); fireEvent.submit(form);
  expect(screen.getByRole("button", { name: "Back", exact: true }).matches(":disabled")).toBe(true);
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/register"))).toHaveLength(1));
  complete(ok({ account: { id: "created" } }));
  await screen.findByRole("heading", { name: "Log in to BrightWay" });
});


it("requires valid personal details and a country, preserving both when navigating back", async () => {
  const { user, fetchMock } = await start(async (url) => url.endsWith("/request") ? challenge() : ok({ verified: true }));
  await verifyEmail(user);
  for (const [label, value] of [["First name", "Test"], ["Last name", "User"], ["Username", "tester"]]) {
    await user.type(screen.getByLabelText(label, { exact: true }), value);
  }
  await user.selectOptions(screen.getByLabelText("Gender"), "PREFER_NOT_TO_SAY");
  await user.type(screen.getByLabelText("Date of birth"), "2999-01-01");
  fireEvent.submit(screen.getByLabelText("Date of birth").closest("form"));
  expect(screen.getByRole("alert").textContent).toContain("not in the future");
  expect(screen.queryByLabelText("Country of residence")).toBeNull();
  await user.clear(screen.getByLabelText("Date of birth"));
  await user.type(screen.getByLabelText("Date of birth"), "2000-02-29");
  await user.click(screen.getByRole("button", { name: "Continue", exact: true }));
  await screen.findByRole("heading", { name: "Choose your country" });
  fireEvent.submit(screen.getByLabelText("Country of residence").closest("form"));
  expect(screen.getByRole("alert").textContent).toContain("Choose your country");
  expect(screen.queryByLabelText("Password", { exact: true })).toBeNull();
  await user.selectOptions(screen.getByLabelText("Country of residence"), "GH");
  await user.click(screen.getByRole("button", { name: "Continue", exact: true }));
  await screen.findByRole("heading", { name: "Create your password" });
  await user.click(screen.getByRole("button", { name: "Back", exact: true }));
  expect(screen.getByLabelText("Country of residence").value).toBe("GH");
  await user.click(screen.getByRole("button", { name: "Back", exact: true }));
  expect(screen.getByLabelText("Gender").value).toBe("PREFER_NOT_TO_SAY");
  expect(screen.getByLabelText("Date of birth").value).toBe("2000-02-29");
  expect(screen.getByLabelText("First name").value).toBe("Test");
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/register") || url.endsWith("/signup-drafts/photo"))).toBe(false);
});