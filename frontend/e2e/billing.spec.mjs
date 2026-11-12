import { expect, test } from "@playwright/test";
import { backgroundMessaging } from "./support/background-messaging.mjs";
import { organizationWorkspace } from "../../shared/organization-workspace.mjs";
const orgId = "55555555-5555-4555-8555-555555555555", accountId = "44444444-4444-4444-8444-444444444444", chargeId = "33333333-3333-4333-8333-333333333333", paymentId = "22222222-2222-4222-8222-222222222222";
const base = `/organization-workspace/${orgId}`, staff = { id: `mg_${orgId}`, username: "synthetic_billing", fullName: "Synthetic Billing Admin", realm: "management", isSuperAdmin: false };
async function fixture(page) {
  const state = { errors: [], unexpected: [], reports: [], decisions: [], adjustments: [], status: "PENDING", credit: 0, failReport: true, stepUps: 0 };
  const organization = { id: orgId, name: "Synthetic Academy", type: "SCHOOL", offersTraining: false, campus: { status: "ACTIVE", engine: "GRADE_SCHOOL", active: true } }, permissions = ["organization.campus.billing.manage"];
  page.on("pageerror", e => state.errors.push(e.message));
  await page.route("**/*", async route => {
    const bg = backgroundMessaging(route); if (bg) return bg;
    const url = new URL(route.request().url()), p = url.pathname, method = route.request().method(); if (!p.startsWith("/api/")) return route.continue();
    const reply = (data, status = 200) => route.fulfill({ status, json: status < 400 ? { success: true, data } : { success: false, message: data } });
    const report = { id: paymentId, campusId: orgId, schoolName: organization.name, amountCents: 100, reference: "Synthetic transfer 808", status: state.status, createdAt: "2026-11-12", allocations: [{ chargeId, amountCents: 100 }] };
    const statement = { campusId: orgId, currency: "USD", balanceCents: state.status === "CONFIRMED" ? state.credit : 100 + state.credit, nextCursor: null, semesters: [], periods: [], institutionFees: "Institution tuition, program and material fees remain separate.", charges: [{ id: chargeId, engine: "GRADE_SCHOOL", learner: { fullName: "Synthetic Learner", username: "learner" }, label: "Semester 1", amountCents: 100, balanceCents: state.status === "CONFIRMED" ? state.credit : 100 + state.credit, dueAt: "2026-12-01", noticeAt: null, enforceAt: null, restricted: false, adjustments: [] }], payments: state.reports.length || state.decisions.length ? [report] : [], ledger: [{ id: "ledger", kind: "CHARGE", amountCents: 100, chargeId, createdAt: "2026-11-12" }] };
    if (p === "/api/v1/auth/me") return reply({ account: { id: accountId, username: "synthetic_owner", person: { firstName: "Synthetic", lastName: "Owner" } } });
    if (p === "/api/v1/profile/me") return reply({ profile: { version: 1, photo: null, location: {}, skills: [], interests: [] } });
    if (p === "/api/v1/work/access") return reply({ hasWork: true });
    if (p === "/api/v1" + base) return reply({ accountId, organization, membership: { role: "PRIMARY_ADMIN", version: 1 }, permissions, staffVersion: 1, permissionCatalog: [], setupRequired: false, setup: { organization, required: false, version: 5, canEdit: true }, workspace: organizationWorkspace(organization, permissions, "PRIMARY_ADMIN") });
    if (p === "/api/v1" + base + "/campus") return reply({ organizationId: orgId, eligible: true, eligibility: { eligible: true, verifiedOrganization: true, verifiedLiberiaOperation: true, productEnabled: true, supportedEngines: ["GRADE_SCHOOL"], reasons: [] }, campus: { engine: "GRADE_SCHOOL", status: "ACTIVE", storedStatus: "ACTIVE", version: 2, displayName: organization.name, contactEmail: null }, permissions, canSetup: true, canManage: true, canAnnounce: false });
    if (p === "/api/v1" + base + "/campus/announcements") return reply({ items: [], nextCursor: null });
    if (["/api/v1" + base + "/campus/billing", `/api/v1/management/billing/${orgId}`].includes(p)) return reply(statement);
    if (p === "/api/v1" + base + "/campus/billing/payments" && method === "POST") { state.reports.push(route.request().postDataJSON()); if (state.failReport) { state.failReport = false; return reply("Synthetic connection loss; keep your receipt and retry.", 503); } return reply({ id: paymentId, status: state.status }); }
    if (p === "/api/v1/management/auth/me") return reply({ staff });
    if (p === "/api/v1/management") return reply({ allowed: true, staffId: staff.id, username: staff.username, fullName: staff.fullName, role: { label: "Billing Admin", isSuperAdmin: false, version: 1 }, tools: [{ key: "billing", label: "Campus billing", to: "/management/billing", allowed: true, description: "Verify platform payments" }], audits: [] });
    if (p === "/api/v1/management/billing") return reply({ items: state.status === "PENDING" ? [report] : [], nextCursor: null });
    if (p === "/api/v1/management/billing/accounts") return reply({ items: [{ campusId: orgId, displayName: organization.name }], nextCursor: null });
    if (p === "/api/v1/management/security/step-up") { state.stepUps++; return reply({ verified: true }); }
    if (p === `/api/v1/management/billing/${orgId}/payments/${paymentId}/decision`) { state.decisions.push(route.request().postDataJSON()); state.status = state.decisions.at(-1).decision === "CONFIRM" ? "CONFIRMED" : "REJECTED"; return reply({ id: paymentId, status: state.status }); }
    if (p === `/api/v1/management/billing/${orgId}/charges/${chargeId}/adjustments`) { const b = route.request().postDataJSON(); state.adjustments.push(b); state.credit += b.amountCents; return reply({ id: "adjustment" }); }
    state.unexpected.push(method + " " + p); return reply("Unexpected synthetic request", 500);
  });
  return state;
}
async function freshMfa(page) { const d = page.getByRole("dialog"); await d.getByLabel("Your management password").fill("synthetic password"); await d.getByLabel("Fresh management MFA code").fill("123456"); await d.getByRole("button", { name: "Confirm action" }).click(); await expect(d).toHaveCount(0); }
const clean = state => { expect(state.errors).toEqual([]); expect(state.unexpected).toEqual([]); };
const layout = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
test("institution bulk payment preserves a failed report and its idempotency key", async ({ page }) => {
  const s = await fixture(page); await page.goto(base + "/campus"); await page.getByText("Campus billing & payments", { exact: true }).click();
  await page.getByRole("button", { name: "Select outstanding shown" }).click(); await page.getByLabel("Payment reference", { exact: true }).fill("Synthetic transfer 808"); await page.getByRole("button", { name: "Report payment for confirmation" }).click();
  await expect(page.getByRole("alert")).toContainText("keep your receipt"); await expect(page.getByLabel("Payment reference", { exact: true })).toHaveValue("Synthetic transfer 808"); await page.getByRole("button", { name: "Report payment for confirmation" }).click(); await expect(page.getByText("PENDING", { exact: true })).toBeVisible(); expect(s.reports).toHaveLength(2); expect(s.reports[0].requestKey).toBe(s.reports[1].requestKey); expect(s.reports[1].allocations).toEqual([{ chargeId, amountCents: 100 }]); await layout(page); clean(s);
});
test("Billing Admin confirms a receipt with fresh MFA and retains one settlement", async ({ page }) => {
  const s = await fixture(page); await page.goto("/superadmin/billing"); await page.getByRole("button", { name: "Review receipt" }).click(); await page.getByRole("combobox", { name: "Decision", exact: true }).selectOption("CONFIRM"); await page.getByLabel("Verified receipt reference (confirmation only)").fill("SETTLEMENT-808"); await page.getByLabel("Review reason").fill("Verified the actual institution transfer."); await page.getByRole("button", { name: "Save payment decision" }).click(); await freshMfa(page); await expect(page.getByText("No pending payment reports.")).toBeVisible(); expect(s.decisions).toHaveLength(1); expect(s.decisions[0].settlementReference).toBe("SETTLEMENT-808"); expect(s.stepUps).toBe(1); await layout(page); clean(s);
});
test("Billing Admin credits a charge with a reason and fresh MFA", async ({ page }) => {
  const s = await fixture(page); await page.goto("/superadmin/billing"); await page.getByRole("button", { name: "Review statement" }).click(); await page.getByRole("button", { name: "Adjust fee" }).click(); await page.getByLabel("Adjustment (USD cents)").fill("-100"); await page.getByLabel("Reason", { exact: true }).fill("Authorized institution waiver of this fee."); await page.getByRole("button", { name: "Record adjustment" }).click(); await freshMfa(page); expect(s.adjustments).toHaveLength(1); expect(s.adjustments[0].amountCents).toBe(-100); expect(s.stepUps).toBe(1); await expect(page.getByText("Settled", { exact: true })).toBeVisible(); await layout(page); clean(s);
});
