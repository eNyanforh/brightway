import { createCampusService } from "../campus/campus.service.js";
import { assertManagementSession, managementPermission, lockReviewActors, conflictAccounts } from "../management/management-authority.js";
import { assessEligibility } from "../campus/campus.schema.js";
import { notify } from "../notifications/platform-notification.js";
import { billingAudit, chargeInclude, digest, ensureAccount, chargeRegistration, chargeEnrolment } from "./billing-core.js";
import * as s from "./billing.schema.js";
const BILLING = "organization.campus.billing.manage", id = value => { if (!/^[a-f\d-]{36}$/i.test(value || "")) throw s.fail(404, "Billing record is unavailable."); return value; };
const identity = { username: true, person: { select: { firstName: true, middleName: true, lastName: true } } };
const projectCharge = c => ({ id: c.id, engine: c.engine, label: c.label, amountCents: c.amountCents, createdAt: c.createdAt, ...s.accessState(c, new Date()), adjustments: c.adjustments.map(a => ({ id: a.id, amountCents: a.amountCents, reason: a.reason, createdAt: a.createdAt })), learner: c.learnerAccount ? { username: c.learnerAccount.username, fullName: [c.learnerAccount.person.firstName, c.learnerAccount.person.middleName, c.learnerAccount.person.lastName].filter(Boolean).join(" ") } : undefined });
export function createBillingService({ prisma, now = () => new Date() }) {
  const campus = createCampusService({ prisma, now });
  async function tx(fn) {
    try { return await prisma.$transaction(fn, { timeout: 30000, maxWait: 15000 }); }
    catch (e) { if (["P2002", "P2034"].includes(e.code)) throw s.fail(409, "This billing reference was already used or the balance changed. Reload saved billing records before retrying."); throw e; }
  }
  async function eligible(db, campusId, lock = false) {
    if (lock) await db.organization.update({ where: { id: campusId }, data: { staffVersion: { increment: 0 } } });
    const c = await db.virtualCampus.findUnique({ where: { organizationId: campusId }, include: { organization: { include: { locations: true, request: { select: { status: true } } } } } });
    const p = await db.productAvailability.findUnique({ where: { product_countryCode: { product: "VIRTUAL_CAMPUS", countryCode: "LR" } } });
    if (c?.status !== "ACTIVE" || !safelyEligible(c, p)) throw s.fail(409, "Billing requires an active eligible Virtual Campus.");
    return c;
  }
  const safelyEligible = (c, p) => { const e = assessEligibility(c.organization, p); return e.eligible && e.supportedEngines.includes(c.engine); };
  async function org(db, actor, campusId, write = false) {
    return campus.authorize(db, actor, id(campusId), { requireActive: true, capability: BILLING, write, lock: write });
  }
  async function admin(db, actor, campusId, write = false) {
    if (write) await lockReviewActors(db, [actor?.staffId]);
    await assertManagementSession(db, actor?.staffId, actor?.sessionId, now(), write);
    await managementPermission(db, actor.staffId, "billing-admin");
    if (campusId) {
      await eligible(db, id(campusId), write);
      if (write) {
        const related = await conflictAccounts(db, actor.staffId);
        if (await db.organizationMembership.findFirst({ where: { organizationId: campusId, accountId: { in: related }, enabled: true } })) throw s.fail(403, "A different Billing Admin must confirm payments or adjustments for an organization you belong to.");
      }
    }
  }
  async function statement(db, campusId, input) {
    const q = s.parse(s.page, input), where = { campusId };
    if (q.cursor && !await db.billingCharge.findFirst({ where: { ...where, id: q.cursor } })) throw s.fail(404, "Billing page is unavailable.");
    const [charges, payments, ledger, semesters, periods, totals] = await Promise.all([
      db.billingCharge.findMany({ where, include: { ...chargeInclude, learnerAccount: { select: identity } }, orderBy: { id: "asc" }, take: 51, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) }),
      db.campusPayment.findMany({ where, select: { id: true, amountCents: true, reference: true, status: true, settlementReference: true, reason: true, createdAt: true, decidedAt: true, allocations: { select: { chargeId: true, amountCents: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51 }),
      db.billingLedgerEntry.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51 }),
      db.billingSemester.findMany({ where, orderBy: { startsOn: "desc" } }),
      db.gradeSchoolPeriod.findMany({ where, select: { id: true, name: true, kind: true, billingSemesterId: true, startsOn: true, endsOn: true }, orderBy: { startsOn: "desc" } }),
      db.billingLedgerEntry.aggregate({ where, _sum: { amountCents: true } }),
    ]);
    return { campusId, currency: "USD", balanceCents: totals._sum.amountCents || 0, charges: charges.slice(0, 50).map(c => ({ ...projectCharge(c), ...s.accessState(c, now()) })), nextCursor: charges.length > 50 ? charges[49].id : null, payments: payments.slice(0, 50), nextPaymentCursor: payments.length > 50 ? payments[49].id : null, ledger: ledger.slice(0, 50), nextLedgerCursor: ledger.length > 50 ? ledger[49].id : null, semesters, periods, institutionFees: "Institution tuition, program and material fees are separate from this BrightWay platform ledger." };
  }
  return {
    async statement(actor, campusId, input = {}, management = false) {
      return tx(async db => { if (management) await admin(db, actor, campusId); else await org(db, actor, campusId);
        await db.organization.update({ where: { id: campusId }, data: { staffVersion: { increment: 0 } } });
        if (management) await admin(db, actor, campusId); else await org(db, actor, campusId);
        const result = await statement(db, campusId, input); if (management) await admin(db, actor, campusId); else await org(db, actor, campusId); return result; });
    },
    async history(actor, campusId, kind, input = {}, management = false) {
      if (!["payments", "ledger"].includes(kind)) throw s.fail(404, "Billing history is unavailable.");
      const q = s.parse(s.page, input);
      return tx(async db => { if (management) await admin(db, actor, campusId); else await org(db, actor, campusId);
        const model = kind === "payments" ? "campusPayment" : "billingLedgerEntry", where = { campusId };
        if (q.cursor && !await db[model].findFirst({ where: { ...where, id: q.cursor } })) throw s.fail(404, "History page is unavailable.");
        const select = kind === "payments" ? { id: true, amountCents: true, reference: true, status: true, settlementReference: true, reason: true, createdAt: true, decidedAt: true } : { id: true, kind: true, amountCents: true, chargeId: true, paymentId: true, adjustmentId: true, createdAt: true };
        const rows = await db[model].findMany({ where, select, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
        if (management) await admin(db, actor, campusId); else await org(db, actor, campusId);
        return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null };
      });
    },
    async createSemester(actor, campusId, input) {
      const data = s.parse(s.semesterInput, input);
      return tx(async db => {
        const ctx = await org(db, actor, campusId, true);
        if (ctx.organization.campus.engine !== "GRADE_SCHOOL") throw s.fail(409, "Billing semesters apply to Grade Schools only.");
        await ensureAccount(db, campusId);
        const periods = await db.gradeSchoolPeriod.findMany({ where: { campusId, id: { in: data.periodIds } } });
        if (periods.length !== data.periodIds.length || periods.some(p => p.billingSemesterId || p.kind !== "TERM" || p.startsOn < data.startsOn || p.endsOn > data.endsOn) || new Set(periods.map(p => p.yearId)).size !== 1) throw s.fail(409, "Choose unassigned terms from one academic year within this billing semester. Semester periods map automatically on registration.");
        const year = await db.gradeSchoolYear.findUnique({ where: { id: periods[0].yearId } });
        if (data.startsOn < year.startsOn || data.endsOn > year.endsOn || await db.billingSemester.count({ where: { campusId, startsOn: { lte: data.endsOn }, endsOn: { gte: data.startsOn } } })) throw s.fail(409, "Billing semesters must fit the academic year without overlap.");
        const { periodIds, ...values } = data, semester = await db.billingSemester.create({ data: { ...values, campusId } });
        await db.gradeSchoolPeriod.updateMany({ where: { campusId, id: { in: periodIds } }, data: { billingSemesterId: semester.id } });
        await billingAudit(db, campusId, actor, "SEMESTER_MAPPED", { semesterId: semester.id, periodIds, resumesOn: data.resumesOn.toISOString() });
        await org(db, actor, campusId); return semester;
      });
    },
    // Explicit, bounded adoption of registrations created before Sprint 12; no migration backfill.
    async reconcile(actor, campusId, input = {}) {
      const q = s.parse(s.page, input);
      return tx(async db => {
        const ctx = await org(db, actor, campusId, true); await ensureAccount(db, campusId);
        let rows;
        const model = ctx.organization.campus.engine === "GRADE_SCHOOL" ? "gradeSchoolRegistration" : "tvetEnrolment";
        if (q.cursor && !await db[model].findFirst({ where: { campusId, id: q.cursor } })) throw s.fail(404, "Reconciliation page is unavailable.");
        if (ctx.organization.campus.engine === "GRADE_SCHOOL") {
          // Terms in the same semester share a charge, so sourceId alone is insufficient.
          rows = await db.gradeSchoolRegistration.findMany({ where: { campusId, billingCharge: null, OR: [{ period: { kind: "SEMESTER" } }, { period: { billingSemesterId: { not: null } } }] }, include: { period: true }, orderBy: { id: "asc" }, take: 100, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
          for (const r of rows) await chargeRegistration(db, r, actor);
        } else {
          rows = await db.tvetEnrolment.findMany({ where: { campusId, billingCharge: null }, orderBy: { id: "asc" }, take: 100, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
          for (const r of rows) await chargeEnrolment(db, r, actor);
        }
        await billingAudit(db, campusId, actor, "REGISTRATIONS_RECONCILED", { inspected: rows.length });
        await org(db, actor, campusId); return { inspected: rows.length, nextCursor: rows.length === 100 ? rows[99].id : null };
      });
    },
    async submitPayment(actor, campusId, input) {
      const data = s.parse(s.paymentInput, input), inputHash = digest(data);
      return tx(async db => {
        await org(db, actor, campusId, true); await ensureAccount(db, campusId);
        const old = await db.campusPayment.findUnique({ where: { requestKey: data.requestKey } });
        if (old) { if (old.campusId !== campusId || old.submittedById !== actor.accountId || old.inputHash !== inputHash) throw s.fail(409, "This request key already belongs to a different payment report."); return { id: old.id, status: old.status }; }
        const charges = await db.billingCharge.findMany({ where: { campusId, id: { in: data.allocations.map(a => a.chargeId) } }, include: chargeInclude });
        if (charges.length !== data.allocations.length || data.allocations.some(a => a.amountCents > s.outstanding(charges.find(c => c.id === a.chargeId)))) throw s.fail(409, "Payment allocations exceed an outstanding balance or reference another Campus.");
        const amountCents = data.allocations.reduce((n, a) => n + a.amountCents, 0);
        const payment = await db.campusPayment.create({ data: { campusId, submittedById: actor.accountId, requestKey: data.requestKey, inputHash, reference: data.reference, amountCents } });
        await db.campusPaymentAllocation.createMany({ data: data.allocations.map(a => ({ ...a, campusId, paymentId: payment.id })) });
        await billingAudit(db, campusId, actor, "PAYMENT_REPORTED", { paymentId: payment.id, amountCents, allocations: data.allocations });
        await org(db, actor, campusId); return { id: payment.id, status: payment.status };
      });
    },
    async accounts(actor, input = {}) {
      const q = s.parse(s.accountQuery, input);
      return tx(async db => { await admin(db, actor); const where = { ...(q.q ? { campus: { displayName: { contains: q.q, mode: "insensitive" } } } : {}) };
        const rows = await db.billingAccount.findMany({ where, include: { campus: { select: { displayName: true } } }, orderBy: { campusId: "asc" }, take: 51, ...(q.cursor ? { cursor: { campusId: q.cursor }, skip: 1 } : {}) });
        await admin(db, actor); return { items: rows.slice(0, 50).map(a => ({ campusId: a.campusId, displayName: a.campus.displayName })), nextCursor: rows.length > 50 ? rows[49].campusId : null };
      });
    },
    async queue(actor, input = {}) {
      const q = s.parse(s.page, input);
      return tx(async db => { await admin(db, actor); const where = { status: "PENDING" };
        if (q.cursor && !await db.campusPayment.findFirst({ where: { ...where, id: q.cursor } })) throw s.fail(404, "Payment queue page is unavailable.");
        const rows = await db.campusPayment.findMany({ where, include: { allocations: true, account: { include: { campus: { select: { displayName: true } } } } }, orderBy: { id: "asc" }, take: 51, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
        await admin(db, actor); return { items: rows.slice(0, 50).map(p => ({ id: p.id, campusId: p.campusId, schoolName: p.account.campus.displayName, amountCents: p.amountCents, reference: p.reference, createdAt: p.createdAt, allocations: p.allocations.map(a => ({ chargeId: a.chargeId, amountCents: a.amountCents })) })), nextCursor: rows.length > 50 ? rows[49].id : null };
      });
    },
    async decide(actor, campusId, paymentId, input) {
      const data = s.parse(s.decisionInput, input);
      return tx(async db => {
        await admin(db, actor, campusId, true);
        const p = await db.campusPayment.findFirst({ where: { id: id(paymentId), campusId }, include: { allocations: { include: { charge: { include: chargeInclude } } } } });
        if (!p) throw s.fail(404, "Payment report is unavailable.");
        const relatedAccounts = await conflictAccounts(db, actor.staffId);
        if (relatedAccounts.includes(p.submittedById) || p.allocations.some(a => relatedAccounts.includes(a.charge.learnerAccountId))) throw s.fail(403, "You cannot confirm your own payment report.");
        const status = data.decision === "CONFIRM" ? "CONFIRMED" : "REJECTED";
        if (p.status !== "PENDING") {
          if (p.status !== status || p.reason !== data.reason || p.settlementReference !== (data.settlementReference || null) || p.decidedById !== actor.staffId) throw s.fail(409, "This payment has already been decided.");
          return { id: p.id, status: p.status };
        }
        if (status === "CONFIRMED") {
          if (p.allocations.some(a => a.amountCents > s.outstanding(a.charge))) throw s.fail(409, "The outstanding balance changed. Reject this report and request a corrected allocation after reconciling the receipt.");
          await db.billingLedgerEntry.create({ data: { campusId, kind: "PAYMENT", amountCents: -p.amountCents, paymentId: p.id } });
        }
        await db.campusPayment.update({ where: { id: p.id }, data: { status, decidedById: actor.staffId, decidedAt: now(), reason: data.reason, settlementReference: data.settlementReference || null } });
        await billingAudit(db, campusId, actor, "PAYMENT_" + status, { paymentId: p.id, amountCents: p.amountCents, reason: data.reason, settlementReference: data.settlementReference || null });
        await notify(db, { recipientId: p.submittedById, eventKey: `billing-payment:${p.id}`, kind: "CAMPUS_BILLING", title: `Your Campus payment report was ${status.toLowerCase()}. Review Campus billing for details.`, href: `/organization-workspace/${campusId}/campus` });
        for (const a of status === "CONFIRMED" ? p.allocations : []) await notify(db, { recipientId: a.charge.learnerAccountId, eventKey: `billing-paid:${p.id}:${a.chargeId}`, kind: "CAMPUS_BILLING", title: "Your institution's BrightWay registration payment has been confirmed. Check My Campus for your current access.", href: "/learning?view=campus" });
        await admin(db, actor, campusId); return { id: p.id, status };
      });
    },
    async adjust(actor, campusId, chargeId, input) {
      const data = s.parse(s.adjustmentInput, input), inputHash = digest({ chargeId, ...data });
      return tx(async db => {
        await admin(db, actor, campusId, true);
        const old = await db.billingAdjustment.findUnique({ where: { requestKey: data.requestKey } });
        if (old) { if (old.campusId !== campusId || old.inputHash !== inputHash || old.actorId !== actor.staffId) throw s.fail(409, "This adjustment request key was already used."); return { id: old.id }; }
        const c = await db.billingCharge.findFirst({ where: { campusId, id: id(chargeId) }, include: chargeInclude });
        if (!c) throw s.fail(404, "Charge is unavailable.");
        if ((await conflictAccounts(db, actor.staffId)).includes(c.learnerAccountId)) throw s.fail(403, "A different Billing Admin must adjust your own learner charge.");
        const balance = s.outstanding(c), total = c.amountCents + c.adjustments.reduce((n, a) => n + a.amountCents, 0);
        if (balance + data.amountCents < 0 || total + data.amountCents > 100) throw s.fail(409, "Adjustment would over-credit a paid charge or exceed its original US$1 platform fee.");
        const row = await db.billingAdjustment.create({ data: { campusId, chargeId: c.id, ...data, inputHash, actorId: actor.staffId } });
        await db.billingLedgerEntry.create({ data: { campusId, kind: "ADJUSTMENT", amountCents: row.amountCents, adjustmentId: row.id } });
        // Reopening a settled fee requires a new full notice period.
        if (balance === 0 && data.amountCents > 0) await db.billingCharge.update({ where: { id: c.id }, data: { noticeAt: null, enforceAt: null } });
        await billingAudit(db, campusId, actor, "CHARGE_ADJUSTED", { adjustmentId: row.id, chargeId: c.id, amountCents: row.amountCents, reason: row.reason });
        await admin(db, actor, campusId); return { id: row.id };
      });
    },
    // Run hourly from the operator scheduler. A late run extends the notice window;
    // access is derived at read time, never by overwriting academic membership states.
    async processNotices() {
      const rows = await prisma.$queryRaw`
        SELECT c."id", c."campusId" FROM "BillingCharge" c
        WHERE c."engine" = 'GRADE_SCHOOL' AND c."noticeAt" IS NULL AND c."dueAt" <= ${new Date(+now() + 7 * s.DAY)}
        AND c."amountCents" + COALESCE((SELECT SUM(a."amountCents") FROM "BillingAdjustment" a WHERE a."chargeId"=c."id"),0)
          - COALESCE((SELECT SUM(a."amountCents") FROM "CampusPaymentAllocation" a JOIN "CampusPayment" p ON p."id"=a."paymentId" WHERE a."chargeId"=c."id" AND p."status"='CONFIRMED'),0) > 0
        AND EXISTS (SELECT 1 FROM "VirtualCampus" v JOIN "Organization" o ON o."id"=v."organizationId" JOIN "OrganizationRequest" r ON r."id"=o."requestId" WHERE v."organizationId"=c."campusId" AND v."status"='ACTIVE' AND v."engine"='GRADE_SCHOOL' AND o."status"='ACTIVE' AND o."verifiedAt" IS NOT NULL AND o."type"='SCHOOL' AND r."status"='APPROVED')
        AND EXISTS (SELECT 1 FROM "OrganizationOperatingLocation" l WHERE l."organizationId"=c."campusId" AND l."countryCode"='LR' AND l."verifiedAt" IS NOT NULL)
        AND EXISTS (SELECT 1 FROM "ProductAvailability" p WHERE p."product"='VIRTUAL_CAMPUS' AND p."countryCode"='LR' AND p."enabled"=true)
        ORDER BY c."dueAt", c."id" LIMIT 200`;
      let notified = 0;
      for (const row of rows) await tx(async db => {
        try { await eligible(db, row.campusId, true); } catch (e) { if (e.status === 409) return; throw e; }
        const c = await db.billingCharge.findUnique({ where: { id: row.id }, include: chargeInclude });
        if (c.noticeAt || s.outstanding(c) <= 0) return;
        const timestamp = now(), enforceAt = new Date(Math.max(+c.dueAt, +timestamp + 7 * s.DAY));
        await db.billingCharge.update({ where: { id: c.id }, data: { noticeAt: timestamp, enforceAt } });
        await notify(db, { recipientId: c.learnerAccountId, eventKey: `billing-notice:${c.id}:${+timestamp}`, kind: "CAMPUS_BILLING", title: `Your school has an unpaid BrightWay registration fee. Contact school administration. Campus access may be restricted from ${enforceAt.toISOString().slice(0, 10)} if it remains unpaid.`, href: "/learning?view=campus" });
        const staff = await db.organizationMembership.findMany({ where: { organizationId: c.campusId, enabled: true, account: { status: "ACTIVE" }, OR: [{ role: "PRIMARY_ADMIN" }, { permissions: { has: BILLING } }] }, select: { accountId: true } });
        for (const a of staff) await notify(db, { recipientId: a.accountId, eventKey: `billing-reminder:${c.semesterId}:${a.accountId}:${timestamp.toISOString().slice(0, 10)}`, kind: "CAMPUS_BILLING", title: "Outstanding BrightWay registration fees require payment. Affected students have received at least one week's notice before access enforcement. Please also communicate with pre-registered students.", href: `/organization-workspace/${c.campusId}/campus` });
        await billingAudit(db, c.campusId, {}, "PAYMENT_NOTICE", { chargeId: c.id, noticeAt: timestamp.toISOString(), enforceAt: enforceAt.toISOString() }); notified++;
      });
      return { inspected: rows.length, notified };
    },
  };
}
