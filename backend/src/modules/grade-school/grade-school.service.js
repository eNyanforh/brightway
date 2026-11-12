import { chargeRegistration, registrationBilling, assertRegistrationBilling } from "../billing/billing-core.js";
import { createCampusService } from "../campus/campus.service.js";
import { assessEligibility } from "../campus/campus.schema.js";
import { assertMfaSession } from "../auth/mfa.service.js";
import { notify } from "../notifications/platform-notification.js";
import * as s from "./grade-school.schema.js";

const MANAGE = "organization.campus.academics.manage", TEACH = "organization.campus.teach";
const identity = { id: true, username: true, person: { select: { firstName: true, middleName: true, lastName: true } } };
const person = a => ({ id: a.id, username: a.username, fullName: [a.person.firstName, a.person.middleName, a.person.lastName].filter(Boolean).join(" ") });
const offeringInclude = { subject: true, section: { include: { schoolClass: true } }, period: true, teacher: { select: identity }, schedules: { orderBy: [{ weekday: "asc" }, { startsAt: "asc" }] } };
const studentInclude = { account: { select: identity } };
const registrationInclude = { student: { include: studentInclude }, section: { include: { schoolClass: true } }, period: { include: { year: true } }, electives: true };
const conflict = () => s.fail(409, "This academic record changed or already exists. Reload before continuing.");
const ownHref = "/learning?view=campus";
const projectRegistration = r => ({ ...r, student: { ...r.student, account: person(r.student.account) } });
const projectOffering = r => ({ ...r, teacher: r.teacher ? person(r.teacher) : null });

