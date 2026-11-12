import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createBillingService } from "../src/modules/billing/billing.service.js";
import { createGradeSchoolService } from "../src/modules/grade-school/grade-school.service.js";
import { createTvetService } from "../src/modules/tvet/tvet.service.js";
import { createCampusService } from "../src/modules/campus/campus.service.js";
import { seedOrganizationProfile, clearOrganizationProfiles } from "../test-support/organization-profile-seed.js";
import { managementStaffFixture, managementSessionFixture, cleanupManagementFixtures } from "../test-support/management-database-fixture.js";
import { clearBilling } from "../test-support/billing-cleanup.js";

test("Sprint 12 SQL: registration units, ledger, bulk receipts, adjustments, notices and access", { skip: !process.env.TEST_DATABASE_URL && "Requires a migrated isolated TEST_DATABASE_URL" }, async t => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 15000, timeout: 30000 } });
  let clock = new Date("2030-01-01T12:00:00Z"); const now = () => new Date(clock);
  const billing = createBillingService({ prisma: db, now }), school = createGradeSchoolService({ prisma: db, now }), tvet = createTvetService({ prisma: db, now }), campus = createCampusService({ prisma: db, now });
  const accounts = [], organizations = [], requests = [], staffIds = [];
  const productWhere = { product_countryCode: { product: "VIRTUAL_CAMPUS", countryCode: "LR" } }, oldProduct = await db.productAvailability.findUnique({ where: productWhere });
  async function account(label) {
    const username = `bill_${label}_${randomUUID().slice(0, 8)}`, a = await db.account.create({ data: { username, email: username + "@example.invalid", emailVerifiedAt: now(), passwordHash: "synthetic-unusable", person: { create: { firstName: "Synthetic", lastName: label } } } }); accounts.push(a);
    await db.mfaFactor.create({ data: { accountId: a.id, enabled: true, encryptedSecret: "synthetic", windowStart: now(), version: 1 } });
    const session = await db.session.create({ data: { accountId: a.id, tokenHash: randomUUID(), expiresAt: new Date("2031-01-01"), mfaVersion: 1, mfaVerifiedAt: now() } }); return { ...a, actor: { accountId: a.id, sessionId: session.id } };
  }
  async function staff(caps = ["billing-admin"], email) {
    const row = await managementStaffFixture(db, { username: "bill_" + randomUUID().slice(0, 8), email: email || randomUUID() + "@management.example.invalid" }, caps, now()); staffIds.push(row.id);
    const session = await managementSessionFixture(db, row, now(), new Date("2031-01-01")); return { staffId: row.id, sessionId: session.id };
  }
  async function organization(owner, engine) {
    const name = "Billing test " + randomUUID().slice(0, 8), request = await db.organizationRequest.create({ data: { applicantId: owner.id, assignedAgentId: agent.staffId, decidedById: admin.staffId, decidedAt: now(), version: 4, idempotencyKey: randomUUID(), inputHash: "b".repeat(64), fingerprint: randomUUID(), name, type: "SCHOOL", offersTraining: true, representativeRole: "Administrator", countryCode: "LR", region: "Montserrado", city: "Monrovia", address: "Synthetic test location", status: "APPROVED", targetAt: now() } }); requests.push(request.id);
    const row = await db.organization.create({ data: { requestId: request.id, name, type: "SCHOOL", offersTraining: true, verifiedAt: now(), memberships: { create: { accountId: owner.id, role: "PRIMARY_ADMIN" } }, locations: { create: { countryCode: "LR", region: "Montserrado", city: "Monrovia", address: "Synthetic test location", verifiedAt: now() } } } }); organizations.push(row.id); await seedOrganizationProfile(db, row.id, now());
    await campus.setup(owner.actor, row.id, { engine, displayName: name, contactEmail: null, expectedVersion: 0 }); await campus.activate(owner.actor, row.id, { expectedVersion: 1 }); return row;
  }
  let owner, student, second, outsider, org, training, admin, agent, limited, related, year, period, section, r1, r2, charge1, charge2, payment;
  const freshAdmin = async actor => db.managementSession.update({ where: { id: actor.sessionId }, data: { mfaVerifiedAt: now() } });
  try {
    await db.productAvailability.upsert({ where: productWhere, create: { product: "VIRTUAL_CAMPUS", countryCode: "LR", enabled: true }, update: { enabled: true } });
    owner = await account("owner"); student = await account("student"); second = await account("second"); outsider = await account("outsider"); admin = await staff(); agent = await staff(["organization-agent"]); limited = await staff(["support-agent"]); related = await staff(["billing-admin"], owner.email);
    org = await organization(owner, "GRADE_SCHOOL"); training = await organization(owner, "TVET");
    const cfg = (kind, data) => school.configure(owner.actor, org.id, kind, data), statement = () => billing.statement(owner.actor, org.id);
    await t.test("active eligible Campus and separate billing permission/MFA realms are mandatory", async () => {
      await assert.rejects(billing.statement(outsider.actor, org.id), { status: 403 }); await assert.rejects(billing.queue(limited), { status: 403 }); await assert.rejects(billing.queue(owner.actor), { status: 403 });
      await db.organizationMembership.create({ data: { organizationId: org.id, accountId: outsider.id, role: "STAFF", permissions: ["organization.campus.academics.manage"] } }); await assert.rejects(billing.statement(outsider.actor, org.id), { status: 403 });
      assert.equal(await db.billingCharge.count({ where: { campusId: org.id } }), 0);
    });
    await t.test("official semester registration races create exactly one US$1 charge and matching ledger", async () => {
      year = await cfg("years", { name: "2030", startsOn: "2030-01-01", endsOn: "2030-12-31" }); const cl = await cfg("classes", { name: "Grade 10" }); section = await cfg("sections", { classId: cl.id, name: "A", capacity: 10 }); period = await cfg("periods", { yearId: year.id, name: "Semester 1", kind: "SEMESTER", startsOn: "2030-01-01", endsOn: "2030-03-31" });
      const input = { username: student.username, periodId: period.id, sectionId: section.id, source: "DIRECT", electiveIds: [] }, pair = await Promise.all([school.register(owner.actor, org.id, input), school.register(owner.actor, org.id, input)]); r1 = pair[0]; assert.equal(r1.id, pair[1].id);
      r2 = await school.register(owner.actor, org.id, { ...input, username: second.username });
      const st = await statement(); assert.equal(st.balanceCents, 200); assert.equal(st.charges.length, 2); assert(st.charges.every(c => c.amountCents === 100)); charge1 = st.charges.find(c => c.learner.username === student.username); charge2 = st.charges.find(c => c.learner.username === second.username);
      assert.equal(await db.billingLedgerEntry.count({ where: { campusId: org.id, kind: "CHARGE" } }), 2);
      await school.changeStatus(owner.actor, org.id, "registration", r1.id, { expectedVersion: 1, status: "ACTIVE" });
      await school.changeStatus(owner.actor, org.id, "registration", r2.id, { expectedVersion: 1, status: "ACTIVE" });
      assert.equal((await statement()).balanceCents, 200); assert.equal((await school.learnerReport(student.actor, r1.id)).registration.id, r1.id);
    });
    await t.test("pending reports never settle balances; same-key retries and cross-Campus allocations are checked", async () => {
      const input = { requestKey: randomUUID(), reference: "Synthetic receipt A", allocations: [{ chargeId: charge1.id, amountCents: 100 }, { chargeId: charge2.id, amountCents: 50 }] }, pair = await Promise.all([billing.submitPayment(owner.actor, org.id, input), billing.submitPayment(owner.actor, org.id, input)]); payment = pair[0]; assert.equal(payment.id, pair[1].id); assert.equal((await statement()).balanceCents, 200);
      await assert.rejects(billing.submitPayment(owner.actor, org.id, { ...input, reference: "Changed retry" }), { status: 409 }); await assert.rejects(billing.submitPayment(owner.actor, training.id, { ...input, requestKey: randomUUID() }), { status: 409 });
      const decision = { decision: "CONFIRM", reason: "Verified synthetic receipt against actual funds.", settlementReference: "billing-test-" + randomUUID() };
      await assert.rejects(billing.decide(related, org.id, payment.id, decision), { status: 403 }); await assert.rejects(billing.decide(limited, org.id, payment.id, decision), { status: 403 });
      const confirmations = await Promise.all([billing.decide(admin, org.id, payment.id, decision), billing.decide(admin, org.id, payment.id, decision)]); assert.equal(confirmations[0].status, "CONFIRMED"); assert.equal((await statement()).balanceCents, 50); assert.equal(await db.billingLedgerEntry.count({ where: { paymentId: payment.id } }), 1);
      const duplicate = await billing.submitPayment(owner.actor, org.id, { requestKey: randomUUID(), reference: "Duplicate receipt", allocations: [{ chargeId: charge2.id, amountCents: 50 }] }); await assert.rejects(billing.decide(admin, org.id, duplicate.id, decision), { status: 409 });
      await billing.decide(admin, org.id, duplicate.id, { decision: "REJECT", reason: "Receipt already used by the previous payment." }); assert.equal((await statement()).balanceCents, 50);
    });
    await t.test("notices are deduplicated and late jobs give seven complete days before access enforcement", async () => {
      clock = new Date("2030-01-24T12:00:00Z"); await freshAdmin(admin);
      // Earliest normal notice is day 23; the actual time of delivery starts the seven days.
      const result = await billing.processNotices(); assert.equal(result.notified, 1); assert.equal((await billing.processNotices()).notified, 0);
      const c = await db.billingCharge.findUnique({ where: { id: charge2.id } }); assert.equal(c.enforceAt.toISOString(), "2030-01-31T12:00:00.000Z");
      clock = new Date("2030-01-31T11:59:59Z"); assert.equal((await school.learnerReport(second.actor, r2.id)).registration.id, r2.id);
      clock = new Date("2030-01-31T12:00:00Z"); await assert.rejects(school.learnerReport(second.actor, r2.id), { status: 403 }); assert.equal((await school.myCampus(second.actor)).items[0].billing.restricted, true); assert.equal((await school.learnerReport(student.actor, r1.id)).registration.id, r1.id);
      await freshAdmin(admin); const adjustment = { requestKey: randomUUID(), amountCents: -50, reason: "Authorized synthetic waiver of remaining fee." }; const pair = await Promise.all([billing.adjust(admin, org.id, charge2.id, adjustment), billing.adjust(admin, org.id, charge2.id, adjustment)]); assert.equal(pair[0].id, pair[1].id); assert.equal((await statement()).balanceCents, 0); assert.equal((await school.learnerReport(second.actor, r2.id)).registration.id, r2.id);
      await assert.rejects(billing.adjust(admin, org.id, charge1.id, { ...adjustment, requestKey: randomUUID(), amountCents: -1 }), { status: 409 });
      await billing.adjust(admin, org.id, charge2.id, { requestKey: randomUUID(), amountCents: 50, reason: "Reverse a previous synthetic fee waiver." }); assert.equal((await school.myCampus(second.actor)).items[0].billing.noticeAt, null);
      clock = new Date("2030-02-04T12:00:00Z"); await billing.processNotices(); const reopened = await db.billingCharge.findUnique({ where: { id: charge2.id } }); assert.equal(reopened.enforceAt.toISOString(), "2030-02-11T12:00:00.000Z"); assert.equal((await school.learnerReport(second.actor, r2.id)).registration.id, r2.id);
    });
    await t.test("two academic terms in one semester produce one learner charge", async () => {
      const t1 = await cfg("periods", { yearId: year.id, name: "Term A", kind: "TERM", startsOn: "2030-04-01", endsOn: "2030-05-31" }), t2 = await cfg("periods", { yearId: year.id, name: "Term B", kind: "TERM", startsOn: "2030-06-01", endsOn: "2030-07-31" });
      const input = { username: student.username, periodId: t1.id, sectionId: section.id, source: "DIRECT", electiveIds: [] }; await assert.rejects(school.register(owner.actor, org.id, input), { status: 409 });
      await billing.createSemester(owner.actor, org.id, { name: "Semester 2", startsOn: "2030-04-01", endsOn: "2030-07-31", resumesOn: "2030-04-02", periodIds: [t1.id, t2.id] });
      await school.register(owner.actor, org.id, input); await school.register(owner.actor, org.id, { ...input, periodId: t2.id }); assert.equal(await db.billingCharge.count({ where: { campusId: org.id, learnerAccountId: student.id } }), 2); const before = (await statement()).balanceCents; await billing.reconcile(owner.actor, org.id); assert.equal((await statement()).balanceCents, before);
    });
    await t.test("TVET enrolments bill per Program/Intake and ignore institution fees and modules", async () => {
      const p = await tvet.configure(owner.actor, training.id, "programs", { name: "Mechanics", feeMinor: 45050, currency: "LRD" }), i = await tvet.configure(owner.actor, training.id, "intakes", { programId: p.id, name: "A", startsOn: "2030-02-01", endsOn: "2030-04-30" }), sec = await tvet.configure(owner.actor, training.id, "sections", { intakeId: i.id, name: "A", capacity: 10 });
      await tvet.configure(owner.actor, training.id, "modules", { programId: p.id, name: "Module 1", required: true }); await tvet.configure(owner.actor, training.id, "modules", { programId: p.id, name: "Module 2", required: true });
      assert.equal(await db.billingCharge.count({ where: { campusId: training.id } }), 0);
      const input = { username: student.username, intakeId: i.id, sectionId: sec.id, source: "DIRECT" }; const pair = await Promise.all([tvet.enrol(owner.actor, training.id, input), tvet.enrol(owner.actor, training.id, input)]); assert.equal(pair[0].id, pair[1].id); assert.equal((await billing.statement(owner.actor, training.id)).balanceCents, 100);
      const i2 = await tvet.configure(owner.actor, training.id, "intakes", { programId: p.id, name: "B", startsOn: "2030-05-01", endsOn: "2030-07-31" }), sec2 = await tvet.configure(owner.actor, training.id, "sections", { intakeId: i2.id, name: "A", capacity: 10 }); await tvet.enrol(owner.actor, training.id, { ...input, intakeId: i2.id, sectionId: sec2.id }); assert.equal((await billing.statement(owner.actor, training.id)).balanceCents, 200);
    });
    await t.test("SQL invariants reject mutated evidence and failed audits roll monetary operations back", async () => {
      const st = await statement(), c = st.charges.find(c => c.balanceCents > 0); await freshAdmin(admin);
      for (const [model, data] of [["billingCharge", { amountCents: 200 }], ["billingLedgerEntry", { amountCents: 1 }], ["billingAudit", { action: "TAMPERED" }]]) { const row = await db[model].findFirst({ where: { campusId: org.id } }); await assert.rejects(db[model].update({ where: { id: row.id }, data })); }
      const failing = new Proxy(db, { get(target, key) { if (key === "$transaction") return fn => db.$transaction(real => fn(new Proxy(real, { get(tx, name) { return name === "billingAudit" ? { create: async () => { throw Error("Audit unavailable"); } } : tx[name]; } }))); const value = target[key]; return typeof value === "function" ? value.bind(target) : value; } });
      const before = st.balanceCents; await assert.rejects(createBillingService({ prisma: failing, now }).adjust(admin, org.id, c.id, { requestKey: randomUUID(), amountCents: -1, reason: "Synthetic atomic rollback test." }), /Audit unavailable/); assert.equal((await statement()).balanceCents, before);
      await db.virtualCampus.update({ where: { organizationId: org.id }, data: { status: "PAUSED" } }); await assert.rejects(statement(), { status: 403 }); await assert.rejects(billing.statement(admin, org.id, {}, true), { status: 409 }); await db.virtualCampus.update({ where: { organizationId: org.id }, data: { status: "ACTIVE" } });
      await db.managementStaff.update({ where: { id: admin.staffId }, data: { version: { increment: 1 } } }); await assert.rejects(billing.queue(admin), { status: 403 });
    });
  } finally {
    await clearBilling(db, organizations);
    for (const model of ["tvetEnrolment", "tvetSection", "tvetModule", "tvetIntake", "tvetLearner", "tvetProgram", "gradeSchoolElective", "gradeSchoolRegistration", "gradeSchoolStudent", "gradeSchoolPeriod", "gradeSchoolSection", "gradeSchoolClass", "gradeSchoolYear", "virtualCampusAudit", "campusAnnouncement"]) await db[model].deleteMany({ where: { campusId: { in: organizations } } });
    await db.virtualCampus.deleteMany({ where: { organizationId: { in: organizations } } }); await db.organizationMembership.deleteMany({ where: { organizationId: { in: organizations } } }); await db.organizationOperatingLocation.deleteMany({ where: { organizationId: { in: organizations } } }); await clearOrganizationProfiles(db, organizations); await db.organization.deleteMany({ where: { id: { in: organizations } } }); await db.organizationRequest.deleteMany({ where: { id: { in: requests } } });
    const ids = accounts.map(a => a.id); await db.platformNotification.deleteMany({ where: { recipientId: { in: ids } } }); await db.session.deleteMany({ where: { accountId: { in: ids } } }); await db.mfaFactor.deleteMany({ where: { accountId: { in: ids } } }); await db.account.deleteMany({ where: { id: { in: ids } } }); await db.person.deleteMany({ where: { id: { in: accounts.map(a => a.personId) } } }); await cleanupManagementFixtures(db, staffIds);
    if (oldProduct) await db.productAvailability.update({ where: productWhere, data: { enabled: oldProduct.enabled } }); else await db.productAvailability.deleteMany({ where: { product: "VIRTUAL_CAMPUS", countryCode: "LR" } }); await db.$disconnect();
  }
});
