import { clearBilling } from "../test-support/billing-cleanup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createGradeSchoolService } from "../src/modules/grade-school/grade-school.service.js";
import { createOrganizationService } from "../src/modules/organizations/organization.service.js";
import { createCampusService } from "../src/modules/campus/campus.service.js";
import { seedOrganizationProfile, clearOrganizationProfiles } from "../test-support/organization-profile-seed.js";

test("Sprint 10 SQL: academic isolation, registrations, assigned teachers, guardians, final attendance, grades and history", {
  skip: !process.env.TEST_DATABASE_URL && "Requires a migrated isolated TEST_DATABASE_URL"
}, async t => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { timeout: 15000, maxWait: 10000 } });
  const now = () => new Date("2030-02-01T12:00:00Z"), school = createGradeSchoolService({ prisma: db, now }), campus = createCampusService({ prisma: db, now });
  const accounts = [], people = [], organizations = [], requests = [];
  const productWhere = { product_countryCode: { product: "VIRTUAL_CAMPUS", countryCode: "LR" } }, oldProduct = await db.productAvailability.findUnique({ where: productWhere });
  async function account(label) {
    const username = "sch_" + label + "_" + randomUUID().slice(0, 8);
    const a = await db.account.create({ data: { username, email: username + "@example.invalid", emailVerifiedAt: now(), passwordHash: "synthetic", person: { create: { firstName: "Synthetic", lastName: label } } } });
    accounts.push(a.id); people.push(a.personId);
    await db.mfaFactor.create({ data: { accountId: a.id, enabled: true, encryptedSecret: "test-only", windowStart: now(), version: 1 } });
    const session = await db.session.create({ data: { accountId: a.id, tokenHash: randomUUID(), expiresAt: new Date("2031-01-01"), mfaVersion: 1, mfaVerifiedAt: now() } });
    return { ...a, actor: { accountId: a.id, sessionId: session.id } };
  }
  async function organization(owner) {
    const name = "Synthetic School " + randomUUID().slice(0, 8), assignedAgentId = accounts.find(id => id !== owner.id), decidedById = accounts.find(id => id !== owner.id && id !== assignedAgentId);
    const request = await db.organizationRequest.create({ data: { applicantId: owner.id, assignedAgentId, decidedById, decidedAt: now(), version: 4, idempotencyKey: randomUUID(), inputHash: "b".repeat(64), fingerprint: randomUUID(), name, type: "SCHOOL", offersTraining: false, representativeRole: "Administrator", countryCode: "LR", region: "Montserrado", city: "Monrovia", address: "Synthetic test address", status: "APPROVED", targetAt: now() } }); requests.push(request.id);
    const row = await db.organization.create({ data: { requestId: request.id, name, type: "SCHOOL", offersTraining: false, verifiedAt: now(), memberships: { create: { accountId: owner.id, role: "PRIMARY_ADMIN" } }, locations: { create: { countryCode: "LR", region: "Montserrado", city: "Monrovia", address: "Synthetic school operation", verifiedAt: now() } } } }); organizations.push(row.id);
    await seedOrganizationProfile(db, row.id, now());
    await campus.setup(owner.actor, row.id, { engine: "GRADE_SCHOOL", displayName: name, contactEmail: null, expectedVersion: 0 });
    await campus.activate(owner.actor, row.id, { expectedVersion: 1 });
    return row;
  }
  let owner, teacher, other, student, second, guardian, outsider, org, abroad, subject, elective, section, period, later, offering, optional, r1, r2, link;
  try {
    await db.productAvailability.upsert({ where: productWhere, create: { product: "VIRTUAL_CAMPUS", countryCode: "LR", enabled: true }, update: { enabled: true } });
    owner = await account("owner"); teacher = await account("teacher"); other = await account("otherteacher"); student = await account("student"); second = await account("second"); guardian = await account("guardian"); outsider = await account("outsider");
    org = await organization(owner); abroad = await organization(owner);
    for (const a of [teacher, other]) await db.organizationMembership.create({ data: { organizationId: org.id, accountId: a.id, role: "STAFF", permissions: ["organization.campus.teach"] } });
    const cfg = (kind, data, target = org.id) => school.configure(owner.actor, target, kind, data);
    await t.test("setup is manager-only, calendar-aware and isolated even when the actor belongs to both schools", async () => {
      await assert.rejects(school.configure(teacher.actor, org.id, "classes", { name: "Forbidden" }), { status: 403 });
      await assert.rejects(school.setup(outsider.actor, org.id), { status: 403 });
      subject = await cfg("subjects", { name: "Mathematics", passingMark: 50 });
      elective = await cfg("subjects", { name: "Art", passingMark: 40 });
      const cl = await cfg("classes", { name: "Grade 10" });
      section = await cfg("sections", { classId: cl.id, name: "A", capacity: 2 });
      await assert.rejects(cfg("sections", { classId: cl.id, name: "Cross tenant", capacity: 2 }, abroad.id), { status: 404 });
      const year = await cfg("years", { name: "2029–2030", startsOn: "2029-08-01", endsOn: "2030-07-31" });
      await assert.rejects(cfg("periods", { yearId: year.id, name: "Outside year", kind: "TERM", startsOn: "2031-01-01", endsOn: "2031-03-01" }), { status: 400 });
      period = await cfg("periods", { yearId: year.id, name: "First semester", kind: "SEMESTER", startsOn: "2030-01-01", endsOn: "2030-03-31" });
      later = await cfg("periods", { yearId: year.id, name: "Second semester", kind: "SEMESTER", startsOn: "2030-04-01", endsOn: "2030-07-31" });
      await assert.rejects(cfg("periods", { yearId: year.id, name: "Overlap", kind: "TERM", startsOn: "2030-02-01", endsOn: "2030-04-01" }), { status: 409 });
      offering = await cfg("offerings", { periodId: period.id, sectionId: section.id, subjectId: subject.id, mode: "COMPULSORY" });
      optional = await cfg("offerings", { periodId: period.id, sectionId: section.id, subjectId: elective.id, mode: "ELECTIVE" });
      await assert.rejects(cfg("offerings", { periodId: period.id, sectionId: section.id, subjectId: subject.id, mode: "ELECTIVE" }), { status: 409 });
      await assert.rejects(db.gradeSchoolOffering.create({ data: { campusId: abroad.id, periodId: period.id, sectionId: section.id, subjectId: subject.id } }), { code: "P2003" });
      await cfg("years", { name: "2030–2031", startsOn: "2030-08-01", endsOn: "2031-07-31" });
      assert.equal((await school.setup(owner.actor, org.id, { periodId: period.id })).years.length, 2);
    });
    await t.test("one teacher per offering, current staff grants, stale versions and timetable conflicts", async () => {
      await assert.rejects(school.assign(owner.actor, org.id, offering.id, { expectedVersion: 1, username: outsider.username }), { status: 400 });
      await school.assign(owner.actor, org.id, offering.id, { expectedVersion: 1, username: teacher.username });
      await assert.rejects(school.assign(owner.actor, org.id, offering.id, { expectedVersion: 1, username: other.username }), { status: 409 });
      await school.assign(owner.actor, org.id, optional.id, { expectedVersion: 1, username: other.username });
      await assert.rejects(school.subject(other.actor, org.id, offering.id), { status: 403 });
      assert.equal((await school.setup(teacher.actor, org.id, { periodId: period.id })).offerings.length, 1);
      await school.createSchedule(owner.actor, org.id, { offeringId: offering.id, weekday: 1, startsAt: 480, endsAt: 540, room: "A" });
      await assert.rejects(school.createSchedule(owner.actor, org.id, { offeringId: optional.id, weekday: 1, startsAt: 500, endsAt: 560, room: "B" }), { status: 409 });
      await school.createSchedule(owner.actor, org.id, { offeringId: optional.id, weekday: 1, startsAt: 540, endsAt: 600, room: "A" });
      await db.mfaFactor.update({ where: { accountId: teacher.id }, data: { version: 2 } });
      await assert.rejects(school.createSession(teacher.actor, org.id, "attendance", { offeringId: offering.id, heldOn: "2030-02-01" }), { status: 403 });
      await db.mfaFactor.update({ where: { accountId: teacher.id }, data: { version: 1 } });
    });
    await t.test("pre-registration, acceptance and returning routes, capacity, optional electives and learner access", async () => {
      const input = { username: student.username, periodId: period.id, sectionId: section.id, source: "DIRECT", electiveIds: [optional.id] };
      r1 = await school.register(owner.actor, org.id, input);
      assert.equal(r1.status, "PRE_REGISTERED");
      assert.equal((await createOrganizationService({ prisma: db, now }).workAccess(student.id, student.actor.sessionId)).hasWork, true);
      assert.equal((await school.register(owner.actor, org.id, input)).id, r1.id);
      assert.match((await school.myCampus(student.actor)).items[0].message, /Welcome, Synthetic!/);
      await assert.rejects(school.learnerReport(student.actor, r1.id), { status: 403 });
      await assert.rejects(school.register(owner.actor, org.id, { ...input, username: second.username, source: "ADMISSION", admissionId: randomUUID() }), { status: 400 });
      const program = await db.program.create({ data: { organizationId: org.id, authorId: owner.id, requestKey: randomUUID(), inputHash: "c".repeat(64), title: "Synthetic admission", description: "Synthetic", type: "SECONDARY", duration: "One year", field: "Education", studyMode: "ON_CAMPUS", countryCode: "LR", location: "Monrovia", requirements: "Synthetic", status: "PUBLISHED" } });
      const cycle = await db.admissionCycle.create({ data: { organizationId: org.id, programId: program.id, authorId: owner.id, requestKey: randomUUID(), inputHash: "d".repeat(64), title: "Synthetic cycle", opensAt: new Date("2029-11-01"), deadline: new Date("2030-04-01"), questions: [], status: "OPEN" } });
      const admission = await db.admissionApplication.create({ data: { cycleId: cycle.id, applicantId: second.id, status: "ACCEPTED", answers: [], submittedAt: now() } });
      assert.equal(await db.gradeSchoolRegistration.count({ where: { admissionId: admission.id } }), 0);
      const accepted = await school.acceptedAdmissions(owner.actor, org.id, { q: second.username });
      assert.equal(accepted.items[0].id, admission.id);
      assert.equal(Object.hasOwn(accepted.items[0], "answers"), false);
      r2 = await school.register(owner.actor, org.id, { username: second.username, periodId: period.id, sectionId: section.id, source: "ADMISSION", admissionId: admission.id });
      assert.equal((await school.acceptedAdmissions(owner.actor, org.id)).items.length, 0);
      await assert.rejects(school.register(owner.actor, org.id, { ...input, username: outsider.username, electiveIds: [] }), { status: 409 });
      await assert.rejects(school.changeStatus(teacher.actor, org.id, "registration", r1.id, { expectedVersion: 1, status: "ACTIVE" }), { status: 403 });
      for (const r of [r1, r2]) await school.changeStatus(owner.actor, org.id, "registration", r.id, { expectedVersion: 1, status: "ACTIVE" });
      assert.equal((await school.subject(other.actor, org.id, optional.id)).students.length, 1);
      await assert.rejects(school.learnerReport(second.actor, r1.id), { status: 403 });
      assert.equal((await school.myCampus(teacher.actor)).items.length, 0);
      const returning = await school.register(owner.actor, org.id, { ...input, source: "RETURNING", periodId: later.id, electiveIds: [] });
      assert.equal(returning.status, "PRE_REGISTERED");
      assert.equal((await school.myCampus(student.actor)).items.length, 2);
      await assert.rejects(school.learnerReport(student.actor, returning.id), { status: 403 });
      const staffNotice = await campus.publish(owner.actor, org.id, { title: "Synthetic private staff matter", body: "Staff-only content must never appear in a learner report.", requestKey: randomUUID() });
      const campusNotice = await campus.publish(owner.actor, org.id, { title: "Synthetic semester welcome", body: "Welcome to the semester.", audience: "CAMPUS", requestKey: randomUUID() });
      const personal = await school.learnerReport(student.actor, r1.id);
      assert.equal(personal.registration.periodId, period.id);
      assert.deepEqual(personal.announcements.map(a => a.id), [campusNotice.id]);
      assert.equal(await db.platformNotification.count({ where: { recipientId: student.id, eventKey: "campus:" + org.id + ":announcement:" + staffNotice.id } }), 0);
      assert.equal(await db.platformNotification.count({ where: { recipientId: student.id, eventKey: "campus:" + org.id + ":announcement:" + campusNotice.id } }), 1);
    });
    await t.test("guardian confirmation gates private records; drafts never alert; concurrent final attendance alerts once", async () => {
      link = await school.linkGuardian(owner.actor, org.id, { studentId: r1.studentId, username: guardian.username, relationship: "Parent" });
      await assert.rejects(school.learnerReport(guardian.actor, r1.id, true), { status: 403 });
      await assert.rejects(school.guardianDecision(outsider.actor, link.id, { expectedVersion: 1, decision: "CONFIRM" }), { status: 404 });
      await school.guardianDecision(guardian.actor, link.id, { expectedVersion: 1, decision: "CONFIRM" });
      assert.equal((await school.learnerReport(guardian.actor, r1.id, true)).registration.id, r1.id);
      await assert.rejects(school.createSession(teacher.actor, org.id, "attendance", { offeringId: offering.id, heldOn: "2030-04-01" }), { status: 400 });
      await assert.rejects(school.createSession(teacher.actor, org.id, "attendance", { offeringId: offering.id, heldOn: "2030-02-02" }), { status: 400 });
      const attendance = await school.createSession(teacher.actor, org.id, "attendance", { offeringId: offering.id, heldOn: "2030-02-01" });
      const afternoon = await school.createSession(teacher.actor, org.id, "attendance", { offeringId: offering.id, heldOn: "2030-02-01", startsAt: 780 });
      assert.notEqual(afternoon.id, attendance.id);
      assert.equal((await school.createSession(teacher.actor, org.id, "attendance", { offeringId: offering.id, heldOn: "2030-02-01", startsAt: 780 })).id, afternoon.id);
      const records = [{ registrationId: r1.id, status: "ABSENT" }, { registrationId: r2.id, status: "PRESENT" }];
      await school.submit(teacher.actor, org.id, "attendance", attendance.id, { expectedVersion: 1, finalize: false, records });
      assert.equal(await db.platformNotification.count({ where: { recipientId: guardian.id, kind: "CAMPUS_ABSENCE" } }), 0);
      assert.equal((await school.learnerReport(student.actor, r1.id)).subjects[0].attendance.length, 0);
      await assert.rejects(school.submit(teacher.actor, org.id, "attendance", attendance.id, { expectedVersion: 2, finalize: true, records: records.slice(0, 1) }), { status: 400 });
      const results = await Promise.allSettled([1, 2].map(() => school.submit(teacher.actor, org.id, "attendance", attendance.id, { expectedVersion: 2, finalize: true, records })));
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      assert.equal(results.filter(r => r.status === "rejected" && r.reason.status === 409).length, 1);
      assert.equal(await db.platformNotification.count({ where: { recipientId: guardian.id, kind: "CAMPUS_ABSENCE" } }), 1);
      assert.equal((await school.learnerReport(student.actor, r1.id)).subjects.find(r => r.offering.id === offering.id).attendance[0].status, "ABSENT");
      await school.guardianDecision(owner.actor, link.id, { expectedVersion: 2, decision: "REVOKE" }, org.id);
      await assert.rejects(school.learnerReport(guardian.actor, r1.id, true), { status: 403 });
      const next = await school.createSession(teacher.actor, org.id, "attendance", { offeringId: offering.id, heldOn: "2030-01-31" });
      await school.submit(teacher.actor, org.id, "attendance", next.id, { expectedVersion: 1, finalize: true, records });
      assert.equal(await db.platformNotification.count({ where: { recipientId: guardian.id, kind: "CAMPUS_ABSENCE" } }), 1);
      const rollback = await school.createSession(teacher.actor, org.id, "attendance", { offeringId: offering.id, heldOn: "2030-01-30" });
      await db.$executeRawUnsafe(`CREATE FUNCTION school_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'SCHOOL_DRAFT_SAVED' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$`);
      await db.$executeRawUnsafe(`CREATE TRIGGER school_test_audit_failure BEFORE INSERT ON "VirtualCampusAudit" FOR EACH ROW EXECUTE FUNCTION school_test_audit_failure()`);
      try {
        await assert.rejects(school.submit(teacher.actor, org.id, "attendance", rollback.id, { expectedVersion: 1, finalize: false, records }));
        assert.equal((await db.gradeSchoolAttendance.findUnique({ where: { id: rollback.id } })).version, 1);
        assert.equal(await db.gradeSchoolAttendanceRecord.count({ where: { attendanceId: rollback.id } }), 0);
      } finally {
    await clearBilling(db, organizations);
        await db.$executeRawUnsafe('DROP TRIGGER school_test_audit_failure ON "VirtualCampusAudit"');
        await db.$executeRawUnsafe('DROP FUNCTION school_test_audit_failure()');
      }
    });
    await t.test("draft scores stay private, score limits and subject scope hold, finalized weighted reports retain history", async () => {
      for (const [title, maxScore, weight, marks] of [["Test", 50, 20, [40, 25]], ["Exam", 100, 80, [90, 60]]]) {
        const assessment = await school.createSession(teacher.actor, org.id, "assessments", { offeringId: offering.id, title, heldOn: "2030-02-01", maxScore, weight });
        await assert.rejects(school.submit(other.actor, org.id, "assessments", assessment.id, { expectedVersion: 1, finalize: false, records: [] }), { status: 403 });
        await assert.rejects(school.submit(teacher.actor, org.id, "assessments", assessment.id, { expectedVersion: 1, finalize: false, records: [{ registrationId: r1.id, score: maxScore + 1 }] }), { status: 400 });
        const records = [{ registrationId: r1.id, score: marks[0] }, { registrationId: r2.id, score: marks[1] }];
        await school.submit(teacher.actor, org.id, "assessments", assessment.id, { expectedVersion: 1, finalize: false, records });
        assert.equal((await school.learnerReport(student.actor, r1.id)).subjects.find(r => r.offering.id === offering.id).assessments.some(r => r.title === title), false);
        await school.submit(teacher.actor, org.id, "assessments", assessment.id, { expectedVersion: 2, finalize: true, records });
        await assert.rejects(school.submit(teacher.actor, org.id, "assessments", assessment.id, { expectedVersion: 3, finalize: false, records }), { status: 409 });
      }
      const report = await school.learnerReport(student.actor, r1.id);
      assert.equal(report.subjects.find(r => r.offering.id === offering.id).grade.percent, 88);
      assert.equal(report.subjects.find(r => r.offering.id === optional.id).grade.percent, null);
      assert.equal(JSON.stringify(report).includes(second.username), false);
      assert.equal(await db.platformNotification.count({ where: { recipientId: student.id, kind: "CAMPUS_GRADES" } }), 2);
      assert.ok(await db.virtualCampusAudit.count({ where: { campusId: org.id, actorId: teacher.id, action: "SCHOOL_FINAL_SUBMITTED" } }) >= 3);
      const member = await db.gradeSchoolStudent.findUnique({ where: { id: r1.studentId } });
      await school.changeStatus(owner.actor, org.id, "student", member.id, { expectedVersion: member.version, status: "SUSPENDED" });
      await assert.rejects(school.learnerReport(student.actor, r1.id), { status: 403 });
      assert.equal((await school.staffReport(owner.actor, org.id, r1.id)).subjects.find(r => r.offering.id === offering.id).grade.percent, 88);
      await school.changeStatus(owner.actor, org.id, "student", member.id, { expectedVersion: member.version + 1, status: "ACTIVE" });
    });
    await t.test("current staff revocation, Campus pausing and verified-operation loss immediately close access", async () => {
      await db.organizationMembership.updateMany({ where: { organizationId: org.id, accountId: teacher.id }, data: { enabled: false } });
      await assert.rejects(school.subject(teacher.actor, org.id, offering.id), { status: 403 });
      await db.organizationMembership.updateMany({ where: { organizationId: org.id, accountId: teacher.id }, data: { enabled: true } });
      await campus.pause(owner.actor, org.id, { expectedVersion: 2 });
      await assert.rejects(school.subject(teacher.actor, org.id, offering.id), { status: 409 });
      await assert.rejects(school.learnerReport(student.actor, r1.id), { status: 403 });
      await campus.resume(owner.actor, org.id, { expectedVersion: 3 });
      await db.organizationOperatingLocation.updateMany({ where: { organizationId: org.id }, data: { countryCode: "GH" } });
      await assert.rejects(school.setup(owner.actor, org.id), { status: 409 });
      await assert.rejects(school.learnerReport(student.actor, r1.id), { status: 403 });
    });
  } finally {
    for (const model of ["gradeSchoolScore", "gradeSchoolAttendanceRecord", "gradeSchoolAssessment", "gradeSchoolAttendance", "gradeSchoolSchedule", "gradeSchoolElective", "gradeSchoolGuardian", "gradeSchoolRegistration", "gradeSchoolOffering", "gradeSchoolStudent", "gradeSchoolPeriod", "gradeSchoolSection", "gradeSchoolSubject", "gradeSchoolClass", "gradeSchoolYear", "virtualCampusAudit", "campusAnnouncement"]) await db[model].deleteMany({ where: { campusId: { in: organizations } } });
    await db.virtualCampus.deleteMany({ where: { organizationId: { in: organizations } } });
    await db.admissionApplication.deleteMany({ where: { applicantId: { in: accounts } } });
    await db.admissionCycle.deleteMany({ where: { organizationId: { in: organizations } } });
    await db.program.deleteMany({ where: { organizationId: { in: organizations } } });
    await db.platformNotification.deleteMany({ where: { recipientId: { in: accounts } } });
    await db.organizationMembership.deleteMany({ where: { organizationId: { in: organizations } } });
    await db.organizationOperatingLocation.deleteMany({ where: { organizationId: { in: organizations } } });
    await clearOrganizationProfiles(db, organizations);
    await db.organization.deleteMany({ where: { id: { in: organizations } } });
    await db.organizationRequest.deleteMany({ where: { id: { in: requests } } });
    await db.session.deleteMany({ where: { accountId: { in: accounts } } });
    await db.mfaFactor.deleteMany({ where: { accountId: { in: accounts } } });
    await db.account.deleteMany({ where: { id: { in: accounts } } });
    await db.person.deleteMany({ where: { id: { in: people } } });
    if (oldProduct) await db.productAvailability.update({ where: productWhere, data: { enabled: oldProduct.enabled } });
    else await db.productAvailability.deleteMany({ where: { product: "VIRTUAL_CAMPUS", countryCode: "LR" } });
    await db.$disconnect();
  }
});
