import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import AuthProvider from "../auth/AuthProvider";
import ProfileCompletion from "../components/profile/ProfileCompletion";
import AppRoutes from "../routes/AppRoutes";
import { theme } from "../styles/theme";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
const verifiedAt = "2026-10-17T17:00:00.000Z";
const original = {
  id: "profile", version: 4, photo: { id: "photo" }, headline: "Student", bio: null,
  location: { countryCode: "LR", region: "Montserrado", locality: "Monrovia" },
  careerField: { mode: "EXPLORING" }, skills: ["Communication"], interests: ["Technology"],
  contact: { email: "existing@example.com", emailVerifiedAt: null, phoneNumber: null, whatsappNumber: null,
    visibility: { email: "ONLY_ME", phone: "ONLY_ME", whatsapp: "ONLY_ME" } },
};
function checklist(verified = false, version = 4) {
  return { profileVersion: version, complete: false, knownRequirementsComplete: false, eligibleToRequestVerification: false,
    checks: [
      { code: "SKILL_REQUIRED", label: "At least one skill", editor: "skills", satisfied: true },
      { code: "PHONE_REQUIRED", label: "Phone number", editor: "contact", satisfied: false },
      { code: "EMAIL_VERIFICATION_REQUIRED", label: "Verified email", editor: "email", satisfied: verified },
    ], unresolved: [{ code: "INDIVIDUAL_REVIEW_NOT_IMPLEMENTED" }],
  };
}
const response = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const ok = (data) => response(200, { success: true, data });
function mount({ verify, send, getCompletion } = {}) {
  let verified = false;
  const fetchMock = vi.fn(async (url, options) => {
    if (url.endsWith("/work/access")) return ok({ hasWork: false });
    if (url.endsWith("/auth/me")) return ok({ account: { id: "account", username: "existing", email: original.contact.email,
      emailVerifiedAt: verified ? verifiedAt : null, person: { id: "person", firstName: "Existing", lastName: "User" } } });
    if (url.endsWith("/profile/me")) return ok({ profile: { ...original, completion: checklist(verified) } });
    if (url.endsWith("/profile/me/completion")) return ok(getCompletion ? getCompletion() : checklist(verified));
    if (url.endsWith("/auth/email/request")) return send ? send() : ok({ email: original.contact.email, expiresAt: new Date(Date.now() + 600000).toISOString(), retryAfterSeconds: 60 });
    if (url.endsWith("/auth/email/verify")) {
      if (verify) return verify(options);
      verified = true; return ok({ verified: true, emailVerifiedAt: verifiedAt });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<ThemeProvider theme={theme}><MemoryRouter initialEntries={["/profile"]}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter></ThemeProvider>);
  return fetchMock;
}
const ready = () => screen.findByRole("heading", { name: "Existing User" });
async function openVerification() {
  await userEvent.setup().click(screen.getByRole("button", { name: "Verify your email" }));
  return screen.findByLabelText("Email verification code");
}

it("allows legacy users to view their profile and uses the server checklist to open the missing field editor", async () => {
  const fetchMock = mount(); await ready();
  expect(screen.getByRole("heading", { name: "Profile checklist" })).toBeTruthy();
  expect(screen.getByText("2 items need attention.")).toBeTruthy();
  expect(screen.queryByText(/Country-specific region requirements/)).toBeNull();
  await userEvent.setup().click(screen.getByRole("button", { name: "Complete phone number" }));
  await screen.findByRole("dialog", { name: "Contact and privacy" });
  expect(screen.getByLabelText("Phone number").value).toBe("");
  expect(screen.queryByLabelText(/SMS/)).toBeNull();
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/profile/me"))).toHaveLength(1);
});

it("verifies an existing account without replacing unsaved profile edits or changing the profile version", async () => {
  const fetchMock = mount(); await ready(); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Edit introduction", exact: true }));
  fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "An unsaved headline" } });
  await user.click(screen.getByRole("button", { name: "Close editor and keep edits" }));
  expect(screen.getByText("Save your edits to update the checklist.")).toBeTruthy();
  await openVerification();
  await user.click(screen.getByRole("button", { name: "Send verification code" }));
  await screen.findByText(/Code sent. Check your inbox/);
  expect(screen.getByRole("button", { name: /Resend code in/ }).disabled).toBe(true);
  await user.type(screen.getByLabelText("Email verification code"), "123456");
  await user.click(screen.getByRole("button", { name: "Verify email", exact: true }));
  await screen.findByText("Email verified. Your unsaved profile edits are still here.");
  await screen.findByText("1 item needs attention.");
  expect(screen.queryByRole("button", { name: "Verify your email" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Edit introduction", exact: true }));
  expect(screen.getByLabelText("Headline").value).toBe("An unsaved headline");
  expect(fetchMock.mock.calls.some(([, options]) => options.method === "PATCH")).toBe(false);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/profile/me"))).toHaveLength(1);
  const [, request] = fetchMock.mock.calls.find(([url]) => url.endsWith("/auth/email/request"));
  const [, proof] = fetchMock.mock.calls.find(([url]) => url.endsWith("/auth/email/verify"));
  expect(JSON.parse(request.body)).toEqual({});
  expect(JSON.parse(proof.body)).toEqual({ code: "123456" });
  expect(proof.credentials).toBe("include");
});

it("retains an unverified checklist after a wrong code and shows its server error", async () => {
  mount({ verify: () => response(400, { success: false, message: "That code is invalid or expired." }) }); await ready();
  await openVerification(); const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email verification code"), "000000");
  await user.click(screen.getByRole("button", { name: "Verify email", exact: true }));
  expect((await screen.findByRole("alert")).textContent).toContain("invalid or expired");
  expect(screen.getByText("2 items need attention.")).toBeTruthy();
  expect(screen.queryByText(/Email verified. Your/)).toBeNull();
});

it("reports email delivery failure without claiming the address is verified or changing login access", async () => {
  mount({ send: () => response(503, { success: false, message: "Verification email could not be sent." }) }); await ready();
  await openVerification(); await userEvent.setup().click(screen.getByRole("button", { name: "Send verification code" }));
  expect((await screen.findByRole("alert")).textContent).toContain("could not be sent");
  expect(screen.getByRole("heading", { name: "Existing User" })).toBeTruthy();
  expect(screen.getByText("2 items need attention.")).toBeTruthy();
  expect(screen.queryByText(/Code sent. Check/)).toBeNull();
});

it("does not replace the checklist or drafts when a refresh belongs to a newer saved profile version", async () => {
  mount({ getCompletion: () => checklist(true, 5) }); await ready();
  await userEvent.setup().click(screen.getByRole("button", { name: "Refresh checklist" }));
  await screen.findByText(/Your saved profile changed. Reload/);
  expect(screen.getByText("2 items need attention.")).toBeTruthy();
});

it("blocks duplicate verification submissions and other profile edits while verification is pending", async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const fetchMock = mount({ verify: () => pending }); await ready();
  await openVerification(); const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email verification code"), "123456");
  const form = screen.getByLabelText("Email verification code").closest("form");
  fireEvent.submit(form); fireEvent.submit(form);
  expect(screen.getByRole("button", { name: "Edit introduction", exact: true }).disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Close email verification" }).disabled).toBe(true);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/auth/email/verify"))).toHaveLength(1);
  finish(response(400, { success: false, message: "Please try again." }));
  await screen.findByRole("alert");
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit introduction", exact: true }).disabled).toBe(false));
});