export function createGradeSchoolService({ prisma, now = () => new Date() }) {
  const campus = createCampusService({ prisma, now });
  async function tx(work) {
    try { return await prisma.$transaction(work, { timeout: 15000 }); }
    catch (e) { if (["P2002", "P2034"].includes(e.code)) throw conflict(); throw e; }
  }
  async function staff(db, actor, campusId, write, managerOnly = false) {
    const ctx = await campus.authorize(db, actor, s.identifier(campusId), { write, lock: write, requireActive: true });
    if (ctx.organization.campus.engine !== "GRADE_SCHOOL") throw s.fail(409, "These operations require a Grade School Campus.");
    ctx.manager = ctx.grants.includes(MANAGE);
    if (!ctx.manager && (managerOnly || !ctx.grants.includes(TEACH))) throw s.fail(403, "Academic management or assigned teaching permission is required.");
    return ctx;
  }
  async function work(actor, campusId, write, managerOnly, fn) {
    return tx(async db => {
      const ctx = await staff(db, actor, campusId, write, managerOnly);
      const result = await fn(db, ctx);
      await staff(db, actor, campusId, false, managerOnly);
      return result;
    });
  }
  async function audit(db, actor, campusId, action, data) {
    await db.virtualCampusAudit.create({ data: { campusId, actorId: actor.accountId, action: "SCHOOL_" + action, data } });
  }
  async function notifyClass(db, items) {
    for (let offset = 0; offset < items.length; offset += 200) await db.platformNotification.createMany({ data: items.slice(offset, offset + 200), skipDuplicates: true });
  }
  async function get(db, model, campusId, id, include) {
    const row = await db[model].findFirst({ where: { id: s.identifier(id), campusId }, ...(include ? { include } : {}) });
    if (!row) throw s.fail(404, "Academic record is unavailable.");
    return row;
  }
  async function subjectAccess(db, ctx, actor, campusId, id) {
    const row = await get(db, "gradeSchoolOffering", campusId, id, offeringInclude);
    if (!ctx.manager && row.teacherId !== actor.accountId) throw s.fail(403, "You can manage only your assigned subjects.");
    return row;
  }
  const rosterWhere = row => ({ campusId: row.campusId, periodId: row.periodId, sectionId: row.sectionId,
    status: "ACTIVE", student: { status: "ACTIVE", account: { status: "ACTIVE" } },
    ...(row.mode === "ELECTIVE" ? { electives: { some: { offeringId: row.id } } } : {}) });
  async function roster(db, row) {
    return db.gradeSchoolRegistration.findMany({ where: rosterWhere(row), include: registrationInclude, orderBy: { id: "asc" }, take: 500 });
  }
  async function eligible(db, campusId) {
    const row = await db.virtualCampus.findUnique({ where: { organizationId: campusId }, include: { organization: { include: { locations: true, request: { select: { status: true } } } } } });
    const product = await db.productAvailability.findUnique({ where: { product_countryCode: { product: "VIRTUAL_CAMPUS", countryCode: "LR" } } });
    if (row?.engine !== "GRADE_SCHOOL" || row.status !== "ACTIVE" || !assessEligibility(row.organization, product).eligible) throw s.fail(403, "Your school Campus is currently unavailable. Contact the school administration.");
    return row;
  }
  async function live(db, actor, write = false) {
    if (!actor?.accountId || !actor?.sessionId) throw s.fail(401, "Please sign in again.");
    const account = await db.account.findUnique({ where: { id: actor.accountId }, select: { status: true, emailVerifiedAt: true } });
    if (account?.status !== "ACTIVE" || !await db.session.findFirst({ where: { id: actor.sessionId, accountId: actor.accountId, expiresAt: { gt: now() } } })) throw s.fail(401, "Please sign in again.");
    if (write && !account.emailVerifiedAt) throw s.fail(403, "Verify your email before confirming a guardian relationship.");
    if ((await db.mfaFactor.findUnique({ where: { accountId: actor.accountId } }))?.enabled) await assertMfaSession(db, actor.accountId, actor.sessionId, now());
  }
  async function dateWithin(db, campusId, offering, date) {
    const period = await get(db, "gradeSchoolPeriod", campusId, offering.periodId);
    if (date < period.startsOn || date > period.endsOn) throw s.fail(400, "The session or assessment date must fall within its academic period.");
  }
  async function scheduleConflict(db, row, data, teacherId = row.teacherId, ignoreId) {
    // Check overlapping academic periods too, including a future year created early.
    const rows = await db.gradeSchoolSchedule.findMany({ where: { campusId: row.campusId, weekday: data.weekday,
      startsAt: { lt: data.endsAt }, endsAt: { gt: data.startsAt }, ...(ignoreId ? { id: { not: ignoreId } } : {}),
      offering: { period: { startsOn: { lte: row.period.endsOn }, endsOn: { gte: row.period.startsOn } },
        OR: [{ sectionId: row.sectionId }, ...(teacherId ? [{ teacherId }] : [])] } } });
    if (rows.length) throw s.fail(409, "This time overlaps another lesson for the section or assigned teacher.");
  }
  async function report(db, registration) {
    const offerings = await db.gradeSchoolOffering.findMany({ where: { campusId: registration.campusId, periodId: registration.periodId, sectionId: registration.sectionId,
      OR: [{ mode: "COMPULSORY" }, { electives: { some: { registrationId: registration.id } } }] }, include: offeringInclude, orderBy: { id: "asc" } });
    const offeringIds = offerings.map(o => o.id);
    const [allScores, allAttendance, school] = await Promise.all([
      db.gradeSchoolScore.findMany({ where: { registrationId: registration.id, assessment: { offeringId: { in: offeringIds }, status: "FINAL" } }, include: { assessment: true } }),
      db.gradeSchoolAttendanceRecord.findMany({ where: { registrationId: registration.id, attendance: { offeringId: { in: offeringIds }, status: "FINAL" } }, include: { attendance: true }, orderBy: { attendance: { heldOn: "desc" } } }),
      db.virtualCampus.findUnique({ where: { organizationId: registration.campusId }, select: { displayName: true } }),
    ]);
    const rows = offerings.map(o => {
      const scores = allScores.filter(r => r.assessment.offeringId === o.id), attendance = allAttendance.filter(r => r.attendance.offeringId === o.id);
      return { offering: projectOffering(o), grade: s.calculateGrade(scores.map(r => ({ score: r.score, maxScore: r.assessment.maxScore, weight: r.assessment.weight })), o.subject.passingMark),
        assessments: scores.map(r => ({ id: r.assessment.id, title: r.assessment.title, heldOn: r.assessment.heldOn, score: r.score, maxScore: r.assessment.maxScore, weight: r.assessment.weight })),
        attendance: attendance.map(r => ({ id: r.attendance.id, heldOn: r.attendance.heldOn, startsAt: r.attendance.startsAt, status: r.status })) };
    });
    return { schoolName: school.displayName, registration: projectRegistration(registration), subjects: rows };
  }
  const service = {
    async acceptedAdmissions(actor, campusId, input = {}) {
      const q = s.parse(s.query, input);
      return work(actor, campusId, false, true, async db => {
        const where = { status: "ACCEPTED", withdrawnAt: null, cycle: { organizationId: campusId }, schoolRegistration: null,
          ...(q.q ? { applicant: { OR: [{ username: { contains: q.q, mode: "insensitive" } }, { person: { firstName: { contains: q.q, mode: "insensitive" } } }, { person: { lastName: { contains: q.q, mode: "insensitive" } } }] } } : {}) };
        if (q.cursor && !await db.admissionApplication.findFirst({ where: { ...where, id: q.cursor } })) throw s.fail(404, "Admission page is unavailable.");
        const rows = await db.admissionApplication.findMany({ where, select: { id: true, applicant: { select: identity }, cycle: { select: { title: true } } }, orderBy: { id: "asc" }, take: 51,
          ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
        return { items: rows.slice(0, 50).map(r => ({ id: r.id, applicant: person(r.applicant), cycleTitle: r.cycle.title })), nextCursor: rows.length > 50 ? rows[49].id : null };
      });
    },
    async setup(actor, campusId, input = {}) {
      const q = s.parse(s.query, input);
      return work(actor, campusId, false, false, async (db, ctx) => {
        const [subjects, classes, years] = await Promise.all([
          db.gradeSchoolSubject.findMany({ where: { campusId }, orderBy: { name: "asc" } }),
          db.gradeSchoolClass.findMany({ where: { campusId }, include: { sections: { orderBy: { name: "asc" } } }, orderBy: { name: "asc" } }),
          db.gradeSchoolYear.findMany({ where: { campusId }, include: { periods: { orderBy: { startsOn: "asc" } } }, orderBy: { startsOn: "desc" } }),
        ]);
        const periodId = q.periodId || years.flatMap(y => y.periods).sort((a, b) => b.startsOn - a.startsOn)[0]?.id || null;
        if (periodId) await get(db, "gradeSchoolPeriod", campusId, periodId);
        const offerings = periodId ? await db.gradeSchoolOffering.findMany({ where: { campusId, periodId, ...(!ctx.manager ? { teacherId: actor.accountId } : {}) }, include: offeringInclude, orderBy: { id: "asc" } }) : [];
        return { campusId, displayName: ctx.organization.campus.displayName, canManage: ctx.manager, periodId, subjects, classes, years, offerings: offerings.map(projectOffering) };
      });
    },
    async configure(actor, campusId, kind, input) {
      const definitions = { subjects: [s.subject, "gradeSchoolSubject"], classes: [s.schoolClass, "gradeSchoolClass"], sections: [s.section, "gradeSchoolSection"], years: [s.year, "gradeSchoolYear"], periods: [s.period, "gradeSchoolPeriod"], offerings: [s.offering, "gradeSchoolOffering"] };
      if (!definitions[kind]) throw s.fail(404, "Academic setup operation is unavailable.");
      const [schema, model] = definitions[kind], data = s.parse(schema, input);
      return work(actor, campusId, true, true, async db => {
        if (kind === "sections") await get(db, "gradeSchoolClass", campusId, data.classId);
        if (kind === "periods") {
          const year = await get(db, "gradeSchoolYear", campusId, data.yearId);
          if (data.startsOn < year.startsOn || data.endsOn > year.endsOn) throw s.fail(400, "Terms and semesters must fall within their academic year.");
          const overlapping = await db.gradeSchoolPeriod.count({ where: { campusId, yearId: data.yearId, startsOn: { lte: data.endsOn }, endsOn: { gte: data.startsOn } } });
          if (overlapping) throw s.fail(409, "Academic periods in the same year cannot overlap.");
        }
        if (kind === "offerings") {
          await get(db, "gradeSchoolPeriod", campusId, data.periodId); await get(db, "gradeSchoolSection", campusId, data.sectionId); await get(db, "gradeSchoolSubject", campusId, data.subjectId);
        }
        const row = await db[model].create({ data: { ...data, campusId } });
        await audit(db, actor, campusId, "CONFIGURED", { kind, recordId: row.id, ...JSON.parse(JSON.stringify(data)) });
        return row;
      });
    },
    async assign(actor, campusId, offeringId, input) {
      const data = s.parse(s.assignment, input);
      return work(actor, campusId, true, true, async db => {
        const row = await get(db, "gradeSchoolOffering", campusId, offeringId, offeringInclude);
        if (row.version !== data.expectedVersion) throw conflict();
        let teacherId = null;
        if (data.username) {
          const teacher = await db.account.findUnique({ where: { username: data.username }, select: { id: true, status: true } });
          const membership = teacher && await db.organizationMembership.findFirst({ where: { organizationId: campusId, accountId: teacher.id, enabled: true } });
          if (teacher?.status !== "ACTIVE" || !membership || (membership.role !== "PRIMARY_ADMIN" && !membership.permissions.includes(TEACH))) throw s.fail(400, "The teacher must be active school staff with assigned teaching permission.");
          teacherId = teacher.id;
          for (const lesson of row.schedules) await scheduleConflict(db, row, lesson, teacherId, lesson.id);
        }
        await db.gradeSchoolOffering.update({ where: { id: row.id }, data: { teacherId, version: { increment: 1 } } });
        await audit(db, actor, campusId, "TEACHER_ASSIGNED", { offeringId: row.id, previousTeacherId: row.teacherId, teacherId, version: row.version + 1 });
        return { id: row.id, version: row.version + 1 };
      });
    },
    async register(actor, campusId, input) {
      const data = s.parse(s.registration, input);
      return work(actor, campusId, true, true, async db => {
        await get(db, "gradeSchoolPeriod", campusId, data.periodId);
        const section = await get(db, "gradeSchoolSection", campusId, data.sectionId);
        const account = await db.account.findUnique({ where: { username: data.username }, select: { id: true, status: true } });
        if (account?.status !== "ACTIVE") throw s.fail(400, "An active BrightWay student account is required.");
        let student = await db.gradeSchoolStudent.findUnique({ where: { campusId_accountId: { campusId, accountId: account.id } } });
        if (student && ["SUSPENDED", "FORMER"].includes(student.status)) throw s.fail(409, "Restore the student membership before registering another period.");
        if (data.source === "RETURNING" && (!student || !await db.gradeSchoolRegistration.findFirst({ where: { studentId: student.id, periodId: { not: data.periodId }, activatedAt: { not: null } } }))) throw s.fail(400, "Returning registration requires a previous activated school registration.");
        if (data.admissionId) {
          const admission = await db.admissionApplication.findFirst({ where: { id: data.admissionId, applicantId: account.id, status: "ACCEPTED", withdrawnAt: null, cycle: { organizationId: campusId } } });
          if (!admission) throw s.fail(400, "Select an accepted admission for this student and school.");
        }
        const electives = await db.gradeSchoolOffering.findMany({ where: { campusId, id: { in: data.electiveIds }, periodId: data.periodId, sectionId: data.sectionId, mode: "ELECTIVE" } });
        if (electives.length !== data.electiveIds.length) throw s.fail(400, "Choose electives offered to this section in the selected period.");
        if (student) {
          const previous = await db.gradeSchoolRegistration.findUnique({ where: { campusId_studentId_periodId: { campusId, studentId: student.id, periodId: data.periodId } }, include: { electives: true } });
          if (previous) {
            if (previous.sectionId !== data.sectionId || previous.source !== data.source || previous.admissionId !== data.admissionId || JSON.stringify(previous.electives.map(e => e.offeringId).sort()) !== JSON.stringify([...data.electiveIds].sort())) throw conflict();
            await chargeRegistration(db, previous, actor);
            return previous;
          }
        }
        if (await db.gradeSchoolRegistration.count({ where: { campusId, sectionId: data.sectionId, periodId: data.periodId, status: { not: "FORMER" } } }) >= section.capacity) throw s.fail(409, "This section has reached its capacity for the period.");
        if (!student) student = await db.gradeSchoolStudent.create({ data: { campusId, accountId: account.id } });
        const row = await db.gradeSchoolRegistration.create({ data: { campusId, studentId: student.id, periodId: data.periodId, sectionId: data.sectionId, admissionId: data.admissionId, source: data.source } });
        await chargeRegistration(db, row, actor);
        if (data.electiveIds.length) await db.gradeSchoolElective.createMany({ data: data.electiveIds.map(offeringId => ({ campusId, registrationId: row.id, offeringId })) });
        await audit(db, actor, campusId, "REGISTERED", { registrationId: row.id, studentId: student.id, periodId: data.periodId, sectionId: data.sectionId, source: data.source, admissionId: data.admissionId, electiveIds: data.electiveIds });
        await notify(db, { recipientId: account.id, eventKey: "school-registration:" + row.id, kind: "CAMPUS_REGISTRATION", title: "Your school registration is confirmed. Campus access is being finalized.", href: ownHref, actorAccountId: actor.accountId });
        return row;
      });
    },
    async registrations(actor, campusId, input = {}) {
      const q = s.parse(s.query, input);
      return work(actor, campusId, false, true, async db => {
        const where = { campusId, ...(q.periodId ? { periodId: q.periodId } : {}), ...(q.q ? { student: { account: { OR: [{ username: { contains: q.q, mode: "insensitive" } }, { person: { firstName: { contains: q.q, mode: "insensitive" } } }, { person: { lastName: { contains: q.q, mode: "insensitive" } } }] } } } : {}) };
        if (q.cursor && !await db.gradeSchoolRegistration.findFirst({ where: { ...where, id: q.cursor } })) throw s.fail(404, "Registration page is unavailable.");
        const rows = await db.gradeSchoolRegistration.findMany({ where, include: registrationInclude, orderBy: { id: "asc" }, take: 51, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
        const students = rows.slice(0, 50);
        const guardians = await db.gradeSchoolGuardian.findMany({ where: { campusId, studentId: { in: students.map(r => r.studentId) } }, include: { guardian: { select: identity } } });
        return { items: students.map(projectRegistration), nextCursor: rows.length > 50 ? rows[49].id : null, guardians: guardians.map(g => ({ ...g, guardian: person(g.guardian) })) };
      });
    },
    async changeStatus(actor, campusId, kind, recordId, input) {
      const data = s.parse(s.status, input), model = kind === "student" ? "gradeSchoolStudent" : "gradeSchoolRegistration";
      return work(actor, campusId, true, true, async db => {
        const row = await get(db, model, campusId, recordId);
        if (row.version !== data.expectedVersion) throw conflict();
        if (!s.transitions[row.status].includes(data.status) && !(kind === "student" && row.status === "FORMER" && data.status === "ACTIVE")) throw s.fail(409, "This student status transition is unavailable.");
        if (kind !== "student" && data.status === "ACTIVE") {
          const member = await get(db, "gradeSchoolStudent", campusId, row.studentId);
          if (["SUSPENDED", "FORMER"].includes(member.status)) throw s.fail(409, "Restore the student membership first.");
          if (member.status === "PRE_REGISTERED") await db.gradeSchoolStudent.update({ where: { id: member.id }, data: { status: "ACTIVE", version: { increment: 1 } } });
          // A FORMER registration retains history but no longer reserves a seat.
          const section = await get(db, "gradeSchoolSection", campusId, row.sectionId);
          if (await db.gradeSchoolRegistration.count({ where: { campusId, periodId: row.periodId, sectionId: row.sectionId, status: { not: "FORMER" } } }) > section.capacity) throw s.fail(409, "Section capacity is exceeded.");
        }
        const updated = await db[model].update({ where: { id: row.id }, data: { status: data.status, version: { increment: 1 }, ...(kind !== "student" && data.status === "ACTIVE" && !row.activatedAt ? { activatedAt: now() } : {}) } });
        await audit(db, actor, campusId, "STATUS_CHANGED", { kind, recordId: row.id, from: row.status, to: data.status, version: updated.version });
        const student = kind === "student" ? row : await get(db, "gradeSchoolStudent", campusId, row.studentId);
        await notify(db, { recipientId: student.accountId, eventKey: `school-status:${kind}:${row.id}:${updated.version}`, kind: "CAMPUS_STATUS", title: "Your school Campus registration status has been updated.", href: ownHref, actorAccountId: actor.accountId });
        return updated;
      });
    },
    async linkGuardian(actor, campusId, input) {
      const data = s.parse(s.guardian, input);
      return work(actor, campusId, true, true, async db => {
        const student = await get(db, "gradeSchoolStudent", campusId, data.studentId);
        const guardian = await db.account.findUnique({ where: { username: data.username }, select: { id: true, status: true, emailVerifiedAt: true } });
        if (guardian?.status !== "ACTIVE" || !guardian.emailVerifiedAt || guardian.id === student.accountId) throw s.fail(400, "Choose a different, active guardian with a verified BrightWay email.");
        const previous = await db.gradeSchoolGuardian.findUnique({ where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } } });
        if (previous && previous.status !== "REVOKED") {
          if (previous.relationship !== data.relationship) throw conflict();
          return previous;
        }
        const row = previous ? await db.gradeSchoolGuardian.update({ where: { id: previous.id }, data: { relationship: data.relationship, status: "PENDING", confirmedAt: null, version: { increment: 1 } } })
          : await db.gradeSchoolGuardian.create({ data: { campusId, studentId: student.id, guardianId: guardian.id, relationship: data.relationship } });
        await audit(db, actor, campusId, "GUARDIAN_REQUESTED", { guardianLinkId: row.id, guardianId: guardian.id, studentId: student.id });
        await notify(db, { recipientId: guardian.id, eventKey: `school-guardian:${row.id}:${row.version}`, kind: "CAMPUS_GUARDIAN", title: "A school has requested your confirmation as a parent or guardian.", href: "/learning?view=guardians", actorAccountId: actor.accountId });
        return row;
      });
    },
    async guardianRequests(actor) {
      return tx(async db => {
        await live(db, actor);
        const rows = await db.gradeSchoolGuardian.findMany({ where: { guardianId: actor.accountId, status: { not: "REVOKED" } }, include: { student: { include: { account: { select: identity }, campus: { select: { displayName: true } }, registrations: { include: { period: true, section: { include: { schoolClass: true } } }, orderBy: { createdAt: "desc" } } } } }, orderBy: { createdAt: "desc" } });
        return { items: rows.map(r => ({ id: r.id, campusId: r.campusId, version: r.version, status: r.status, relationship: r.relationship, schoolName: r.student.campus.displayName,
          student: person(r.student.account), registrations: r.status === "CONFIRMED" ? r.student.registrations.map(v => ({ id: v.id, period: v.period.name, section: v.section.name, status: v.status })) : [] })) };
      });
    },
    async guardianDecision(actor, linkId, input, campusId = null) {
      const data = s.parse(s.guardianDecision, input);
      return tx(async db => {
        await live(db, actor, true);
        let ctx;
        if (campusId) ctx = await staff(db, actor, campusId, true, true);
        const row = await db.gradeSchoolGuardian.findFirst({ where: { id: s.identifier(linkId), ...(campusId ? { campusId } : { guardianId: actor.accountId }) } });
        if (!row) throw s.fail(404, "Guardian relationship is unavailable.");
        // Serializes guardian confirmations/revocations with final attendance notifications.
        if (!ctx) await db.organization.update({ where: { id: row.campusId }, data: { staffVersion: { increment: 0 } } });
        const current = await db.gradeSchoolGuardian.findUnique({ where: { id: row.id } });
        if (current.version !== data.expectedVersion || current.status === "REVOKED") throw conflict();
        if (data.decision === "CONFIRM" && (campusId || current.status !== "PENDING")) throw s.fail(403, "Only the invited guardian can confirm this relationship.");
        if (data.decision === "CONFIRM") await eligible(db, row.campusId);
        const updated = await db.gradeSchoolGuardian.update({ where: { id: row.id }, data: { status: data.decision === "CONFIRM" ? "CONFIRMED" : "REVOKED", confirmedAt: data.decision === "CONFIRM" ? now() : null, version: { increment: 1 } } });
        await audit(db, actor, row.campusId, "GUARDIAN_" + data.decision, { guardianLinkId: row.id, studentId: row.studentId, guardianId: row.guardianId });
        return { id: updated.id, version: updated.version, status: updated.status };
      });
    },
    async createSchedule(actor, campusId, input) {
      const data = s.parse(s.schedule, input);
      return work(actor, campusId, true, true, async db => {
        const row = await get(db, "gradeSchoolOffering", campusId, data.offeringId, offeringInclude);
        if (!row.teacherId) throw s.fail(409, "Assign a teacher before scheduling this subject.");
        await scheduleConflict(db, row, data);
        const lesson = await db.gradeSchoolSchedule.create({ data: { ...data, campusId } });
        await audit(db, actor, campusId, "SCHEDULED", { scheduleId: lesson.id, ...data });
        return lesson;
      });
    },
    async removeSchedule(actor, campusId, scheduleId) {
      return work(actor, campusId, true, true, async db => {
        const row = await get(db, "gradeSchoolSchedule", campusId, scheduleId);
        await audit(db, actor, campusId, "SCHEDULE_REMOVED", { ...row });
        await db.gradeSchoolSchedule.delete({ where: { id: row.id } });
        return { removed: true };
      });
    },
    async subject(actor, campusId, offeringId) {
      return work(actor, campusId, false, false, async (db, ctx) => {
        const row = await subjectAccess(db, ctx, actor, campusId, offeringId);
        const [students, attendance, assessments] = await Promise.all([
          roster(db, row), db.gradeSchoolAttendance.findMany({ where: { campusId, offeringId: row.id }, include: { records: true }, orderBy: { heldOn: "desc" } }),
          db.gradeSchoolAssessment.findMany({ where: { campusId, offeringId: row.id }, include: { scores: true }, orderBy: { heldOn: "desc" } }),
        ]);
        await subjectAccess(db, ctx, actor, campusId, offeringId);
        return { offering: projectOffering(row), students: students.map(projectRegistration), attendance, assessments };
      });
    },
    async createSession(actor, campusId, kind, input) {
      const data = s.parse(kind === "attendance" ? s.attendance : s.assessment, input);
      return work(actor, campusId, true, false, async (db, ctx) => {
        const offering = await subjectAccess(db, ctx, actor, campusId, data.offeringId);
        await dateWithin(db, campusId, offering, data.heldOn);
        if (kind === "attendance" && data.heldOn > now()) throw s.fail(400, "Attendance cannot be recorded for a future date.");
        const model = kind === "attendance" ? "gradeSchoolAttendance" : "gradeSchoolAssessment";
        const previous = await db[model].findFirst({ where: { campusId, offeringId: offering.id, ...(kind === "attendance" ? { heldOn: data.heldOn, startsAt: data.startsAt } : { title: data.title }) } });
        if (previous) {
          if (kind !== "attendance" && (previous.maxScore !== data.maxScore || previous.weight !== data.weight || +previous.heldOn !== +data.heldOn)) throw conflict();
          return previous;
        }
        const row = await db[model].create({ data: { ...data, campusId } });
        await audit(db, actor, campusId, "SESSION_CREATED", { kind, recordId: row.id, offeringId: offering.id });
        return row;
      });
    },
    async submit(actor, campusId, kind, recordId, input) {
      const data = s.parse(s.submission(kind), input), isAttendance = kind === "attendance";
      return work(actor, campusId, true, false, async (db, ctx) => {
        const model = isAttendance ? "gradeSchoolAttendance" : "gradeSchoolAssessment";
        const row = await get(db, model, campusId, recordId);
        const offering = await subjectAccess(db, ctx, actor, campusId, row.offeringId);
        if (row.version !== data.expectedVersion || row.status !== "DRAFT") throw conflict();
        const students = await roster(db, offering);
        s.completeRoster(students, data.records, data.finalize);
        if (!isAttendance && data.records.some(r => r.score > row.maxScore)) throw s.fail(400, "Scores cannot exceed the assessment maximum.");
        const recordsModel = isAttendance ? "gradeSchoolAttendanceRecord" : "gradeSchoolScore", field = isAttendance ? "attendanceId" : "assessmentId";
        await db[recordsModel].deleteMany({ where: { campusId, [field]: row.id } });
        if (data.records.length) await db[recordsModel].createMany({ data: data.records.map(r => ({ ...r, campusId, [field]: row.id })) });
        const updated = await db[model].update({ where: { id: row.id }, data: { version: { increment: 1 }, ...(data.finalize ? { status: "FINAL", finalizedAt: now() } : {}) } });
        await audit(db, actor, campusId, data.finalize ? "FINAL_SUBMITTED" : "DRAFT_SAVED", { kind, recordId: row.id, version: updated.version, records: data.records });
        if (data.finalize && isAttendance) {
          const registrationsById = new Map(students.map(r => [r.id, r]));
          const absent = new Map(data.records.filter(r => r.status === "ABSENT").map(r => {
            const registration = registrationsById.get(r.registrationId);
            return [registration.studentId, registration.id];
          }));
          if (absent.size) {
            const guardians = await db.gradeSchoolGuardian.findMany({ where: { campusId, studentId: { in: [...absent.keys()] }, status: "CONFIRMED", guardian: { status: "ACTIVE" } }, select: { id: true, studentId: true, guardianId: true } });
            await notifyClass(db, guardians.map(guardian => ({ recipientId: guardian.guardianId, eventKey: `school-absence:${row.id}:${absent.get(guardian.studentId)}:${guardian.id}`, kind: "CAMPUS_ABSENCE",
              title: "A confirmed student's subject absence was finalized. View the Campus record.", href: "/learning?view=guardians", actorAccountId: actor.accountId })));
          }
        } else if (data.finalize) {
          await notifyClass(db, students.map(registration => ({ recipientId: registration.student.accountId, eventKey: `school-grades:${row.id}:${registration.id}`, kind: "CAMPUS_GRADES", title: "New finalized assessment results are available in My Campus.", href: ownHref, actorAccountId: actor.accountId })));
        }
        return { id: row.id, status: updated.status, version: updated.version };
      });
    },
    async myCampus(actor) {
      return tx(async db => {
        await live(db, actor);
        const rows = await db.gradeSchoolRegistration.findMany({ where: { student: { accountId: actor.accountId } }, include: { ...registrationInclude, student: { include: { ...studentInclude, campus: { select: { displayName: true } } } } }, orderBy: { createdAt: "desc" } });
        const available = new Map();
        for (const campusId of new Set(rows.map(r => r.campusId))) {
          try { await eligible(db, campusId); available.set(campusId, true); }
          catch (e) { if (e.status !== 403) throw e; available.set(campusId, false); }
        }
        return { items: await Promise.all(rows.map(async r => ({ billing: await registrationBilling(db, r, now()), id: r.id, campusId: r.campusId, schoolName: r.student.campus.displayName, status: r.status, available: available.get(r.campusId),
          studentStatus: r.student.status, period: r.period.name, year: r.period.year.name, section: r.section.schoolClass.name + " / " + r.section.name,
          message: r.status === "PRE_REGISTERED" ? `Welcome, ${r.student.account.person.firstName}! Your registration has been confirmed by the school. Your Campus access is currently being finalized. Please be patient while the administration completes the process. You will receive full access once your registration is fully activated. — ${r.student.campus.displayName} Administration.` : null }))) };
      });
    },
    async learnerReport(actor, registrationId, asGuardian = false) {
      return tx(async db => {
        await live(db, actor);
        const where = { id: s.identifier(registrationId), status: "ACTIVE", student: { status: "ACTIVE", ...(asGuardian ? { guardians: { some: { guardianId: actor.accountId, status: "CONFIRMED" } } } : { accountId: actor.accountId }) } };
        const registration = await db.gradeSchoolRegistration.findFirst({ where, include: registrationInclude });
        if (!registration) throw s.fail(403, "Active registration and authorized student or confirmed guardian access are required.");
        await eligible(db, registration.campusId);
        await assertRegistrationBilling(db, registration, now());
        const result = await report(db, registration);
        const announcements = await db.campusAnnouncement.findMany({ where: { campusId: registration.campusId, withdrawnAt: null, audience: "CAMPUS" }, select: { id: true, title: true, body: true, createdAt: true }, take: 50, orderBy: { createdAt: "desc" } });
        // Keep student and contact data out of unrelated accounts and all drafts out of reports.
        await live(db, actor); await eligible(db, registration.campusId);
        if (!await db.gradeSchoolRegistration.findFirst({ where, select: { id: true } })) throw s.fail(403, "Student or guardian access has changed. Reload your Campus access.");
        await assertRegistrationBilling(db, registration, now());
        return { ...result, announcements };
      });
    },
    async staffReport(actor, campusId, registrationId) {
      return work(actor, campusId, false, true, async db => report(db, await get(db, "gradeSchoolRegistration", campusId, registrationId, registrationInclude)));
    },
  };
  return service;
}
