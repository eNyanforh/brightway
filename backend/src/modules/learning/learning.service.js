import { Prisma } from "@prisma/client";
import { isDeepStrictEqual } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { assertNetworkSession, lockNetworkAccounts } from "../network/network-authority.js";
import { assertMfaSession } from "../auth/mfa.service.js";
import { requireOrganizationProfile } from "../organizations/organization-profile.schema.js";
import { ownerProfileSelect, profileView } from "../profile/profile.service.js";
import { verifiedCredentials } from "../notifications/notifications.service.js";
import { processEvidence } from "../credentials/evidence.process.js";
import { fail } from "../network/network.schema.js";
import * as input from "./learning.schema.js";

const MANAGE = "organization.programs.manage", REVIEW = "organization.admissions.review";
const publicOrganization = { status: "ACTIVE", request: { status: "APPROVED" }, profileReadyAt: { not: null }, profilePhotoId: { not: null }, username: { not: null }, profileSetupStep: 5 };
const organizationSelect = { id: true, name: true, username: true, profilePhotoId: true };
const programSelect = { id: true, title: true, description: true, type: true, duration: true, field: true, studyMode: true, countryCode: true, location: true, requirements: true, version: true, status: true, createdAt: true, organizationId: true, organization: { select: organizationSelect } };
const cycleSelect = { id: true, title: true, opensAt: true, deadline: true, questions: true, version: true, status: true, publishedAt: true, createdAt: true, organizationId: true, organization: { select: organizationSelect }, programId: true, program: { select: programSelect } };
const fileSelect = { id: true, questionId: true, contentType: true, size: true, createdAt: true };
const applicationSelect = { id: true, status: true, version: true, answers: true, profileSnapshot: true, cycleSnapshot: true, feedback: true, submittedAt: true, withdrawnAt: true, createdAt: true, cycleId: true,
  cycle: { select: cycleSelect }, files: { select: fileSelect }, events: { select: { id: true, fromStatus: true, toStatus: true, feedback: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } };
const conflict = () => fail(409, "This cycle or application changed. Reload the saved version before continuing.");
const unavailable = () => fail(404, "This cycle or application is unavailable.");
const id = value => input.parse(input.identifier, value);
const day = now => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export function createLearningService({ prisma, storage, now = () => new Date(), processFile = processEvidence }) {
  async function transaction(work) {
    try { return await prisma.$transaction(work, { timeout: 15000 }); }
    catch (error) { if (["P2002", "P2034"].includes(error.code)) throw conflict(); throw error; }
  }
  async function lockOrganization(db, organizationId) {
    await db.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`;
  }
  async function lockAdmissionCycle(db, cycleId) {
    await db.$queryRaw`SELECT "id" FROM "AdmissionCycle" WHERE "id" = ${cycleId} FOR UPDATE`;
  }
  async function authorize(db, actor, organizationId, permission) {
    await assertNetworkSession(db, actor, now);
    const org = await db.organization.findFirst({ where: { id: organizationId, ...publicOrganization } });
    if (!org) throw unavailable();
    if (!org.offersTraining && org.type !== "SCHOOL") throw fail(403, "This organization does not offer education or training.");
    const member = await db.organizationMembership.findFirst({ where: { organizationId, accountId: actor.accountId, enabled: true }, select: { role: true, permissions: true, account: { select: { emailVerifiedAt: true } } } });
    if (!member || (member.role !== "PRIMARY_ADMIN" && !member.permissions.includes(permission))) throw fail(403, "Your organization role does not include this permission.");
    requireOrganizationProfile(org);
    if (!member.account.emailVerifiedAt) throw fail(403, "Verify your email before using organization tools.");
    await assertMfaSession(db, actor.accountId, actor.sessionId, now());
    return org;
  }
  async function organizationWork(actor, orgId, permission, work) {
    const organizationId = id(orgId);
    return transaction(async db => {
      await lockNetworkAccounts(db, [actor.accountId]);
      await lockOrganization(db, organizationId);
      await authorize(db, actor, organizationId, permission);
      const result = await work(db, organizationId);
      await authorize(db, actor, organizationId, permission);
      return result;
    });
  }
  async function ownerWork(actor, work) {
    return transaction(async db => {
      await lockNetworkAccounts(db, [actor.accountId]);
      await assertNetworkSession(db, actor, now);
      const result = await work(db);
      await assertNetworkSession(db, actor, now);
      return result;
    });
  }
  async function cycle(db, cycleId, organizationId) {
    const row = await db.admissionCycle.findFirst({ where: { id: cycleId, ...(organizationId ? { organizationId } : { status: { not: "DRAFT" }, program: { status: "PUBLISHED" }, organization: { ...publicOrganization, OR: [{ offersTraining: true }, { type: "SCHOOL" }] } }) }, select: cycleSelect });
    if (!row) throw unavailable();
    return row;
  }
  async function openAdmissionCycle(db, cycleId) {
    const row = await cycle(db, cycleId);
    if (!["UPCOMING", "OPEN"].includes(row.status) || row.opensAt > now() || row.deadline <= now()) throw fail(409, "This cycle is no longer accepting applications.");
    return row;
  }
  async function ownedApplication(db, actor, applicationId) {
    const row = await db.admissionApplication.findFirst({ where: { id: applicationId, applicantId: actor.accountId }, select: applicationSelect });
    if (!row) throw unavailable();
    return row;
  }
  async function event(db, actor, app, status, feedback = "") {
    await db.admissionApplicationEvent.create({ data: { applicationId: app.id, actorId: actor.accountId, fromStatus: app.status, toStatus: status, feedback } });
  }
  async function audit(db, actor, organizationId, action, entityId, data = {}) {
    await db.organizationStaffAudit.create({ data: { organizationId, actorId: actor.accountId, action, entityId, data } });
  }
  async function page(db, model, where, cursor, select) {
    let boundary = {};
    if (cursor) {
      const anchor = await db[model].findFirst({ where: { ...where, id: cursor }, select: { createdAt: true, id: true } });
      if (!anchor) throw fail(400, "This page is no longer available. Reload the list.");
      boundary = { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] };
    }
    const rows = await db[model].findMany({ where: { AND: [where, boundary] }, select, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21 });
    return { items: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19].id : null };
  }
  async function profileSnapshot(db, actor) {
    // Lock the profile alongside submission; completion is decided by the backend.
    const account = await db.account.findUniqueOrThrow({ where: { id: actor.accountId }, select: { username: true, personId: true, person: { select: { firstName: true, middleName: true, lastName: true } } } });
    await db.$queryRaw`SELECT "id" FROM "Profile" WHERE "personId" = ${account.personId} FOR UPDATE`;
    const row = await db.profile.findUnique({ where: { personId: account.personId }, select: ownerProfileSelect });
    const profile = row && profileView(row);
    if (!profile?.completion.complete) throw fail(403, "Complete your profile and verify your email before submitting an application.");
    return { name: [account.person.firstName, account.person.middleName, account.person.lastName].filter(Boolean).join(" "), username: account.username,
      headline: profile.headline, location: profile.location, skills: profile.skills, interests: profile.interests,
      credentials: await verifiedCredentials(db, row.id) };
  }
  async function lockApplicationAdmissionCycle(db, actor, applicationId) {
    const app = await ownedApplication(db, actor, applicationId);
    await lockOrganization(db, app.cycle.organizationId);
    await lockAdmissionCycle(db, app.cycleId);
    return ownedApplication(db, actor, applicationId);
  }
  async function reviewedApplication(db, organizationId, applicationId) {
    const app = await db.admissionApplication.findFirst({ where: { id: applicationId, submittedAt: { not: null }, cycle: { organizationId } }, select: { ...applicationSelect, applicantId: true } });
    if (!app) throw unavailable();
    return app;
  }
  return {
    async browse(actor, query) {
      const q = input.parse(input.browseInput, query);
      return ownerWork(actor, async db => {
        const matching = { ...(q.countryCode ? { countryCode: q.countryCode } : {}), ...(q.studyMode ? { studyMode: q.studyMode } : {}), ...(q.location ? { location: { contains: q.location, mode: "insensitive" } } : {}) };
        const orgWhere = { ...publicOrganization, OR: [{ offersTraining: true }, { type: "SCHOOL" }], ...(q.following ? { followers: { some: { followerId: actor.accountId, active: true } } } : {}) };
        const textMatch = q.q ? { OR: ["title", "description", "field"].map(k => ({ [k]: { contains: q.q, mode: "insensitive" } })).concat([{ organization: { name: { contains: q.q, mode: "insensitive" } } }]) } : {};
        const programs = { status: "PUBLISHED", organization: orgWhere, ...matching, ...textMatch };
        if (q.kind === "institutions") return page(db, "organization", { ...orgWhere, ...(q.countryCode || q.location ? { request: { status: "APPROVED", ...(q.countryCode ? { countryCode: q.countryCode } : {}), ...(q.location ? { city: { contains: q.location, mode: "insensitive" } } : {}) } } : {}), ...(q.q ? { name: { contains: q.q, mode: "insensitive" } } : {}), ...(q.studyMode ? { programs: { some: { status: "PUBLISHED", studyMode: q.studyMode } } } : {}) }, q.cursor, { ...organizationSelect, request: { select: { countryCode: true, city: true } } });
        if (q.kind === "admissions") return page(db, "admissionCycle", { status: { in: ["UPCOMING", "OPEN"] }, opensAt: { lte: now() }, deadline: { gt: now() }, organization: orgWhere, program: { status: "PUBLISHED", organization: orgWhere, ...matching }, ...(q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { program: textMatch }] } : {}) }, q.cursor, cycleSelect);
        // Exact titles and prefixes precede other matches; stable cursor order is
        // scoped to the same live organization, filters and following relationship.
        const escaped = q.q.replace(/[\\%_]/g, "\\$&"), pattern = `%${escaped}%`;
        const rows = await db.$queryRaw(Prisma.sql`
          WITH candidates AS (
            SELECT p.id, p."createdAt", CASE WHEN lower(p.title) = lower(${q.q}) THEN 3
              WHEN p.title ILIKE ${escaped + "%"} THEN 2 ELSE 1 END AS rank
            FROM "Program" p JOIN "Organization" o ON o.id = p."organizationId"
            JOIN "OrganizationRequest" r ON r.id = o."requestId"
            WHERE p.status = 'PUBLISHED' AND o.status = 'ACTIVE' AND r.status = 'APPROVED'
              AND (o."offersTraining" OR o.type = 'SCHOOL') AND o."profileReadyAt" IS NOT NULL
              AND o."profilePhotoId" IS NOT NULL AND o.username IS NOT NULL AND o."profileSetupStep" = 5
              ${q.q ? Prisma.sql`AND (p.title ILIKE ${pattern} OR p.description ILIKE ${pattern} OR p.field ILIKE ${pattern} OR o.name ILIKE ${pattern})` : Prisma.empty}
              ${q.countryCode ? Prisma.sql`AND p."countryCode" = ${q.countryCode}` : Prisma.empty}
              ${q.studyMode ? Prisma.sql`AND p."studyMode" = ${q.studyMode}` : Prisma.empty}
              ${q.location ? Prisma.sql`AND p.location ILIKE ${"%" + q.location.replace(/[\\%_]/g, "\\$&") + "%"}` : Prisma.empty}
              ${q.following ? Prisma.sql`AND EXISTS (SELECT 1 FROM "NetworkFollow" f WHERE f."followerId" = ${actor.accountId} AND f."targetOrganizationId" = o.id AND f.active)` : Prisma.empty}
          ) SELECT c.* FROM candidates c
          ${q.cursor ? Prisma.sql`WHERE EXISTS (SELECT 1 FROM candidates a WHERE a.id = ${q.cursor} AND (c.rank, c."createdAt", c.id) < (a.rank, a."createdAt", a.id))` : Prisma.empty}
          ORDER BY c.rank DESC, c."createdAt" DESC, c.id DESC LIMIT 21`);
        const selected = await db.program.findMany({ where: { ...programs, id: { in: rows.slice(0, 20).map(row => row.id) } }, select: programSelect });
        const byId = new Map(selected.map(row => [row.id, row]));
        return { items: rows.slice(0, 20).map(row => byId.get(row.id)).filter(Boolean), nextCursor: rows.length > 20 ? rows[19].id : null };
      });
    },
    async programDetail(actor, programId) {
      return ownerWork(actor, async db => {
        const program = await db.program.findFirst({ where: { id: id(programId), status: "PUBLISHED", organization: { ...publicOrganization, OR: [{ offersTraining: true }, { type: "SCHOOL" }] } }, select: programSelect });
        if (!program) throw unavailable();
        const cycles = await db.admissionCycle.findMany({ where: { programId: program.id, status: { in: ["UPCOMING", "OPEN"] }, deadline: { gt: now() } }, select: cycleSelect, orderBy: [{ opensAt: "asc" }, { id: "asc" }], take: 50 });
        return { program, cycles };
      });
    },
    async programs(actor, organizationId, query) {
      const q = input.parse(input.listInput, query);
      return organizationWork(actor, organizationId, MANAGE, (db, orgId) => page(db, "program", { organizationId: orgId }, q.cursor, programSelect));
    },
    async createProgram(actor, organizationId, body) {
      const { requestKey, ...data } = input.parse(input.createProgramInput, body);
      const inputHash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
      return organizationWork(actor, organizationId, MANAGE, async (db, orgId) => {
        const prior = await db.program.findUnique({ where: { organizationId_authorId_requestKey: { organizationId: orgId, authorId: actor.accountId, requestKey } }, select: { ...programSelect, inputHash: true } });
        if (prior) { if (prior.inputHash !== inputHash) throw conflict(); const { inputHash: ignored, ...result } = prior; void ignored; return result; }
        const row = await db.program.create({ data: { ...data, organizationId: orgId, authorId: actor.accountId, requestKey, inputHash }, select: programSelect });
        await audit(db, actor, orgId, "PROGRAM_CREATED", row.id); return row;
      });
    },
    async editProgram(actor, organizationId, programId, body) {
      const { expectedVersion, ...data } = input.parse(input.editProgramInput, body);
      return organizationWork(actor, organizationId, MANAGE, async (db, orgId) => {
        const row = await db.program.findFirst({ where: { id: id(programId), organizationId: orgId } });
        if (!row) throw unavailable(); if (row.version !== expectedVersion) throw conflict();
        if (row.status !== "DRAFT") throw fail(409, "Only draft programs can be edited. Published program details are preserved for applicants.");
        const result = await db.program.update({ where: { id: row.id }, data: { ...data, version: { increment: 1 } }, select: programSelect });
        await audit(db, actor, orgId, "PROGRAM_EDITED", row.id); return result;
      });
    },
    async programStatus(actor, organizationId, programId, body) {
      const data = input.parse(input.programStatusInput, body);
      return organizationWork(actor, organizationId, MANAGE, async (db, orgId) => {
        const row = await db.program.findFirst({ where: { id: id(programId), organizationId: orgId } });
        if (!row) throw unavailable(); if (row.version !== data.expectedVersion) throw conflict();
        if (!(row.status === "DRAFT" && data.status === "PUBLISHED" || ["DRAFT", "PUBLISHED"].includes(row.status) && data.status === "ARCHIVED")) throw fail(409, "This program cannot move to that status.");
        const result = await db.program.update({ where: { id: row.id }, data: { status: data.status, version: { increment: 1 } }, select: programSelect });
        await audit(db, actor, orgId, "PROGRAM_" + data.status, row.id); return result;
      });
    },
    async detail(actor, cycleId) {
      return ownerWork(actor, async db => {
        const row = await cycle(db, id(cycleId));
        const application = await db.admissionApplication.findUnique({ where: { cycleId_applicantId: { cycleId: row.id, applicantId: actor.accountId } }, select: { id: true, status: true, version: true } });
        return { cycle: row, application };
      });
    },
    async list(actor, organizationId, query) {
      const q = input.parse(input.listInput, query);
      return organizationWork(actor, organizationId, MANAGE, (db, orgId) => page(db, "admissionCycle", { organizationId: orgId }, q.cursor, cycleSelect));
    },
    async create(actor, organizationId, body) {
      const { requestKey, ...data } = input.parse(input.createInput, body);
      const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
      return organizationWork(actor, organizationId, MANAGE, async (db, orgId) => {
        const prior = await db.admissionCycle.findUnique({ where: { organizationId_authorId_requestKey: { organizationId: orgId, authorId: actor.accountId, requestKey } } });
        if (prior) { if (prior.inputHash !== hash) throw conflict(); return cycle(db, prior.id, orgId); }
        if (Date.parse(data.deadline) <= +now() || Date.parse(data.opensAt) >= Date.parse(data.deadline)) throw fail(400, "Choose an opening date before a future deadline.");
        const program = await db.program.findFirst({ where: { id: data.programId, organizationId: orgId, status: "PUBLISHED" } });
        if (!program) throw fail(404, "Choose a published program from this organization.");
        const row = await db.admissionCycle.create({ data: { ...data, deadline: new Date(data.deadline), opensAt: new Date(data.opensAt), organizationId: orgId, authorId: actor.accountId, requestKey, inputHash: hash }, select: cycleSelect });
        await audit(db, actor, orgId, "ADMISSION_CYCLE_CREATED", row.id);
        return row;
      });
    },
    async edit(actor, organizationId, cycleId, body) {
      const { expectedVersion, ...data } = input.parse(input.editInput, body);
      return organizationWork(actor, organizationId, MANAGE, async (db, orgId) => {
        await lockAdmissionCycle(db, id(cycleId));
        const row = await cycle(db, cycleId, orgId);
        if (row.version !== expectedVersion) throw conflict();
        if (!["DRAFT", "UPCOMING"].includes(row.status) || row.publishedAt && row.opensAt <= now()) throw fail(409, "Only draft or future cycles can be edited.");
        if (row.publishedAt && (!isDeepStrictEqual(row.questions, data.questions) || row.programId !== data.programId))
          throw fail(409, "The program and application questions are locked after first publication.");
        if (Date.parse(data.deadline) <= +now() || Date.parse(data.opensAt) >= Date.parse(data.deadline)) throw fail(400, "Choose an opening date before a future deadline.");
        const program = await db.program.findFirst({ where: { id: data.programId, organizationId: orgId, status: "PUBLISHED" } });
        if (!program) throw fail(404, "Choose a published program from this organization.");
        await db.admissionCycle.update({ where: { id: row.id }, data: { ...data, deadline: new Date(data.deadline), opensAt: new Date(data.opensAt), version: { increment: 1 } } });
        await audit(db, actor, orgId, "ADMISSION_CYCLE_EDITED", row.id);
        return cycle(db, row.id, orgId);
      });
    },
    async setStatus(actor, organizationId, cycleId, body) {
      const data = input.parse(input.statusInput, body);
      return organizationWork(actor, organizationId, MANAGE, async (db, orgId) => {
        await lockAdmissionCycle(db, id(cycleId));
        const row = await cycle(db, cycleId, orgId);
        if (row.version !== data.expectedVersion) throw conflict();
        if (!input.cycleTransitions[row.status].includes(data.status)) throw fail(409, "This cycle cannot move to that status.");
        if (["UPCOMING", "OPEN"].includes(data.status) && row.deadline <= now()) throw fail(409, "Set a future deadline before publishing.");
        if (["UPCOMING", "OPEN"].includes(data.status) && row.program.status !== "PUBLISHED") throw fail(409, "Publish the program before opening a cycle.");
        if (data.status === "OPEN" && row.opensAt > now()) throw fail(409, "This cycle has not opened yet. Publish it as upcoming.");
        await db.admissionCycle.update({ where: { id: row.id }, data: { status: data.status, version: { increment: 1 }, ...(["UPCOMING", "OPEN"].includes(data.status) && !row.publishedAt ? { publishedAt: now() } : {}) } });
        await audit(db, actor, orgId, "ADMISSION_CYCLE_" + data.status, row.id);
        return cycle(db, row.id, orgId);
      });
    },
    async saveApplication(actor, cycleId, body) {
      const data = input.parse(input.applicationInput, body), oppId = id(cycleId);
      return ownerWork(actor, async db => {
        const target = await db.admissionCycle.findUnique({ where: { id: oppId }, select: { organizationId: true } });
        if (!target) throw unavailable();
        await lockOrganization(db, target.organizationId);
        await lockAdmissionCycle(db, oppId);
        const row = await openAdmissionCycle(db, oppId);
        if (row.version !== data.expectedCycleVersion) throw conflict();
        const previous = await db.admissionApplication.findUnique({ where: { cycleId_applicantId: { cycleId: oppId, applicantId: actor.accountId } }, include: { files: true } });
        if ((previous?.version || 0) !== data.expectedVersion || (previous && previous.status !== "DRAFT")) throw conflict();
        input.validateAnswers(row.questions, data.answers, previous?.files || [], data.action === "SUBMIT");
        const submit = data.action === "SUBMIT";
        if (submit && !data.shareProfile) throw fail(400, "Confirm sharing your application and professional profile with this organization.");
        const snapshot = submit ? await profileSnapshot(db, actor) : null;
        const saved = { answers: data.answers, ...(submit ? { status: "SUBMITTED", submittedAt: now(), profileSnapshot: snapshot,
          cycleSnapshot: { title: row.title, program: JSON.parse(JSON.stringify(row.program)), organization: row.organization.name, questions: row.questions, description: row.program.description, location: row.program.location, studyMode: row.program.studyMode, version: row.version, opensAt: row.opensAt.toISOString(), deadline: row.deadline.toISOString() } } : {}) };
        const app = previous ? await db.admissionApplication.update({ where: { id: previous.id }, data: { ...saved, version: { increment: 1 } } })
          : await db.admissionApplication.create({ data: { cycleId: oppId, applicantId: actor.accountId, ...saved } });
        if (submit) await event(db, actor, { ...app, status: previous?.status || "DRAFT" }, "SUBMITTED");
        return ownedApplication(db, actor, app.id);
      });
    },
    async myApplications(actor, query) {
      const q = input.parse(input.listInput, query);
      return ownerWork(actor, db => page(db, "admissionApplication", { applicantId: actor.accountId }, q.cursor, applicationSelect));
    },
    async application(actor, applicationId) { return ownerWork(actor, db => ownedApplication(db, actor, id(applicationId))); },
    async withdraw(actor, applicationId, body) {
      const data = input.parse(input.withdrawInput, body);
      return ownerWork(actor, async db => {
        const app = await lockApplicationAdmissionCycle(db, actor, id(applicationId));
        if (app.version !== data.expectedVersion) throw conflict();
        if (app.status === "WITHDRAWN") throw fail(409, "This application was already withdrawn.");
        await db.admissionApplication.update({ where: { id: app.id }, data: { status: "WITHDRAWN", withdrawnAt: now(), version: { increment: 1 } } });
        await event(db, actor, app, "WITHDRAWN");
        return ownedApplication(db, actor, app.id);
      });
    },
    async reviewList(actor, organizationId, query) {
      const q = input.parse(input.reviewListInput, query);
      return organizationWork(actor, organizationId, REVIEW, (db, orgId) => page(db, "admissionApplication", { submittedAt: { not: null }, cycle: { organizationId: orgId }, ...(q.cycleId ? { cycleId: q.cycleId } : {}), ...(q.status ? { status: q.status } : {}) }, q.cursor, applicationSelect));
    },
    async reviewDetail(actor, organizationId, applicationId) {
      return organizationWork(actor, organizationId, REVIEW, async (db, orgId) => {
        const { applicantId, ...app } = await reviewedApplication(db, orgId, id(applicationId));
        return { ...app, canReview: applicantId !== actor.accountId };
      });
    },
    async decide(actor, organizationId, applicationId, body) {
      const data = input.parse(input.decisionInput, body);
      return organizationWork(actor, organizationId, REVIEW, async (db, orgId) => {
        const app = await reviewedApplication(db, orgId, id(applicationId));
        await lockAdmissionCycle(db, app.cycleId);
        // The organization row serializes both applicant and reviewer writes.
        const current = await reviewedApplication(db, orgId, app.id);
        if (current.applicantId === actor.accountId) throw fail(403, "You cannot review your own application.");
        if (current.version !== data.expectedVersion) throw conflict();
        if (!input.applicationTransitions[current.status].includes(data.status)) throw fail(409, "This application cannot move to that status.");
        if (current.cycle.status === "CANCELLED") throw fail(409, "This cycle is no longer available for review.");
        await db.admissionApplication.update({ where: { id: app.id }, data: { status: data.status, feedback: data.feedback, version: { increment: 1 } } });
        await event(db, actor, current, data.status, data.feedback);
        await audit(db, actor, orgId, "APPLICATION_STATUS_CHANGED", app.id, { fromStatus: current.status, toStatus: data.status });
        const { applicantId, ...result } = await reviewedApplication(db, orgId, app.id);
        void applicantId;
        return { ...result, canReview: true };
      });
    },
    async upload(actor, applicationId, query, bytes, contentType) {
      const data = input.parse(input.uploadInput, query), appId = id(applicationId);
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 5 * 1024 * 1024) throw fail(413, "Choose a PDF or image up to 5 MiB.");
      // Persist an attempt budget before processing; failed uploads consume budget.
      await ownerWork(actor, async db => {
        const app = await ownedApplication(db, actor, appId);
        if (app.status !== "DRAFT" || app.version !== data.expectedVersion) throw conflict();
        const today = day(now());
        const budget = await db.admissionUploadBudget.upsert({ where: { accountId_day: { accountId: actor.accountId, day: today } }, create: { accountId: actor.accountId, day: today, attempts: 1 }, update: { attempts: { increment: 1 } } });
        if (budget.attempts > 30) throw fail(429, "Your daily application upload limit has been reached.");
      });
      storage.check();
      const processed = await processFile(bytes, contentType), key = `applications/${randomUUID()}`;
      await storage.put(key, processed.bytes, processed.contentType);
      let replaced;
      try {
        const result = await ownerWork(actor, async db => {
          const app = await lockApplicationAdmissionCycle(db, actor, appId);
          const opp = await openAdmissionCycle(db, app.cycleId);
          if (app.status !== "DRAFT" || app.version !== data.expectedVersion) throw conflict();
          if (!opp.questions.some(q => q.id === data.questionId && q.type === "FILE_UPLOAD")) throw fail(400, "Choose a file question from this application.");
          const prior = await db.admissionApplicationFile.findUnique({ where: { applicationId_questionId: { applicationId: appId, questionId: data.questionId } } });
          replaced = prior?.storageKey;
          await db.admissionApplicationFile.upsert({ where: { applicationId_questionId: { applicationId: appId, questionId: data.questionId } }, create: { applicationId: appId, questionId: data.questionId, storageKey: key, contentType: processed.contentType, size: processed.bytes.length }, update: { storageKey: key, contentType: processed.contentType, size: processed.bytes.length } });
          await db.admissionApplication.update({ where: { id: appId }, data: { version: { increment: 1 } } });
          return ownedApplication(db, actor, appId);
        });
        if (replaced) await storage.delete(replaced).catch(() => {});
        return result;
      } catch (error) { await storage.delete(key).catch(() => {}); throw error; }
    },
    async readFile(actor, applicationId, fileId, organizationId) {
      const read = async db => {
        const app = organizationId ? await reviewedApplication(db, organizationId, id(applicationId)) : await ownedApplication(db, actor, id(applicationId));
        const file = await db.admissionApplicationFile.findFirst({ where: { id: id(fileId), applicationId: app.id } });
        if (!file) throw unavailable();
        return { storageKey: file.storageKey, contentType: file.contentType };
      };
      const authorizeFile = () => organizationId ? organizationWork(actor, organizationId, REVIEW, read) : ownerWork(actor, read);
      const file = await authorizeFile();
      // Do not hold database locks while fetching from object storage. Recheck
      // ownership, current staff access and file identity before releasing bytes.
      const bytes = await storage.get(file.storageKey, { maxBytes: 5 * 1024 * 1024 });
      const current = await authorizeFile();
      if (current.storageKey !== file.storageKey) throw conflict();
      return { bytes, contentType: file.contentType };
    },
  };
}