it("uses the server county requirement to open the introduction editor", async () => {
  const onEdit = vi.fn();
  const completion = { ...checklist(), checks: [{ code: "COUNTY_REQUIRED", label: "County (Liberia)", editor: "intro", satisfied: false }] };
  render(<ProfileCompletion profile={{ ...original, completion }} busy={false} dirty={false} onEdit={onEdit} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Complete county (liberia)" }));
  expect(onEdit).toHaveBeenCalledWith("intro");
  expect(screen.getByText("1 item needs attention.")).toBeTruthy();
});

it("labels complete profile information separately from identity verification", () => {
  const completion = { ...checklist(), complete: true, knownRequirementsComplete: true,
    checks: [{ code: "COUNTY_REQUIRED", label: "County (Liberia)", editor: "intro", satisfied: true }] };
  render(<ProfileCompletion profile={{ ...original, completion }} busy={false} dirty={false} />);
  expect(screen.getByText("Profile information complete.")).toBeTruthy();
  expect(screen.getByText(/Completing your information does not verify your identity/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Complete county (liberia)" })).toBeNull();
});

function identityReadyProfile() {
  return { ...original, completion: { profileVersion: 4, complete: true, eligibleToRequestVerification: true,
    checks: [{ code: "PHONE_REQUIRED", label: "Phone number", editor: "contact", satisfied: true }],
    manualVerificationEligibility: { requirementsMet: true, checks: [
      { code: "PROFILE_COMPLETE_REQUIRED", satisfied: true },
      { code: "VERIFIED_EDUCATION_REQUIRED", satisfied: true },
      { code: "VERIFIED_EXPERIENCE_REQUIRED", satisfied: true },
    ] },
  } };
}
function renderIdentityChecklist(profile, props = {}) {
  return render(<MemoryRouter><ProfileCompletion profile={profile} busy={false} dirty={false} identityStatus={{ profileVersion: profile.version, status: "NOT_STARTED", identityVerified: false, canSubmit: true }} {...props} /></MemoryRouter>);
}
it("shows the identity verification action only when all three saved server requirements are met", () => {
  renderIdentityChecklist(identityReadyProfile());
  expect(screen.getByRole("link", { name: "Verify my identity" }).getAttribute("href")).toBe("/manual-identity");
});
it.each(["PROFILE_COMPLETE_REQUIRED", "VERIFIED_EDUCATION_REQUIRED", "VERIFIED_EXPERIENCE_REQUIRED"])("hides the identity verification action when %s is not met, even if a summary flag is inconsistent", (code) => {
  const profile = identityReadyProfile(); profile.completion.manualVerificationEligibility.checks.find((check) => check.code === code).satisfied = false;
  renderIdentityChecklist(profile);
  expect(screen.queryByRole("link", { name: "Verify my identity" })).toBeNull();
  expect(screen.getByText("Still needed")).toBeTruthy();
});
it("hides the identity action when eligibility data is missing or belongs to a stale profile revision", () => {
  const profile = identityReadyProfile(); delete profile.completion.manualVerificationEligibility;
  const { unmount } = renderIdentityChecklist(profile);
  expect(screen.queryByRole("link", { name: "Verify my identity" })).toBeNull(); unmount();
  const stale = identityReadyProfile(); stale.completion.profileVersion = 3;
  renderIdentityChecklist(stale); expect(screen.queryByRole("link", { name: "Verify my identity" })).toBeNull();
});
it.each([{ dirty: true }, { busy: true }])("hides the identity action while unsaved edits or an in-flight change exist: %j", (props) => {
  renderIdentityChecklist(identityReadyProfile(), props);
  expect(screen.queryByRole("link", { name: "Verify my identity" })).toBeNull();
});
it("does not expose an unconditional identity action at the top of an incomplete profile", async () => {
  mount(); await ready();
  expect(screen.queryByRole("link", { name: "Identity verification" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Verify my identity" })).toBeNull();
  expect(screen.getByRole("button", { name: "Verify your email" })).toBeTruthy();
});
