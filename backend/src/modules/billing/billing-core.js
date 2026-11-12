import { createHash } from "node:crypto";
import { accessState, dueFor, fail } from "./billing.schema.js";
export const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const chargeInclude = { adjustments: true, allocations: { include: { payment: { select: { status: true } } } } };
export const ensureAccount = (db, campusId) => db.billingAccount.upsert({ where: { campusId }, create: { campusId }, update: {} });
export const billingAudit = (db, campusId, actor, action, data) => db.billingAudit.create({ data: { campusId, actorId: actor.staffId || actor.accountId || "billing-maintenance", actorKind: actor.staffId ? "MANAGEMENT" : actor.accountId ? "ORGANIZATION" : "SYSTEM", action, data } });

// Called inside the same locked academic transaction as official registration.
// No admission, module, attendance or activation operation invokes this boundary.
export async function chargeRegistration(db, registration, actor) {
  const r = await db.gradeSchoolRegistration.findUnique({ where: { id: registration.id }, include: { student: true, period: { include: { year: true } } } });
  await ensureAccount(db, r.campusId);
  let semester = r.period.billingSemesterId && await db.billingSemester.findUnique({ where: { id: r.period.billingSemesterId } });
  if (!semester && r.period.kind === "SEMESTER") {
    semester = await db.billingSemester.upsert({ where: { id: r.period.id }, create: { id: r.period.id, campusId: r.campusId, name: r.period.name + " · " + r.period.id.slice(0, 8), startsOn: r.period.startsOn, endsOn: r.period.endsOn, resumesOn: r.period.startsOn }, update: {} });
    await db.gradeSchoolPeriod.update({ where: { id: r.periodId }, data: { billingSemesterId: semester.id } });
  }
  if (!semester) throw fail(409, "Map this academic term to its billing semester in Campus billing before official registration.");
  const unitKey = `school:${r.studentId}:${semester.id}`;
  if (await db.billingCharge.findUnique({ where: { unitKey } })) return;
  const c = await db.billingCharge.create({ data: { campusId: r.campusId, unitKey, engine: "GRADE_SCHOOL", learnerAccountId: r.student.accountId, semesterId: semester.id, schoolRegistrationId: r.id, label: `${r.period.year.name} / ${semester.name.split(" · ")[0]}`.slice(0, 240), dueAt: dueFor(semester) } });
  await db.billingLedgerEntry.create({ data: { campusId: r.campusId, kind: "CHARGE", amountCents: 100, chargeId: c.id } });
  await billingAudit(db, r.campusId, actor, "CHARGE_CREATED", { chargeId: c.id, unitKey, amountCents: 100, sourceId: r.id });
}
export async function chargeEnrolment(db, enrolment, actor) {
  const e = await db.tvetEnrolment.findUnique({ where: { id: enrolment.id }, include: { learner: true, intake: { include: { program: true } } } });
  await ensureAccount(db, e.campusId);
  const unitKey = `tvet:${e.learnerId}:${e.programId}:${e.intakeId}`;
  if (await db.billingCharge.findUnique({ where: { unitKey } })) return;
  const c = await db.billingCharge.create({ data: { campusId: e.campusId, unitKey, engine: "TVET", learnerAccountId: e.learner.accountId, tvetEnrolmentId: e.id, label: `${e.intake.program.name} / ${e.intake.name}`.slice(0, 240) } });
  await db.billingLedgerEntry.create({ data: { campusId: e.campusId, kind: "CHARGE", amountCents: 100, chargeId: c.id } });
  await billingAudit(db, e.campusId, actor, "CHARGE_CREATED", { chargeId: c.id, unitKey, amountCents: 100, sourceId: e.id });
}
export async function registrationBilling(db, registration, timestamp) {
  const period = registration.period || await db.gradeSchoolPeriod.findUnique({ where: { id: registration.periodId } });
  if (!period.billingSemesterId) return null;
  const c = await db.billingCharge.findUnique({ where: { unitKey: `school:${registration.studentId}:${period.billingSemesterId}` }, include: chargeInclude });
  return c ? accessState(c, timestamp) : null;
}
export async function assertRegistrationBilling(db, registration, timestamp) {
  const billing = await registrationBilling(db, registration, timestamp);
  if (billing?.restricted) throw fail(403, "Your school has an unpaid BrightWay registration fee after the payment window and notice period. Contact the school administration. Access returns when payment or an adjustment is confirmed.");
  return billing;
}
