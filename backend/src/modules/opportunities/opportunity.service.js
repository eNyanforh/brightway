import { isDeepStrictEqual } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { assertNetworkSession, lockNetworkAccounts } from "../network/network-authority.js";
import { assertMfaSession } from "../auth/mfa.service.js";
import { requireOrganizationProfile } from "../organizations/organization-profile.schema.js";
import { ownerProfileSelect, profileView } from "../profile/profile.service.js";
import { verifiedCredentials } from "../notifications/notifications.service.js";
import { processEvidence } from "../credentials/evidence.process.js";
import { fail } from "../network/network.schema.js";
import * as input from "./opportunity.schema.js";
import { processPhoto, processCoverPhoto } from "../photos/photo.image.js";
import { challengePrizeValue } from "../../../../shared/challenges.mjs";

const MANAGE = "organization.opportunities.manage", REVIEW = "organization.applications.review";
const publicOrganization = { status: "ACTIVE", request: { status: "APPROVED" }, profileReadyAt: { not: null }, profilePhotoId: { not: null }, username: { not: null }, profileSetupStep: 5 };
const organizationSelect = { id: true, name: true, username: true, profilePhotoId: true, verifiedAt: true };
const collaboratorSelect = { organizationId: true, state: true, organization: { select: organizationSelect } };
const opportunitySelect = { id: true, type: true, title: true, description: true, location: true, workMode: true, prize: true, prizes: true, sponsorLogoIds: true, backgroundAssetId: true, titleAssetId: true, coverAssetId: true, maxApplicants: true, topics: true, coverImage: true, deadline: true, questions: true, version: true, status: true, publishedAt: true, createdAt: true, organizationId: true, organization: { select: organizationSelect },
  collaborators: { where: { state: "ACCEPTED", organization: publicOrganization }, select: collaboratorSelect } };
const managedOpportunitySelect = { ...opportunitySelect, collaborators: { select: collaboratorSelect } };
const fileSelect = { id: true, questionId: true, contentType: true, size: true, createdAt: true };
const applicationSelect = { id: true, status: true, version: true, answers: true, profileSnapshot: true, opportunitySnapshot: true, feedback: true, submittedAt: true, withdrawnAt: true, publicParticipant: true, createdAt: true, opportunityId: true,
  opportunity: { select: opportunitySelect }, files: { select: fileSelect }, events: { select: { id: true, fromStatus: true, toStatus: true, feedback: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } };
const conflict = () => fail(409, "This opportunity or application changed. Reload the saved version before continuing.");
const unavailable = () => fail(404, "This opportunity or application is unavailable.");
const id = value => input.parse(input.identifier, value);
const day = now => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export function createOpportunityService({ prisma, storage, imageStorage = null, now = () => new Date(), processFile = processEvidence, processImage = processPhoto, processBackground = processCoverPhoto }) {
  async function transaction(work) {
    try { return await prisma.$transaction(work, { timeout: 15000 }); }
    catch (error) { if (["P2002", "P2034"].includes(error.code)) throw conflict(); throw error; }
  }
  async function lockOrganization(db, organizationId) {
    await db.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`;
  }
  async function lockOpportunity(db, opportunityId) {
    await db.$queryRaw`SELECT "id" FROM "Opportunity" WHERE "id" = ${opportunityId} FOR UPDATE`;
  }
  async function authorize(db, actor, organizationId, permission) {
    await assertNetworkSession(db, actor, now);
    const org = await db.organization.findFirst({ where: { id: organizationId, ...publicOrganization } });
    if (!org) throw unavailable();
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
  async function opportunity(db, opportunityId, organizationId) {
    const row = await db.opportunity.findFirst({ where: { id: opportunityId, ...(organizationId ? { organizationId } : { status: { notIn: ["DRAFT", "REMOVED"] }, organization: publicOrganization }) }, select: organizationId ? managedOpportunitySelect : opportunitySelect });
    if (!row) throw unavailable();
    return row;
  }
  async function openOpportunity(db, opportunityId) {
    const row = await opportunity(db, opportunityId);
    if (row.status !== "PUBLISHED" || row.deadline <= now()) throw fail(409, "This opportunity is no longer accepting applications.");
    return row;
  }
  async function ownedApplication(db, actor, applicationId) {
    const row = await db.opportunityApplication.findFirst({ where: { id: applicationId, applicantId: actor.accountId }, select: applicationSelect });
    if (!row) throw unavailable();
    return row;
  }
  async function event(db, actor, app, status, feedback = "") {
    await db.opportunityApplicationEvent.create({ data: { applicationId: app.id, actorId: actor.accountId, fromStatus: app.status, toStatus: status, feedback } });
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
  // Return only applicants who opted in to public Challenge participation.
  // Consent to share an application with an organization never grants this access.
  // Blocked, suspended, unverified and withdrawn applicants are never exposed.
  async function challengeParticipantSummaries(db, viewer, opportunities) {
    const challengeIds = [...new Set(opportunities.filter(row => row.type === "CHALLENGE").map(row => row.id))];
    if (!challengeIds.length) return new Map();
    const blocked = [{ leftBlocked: true }, { rightBlocked: true }];
    const eligibleApplicant = {
      status: "ACTIVE",
      manualIdentityRequest: { state: "APPROVED" },
      networkLeft: { none: { rightAccountId: viewer.accountId, OR: blocked } },
      networkRight: { none: { leftAccountId: viewer.accountId, OR: blocked } },
    };
    const where = {
      opportunityId: { in: challengeIds },
      publicParticipant: true,
      submittedAt: { not: null },
      status: { in: ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "SELECTED"] },
      applicant: eligibleApplicant,
    };
    const [counts, ...previews] = await Promise.all([
      db.opportunityApplication.groupBy({
        by: ["opportunityId"], where, _count: { _all: true },
      }),
      ...challengeIds.map(opportunityId => db.opportunityApplication.findMany({
        where: { ...where, opportunityId },
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        take: 3,
        select: {
          applicant: { select: {
            username: true,
            person: { select: {
              firstName: true, middleName: true, lastName: true,
              profile: { select: { photoId: true } },
            } },
          } },
        },
      })),
    ]);
    const totals = new Map(counts.map(row => [row.opportunityId, row._count._all]));
    return new Map(challengeIds.map((opportunityId, index) => [
      opportunityId,
      {
        count: totals.get(opportunityId) ?? 0,
        members: previews[index].map(({ applicant }) => ({
          username: applicant.username,
          name: [applicant.person.firstName, applicant.person.middleName, applicant.person.lastName].filter(Boolean).join(" "),
          photoId: applicant.person.profile?.photoId ?? null,
          verified: true,
        })),
      },
    ]));
  }

  // All Challenges accept applications natively on BrightWay. The stored
  // legacy work-mode/location fields cannot redirect someone to an external site.
  function prepareOpportunity(data) {
    if (data.type !== "CHALLENGE") return {
      ...data, prizes: [], sponsorLogoIds: [], backgroundAssetId: null,
      titleAssetId: null, coverAssetId: null, collaboratorIds: [], maxApplicants: null,
    };
    const displayPrize = data.prizes.length
      ? data.prizes.map(challengePrizeValue).join(" · ").slice(0, 120)
      : data.prize;
    return { ...data, location: "BrightWay", workMode: "REMOTE", prize: displayPrize };
  }
  function selectedAssets(data) {
    if (data.type !== "CHALLENGE") return [];
    return [
      ...data.sponsorLogoIds.map(assetId => ({ assetId, kind: "SPONSOR_LOGO" })),
      ...(data.backgroundAssetId ? [{ assetId: data.backgroundAssetId, kind: "BACKGROUND" }] : []),
      ...(data.titleAssetId ? [{ assetId: data.titleAssetId, kind: "TITLE_IMAGE" }] : []),
      ...(data.coverAssetId ? [{ assetId: data.coverAssetId, kind: "COVER" }] : []),
    ];
  }
  async function bindChallengeAssets(db, actor, orgId, oppId, data) {
    const requests = selectedAssets(data);
    if (!requests.length) return;
    const ids = requests.map(row => row.assetId);
    if (new Set(ids).size !== ids.length) throw fail(400, "A Challenge image cannot fill multiple roles.");
    const rows = await db.opportunityAsset.findMany({
      where: { id: { in: ids }, organizationId: orgId,
        OR: [{ opportunityId: oppId }, { opportunityId: null, uploaderId: actor.accountId,
          createdAt: { gte: new Date(+now() - 86400000) } }] },
      select: { id: true, kind: true, opportunityId: true },
    });
    if (rows.length !== ids.length || rows.some(row =>
      requests.find(request => request.assetId === row.id)?.kind !== row.kind)) {
      throw fail(400, "Upload valid Challenge images for this organization before saving.");
    }
    const pending = rows.filter(row => !row.opportunityId).map(row => row.id);
    if (pending.length) {
      const result = await db.opportunityAsset.updateMany({
        where: { id: { in: pending }, organizationId: orgId, uploaderId: actor.accountId,
          opportunityId: null },
        data: { opportunityId: oppId },
      });
      if (result.count !== pending.length) throw conflict();
    }
  }
  async function syncCollaborators(db, ownerOrganizationId, opportunityId, collaboratorIds) {
    if (collaboratorIds.includes(ownerOrganizationId))
      throw fail(400, "The publishing organization is already a host.");
    if (collaboratorIds.length) {
      const matches = await db.organization.findMany({
        where: { id: { in: collaboratorIds }, ...publicOrganization },
        select: { id: true },
      });
      if (matches.length !== collaboratorIds.length)
        throw fail(400, "Choose active, verified BrightWay organizations as collaborators.");
    }
    await db.opportunityCollaborator.deleteMany({
      where: { opportunityId, organizationId: { notIn: collaboratorIds } },
    });
    const existing = await db.opportunityCollaborator.findMany({
      where: { opportunityId }, select: { organizationId: true },
    });
    const present = new Set(existing.map(item => item.organizationId));
    const pending = collaboratorIds.filter(organizationId => !present.has(organizationId));
    if (pending.length) await db.opportunityCollaborator.createMany({
      data: pending.map(organizationId => ({
        id: randomUUID(), opportunityId, organizationId, state: "PENDING", invitedAt: now(),
      })),
    });
  }
  async function authorizedChallengeAsset(actor, assetId) {
    const asset = await prisma.opportunityAsset.findUnique({
      where: { id: id(assetId) },
      include: { opportunity: { select: {
        id: true, status: true, backgroundAssetId: true, titleAssetId: true, coverAssetId: true,
        sponsorLogoIds: true, organization: { select: {
          status: true, profileReadyAt: true, profilePhotoId: true, username: true,
          profileSetupStep: true, request: { select: { status: true } },
        } },
      } } },
    });
    if (!asset) throw unavailable();
    const row = asset.opportunity;
    const publicImage = row?.status === "PUBLISHED" &&
      (row.coverAssetId === asset.id || row.backgroundAssetId === asset.id || row.titleAssetId === asset.id ||
        row.sponsorLogoIds.includes(asset.id)) &&
      row.organization?.status === "ACTIVE" &&
      row.organization?.request?.status === "APPROVED" &&
      row.organization?.profileReadyAt &&
      row.organization?.profilePhotoId && row.organization?.username &&
      row.organization?.profileSetupStep === 5;
    if (publicImage) await assertNetworkSession(prisma, actor, now);
    else await organizationWork(actor, asset.organizationId, MANAGE, async db => {
      const valid = await db.opportunityAsset.findFirst({ where: {
        id: asset.id, organizationId: asset.organizationId,
        ...(asset.opportunityId ? { opportunityId: asset.opportunityId }
          : { uploaderId: actor.accountId, opportunityId: null }),
      }, select: { id: true } });
      if (!valid) throw unavailable();
    });
    return asset;
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
  async function lockApplicationOpportunity(db, actor, applicationId) {
    const app = await ownedApplication(db, actor, applicationId);
    await lockOrganization(db, app.opportunity.organizationId);
    await lockOpportunity(db, app.opportunityId);
    return ownedApplication(db, actor, applicationId);
  }
  async function reviewedApplication(db, organizationId, applicationId) {
    const app = await db.opportunityApplication.findFirst({ where: { id: applicationId, submittedAt: { not: null }, opportunity: { organizationId } }, select: { ...applicationSelect, applicantId: true } });
    if (!app) throw unavailable();
    return app;
  }
  return {
    async searchCollaborators(actor, organizationId, query) {
      const { q } = input.parse(input.collaboratorSearchInput, query);
      return organizationWork(actor, organizationId, MANAGE, async (db, ownId) => {
        const term = q.replace(/^@/u, "").trim();
        if (term.length < 2) throw fail(400, "Enter at least two letters of an organization name or username.");
        const rows = await db.organization.findMany({
          where: { id: { not: ownId }, ...publicOrganization,
            OR: [{ name: { contains: term, mode: "insensitive" } },
              { username: { contains: term, mode: "insensitive" } }] },
          select: organizationSelect, orderBy: [{ name: "asc" }, { id: "asc" }], take: 10,
        });
        return { items: rows };
      });
    },
    async collaborationInvitations(actor, organizationId) {
      return organizationWork(actor, organizationId, MANAGE, async (db, orgId) => ({
        items: await db.opportunityCollaborator.findMany({
          where: { organizationId: orgId, state: { in: ["PENDING", "ACCEPTED"] },
            opportunity: { type: "CHALLENGE", status: { notIn: ["CANCELLED", "REMOVED"] } } },
          orderBy: [{ invitedAt: "desc" }, { id: "desc" }], take: 40,
          select: { opportunityId: true, state: true, invitedAt: true,
            opportunity: { select: { id: true, title: true, status: true,
              organization: { select: organizationSelect } } } },
        }),
      }));
    },
    async respondCollaboration(actor, organizationId, opportunityId, body) {
      const { decision } = input.parse(input.collaboratorResponseInput, body);
      return organizationWork(actor, organizationId, MANAGE, async (db, orgId) => {
        const oppId = id(opportunityId);
        await lockOpportunity(db, oppId);
        const invitation = await db.opportunityCollaborator.findUnique({
          where: { opportunityId_organizationId: { opportunityId: oppId, organizationId: orgId } },
          select: { id: true, state: true, opportunity: { select: { type: true, status: true } } },
        });
        if (!invitation || invitation.opportunity.type !== "CHALLENGE" ||
            ["CANCELLED", "REMOVED"].includes(invitation.opportunity.status)) throw unavailable();
        if (invitation.state !== "PENDING") throw conflict();
        await db.opportunityCollaborator.update({
          where: { id: invitation.id }, data: { state: decision, respondedAt: now() },
        });
        await audit(db, actor, orgId, "CHALLENGE_COLLABORATION_" + decision, invitation.id);
        return { opportunityId: oppId, state: decision };
      });
    },
    async uploadChallengeAsset(actor, organizationId, query, bytes, contentType) {
      const { kind } = input.parse(input.challengeAssetUploadInput, query);
      if (!["image/png", "image/jpeg", "image/webp"].includes(contentType))
        throw fail(415, "Choose a JPEG, PNG or WebP image.");
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 5 * 1024 * 1024)
        throw fail(413, "Choose an image up to 5 MiB.");
      if (!imageStorage) throw fail(503, "Challenge image storage is unavailable.");
      const orgId = id(organizationId);
      await organizationWork(actor, orgId, MANAGE, async db => {
        const since = new Date(+now() - 86400000);
        const uploads = await db.opportunityAsset.count({ where: { organizationId: orgId,
          uploaderId: actor.accountId, createdAt: { gte: since } } });
        if (uploads >= 30) throw fail(429, "Your daily Challenge image upload limit has been reached.");
      });
      imageStorage.check();
      const image = ["BACKGROUND", "COVER"].includes(kind)
        ? await processBackground(bytes, contentType)
        : await processImage(bytes, contentType);
      const key = `challenges/${orgId}/${randomUUID()}`;
      await imageStorage.put(key, image.bytes, "image/webp");
      try {
        return await organizationWork(actor, orgId, MANAGE, async db => {
          return db.opportunityAsset.create({
            data: { organizationId: orgId, uploaderId: actor.accountId,
              kind, storageKey: key, size: image.bytes.length, createdAt: now() },
            select: { id: true, kind: true, size: true },
          });
        });
      } catch (error) {
        await imageStorage.delete(key).catch(() => {});
        throw error;
      }
    },
    async readChallengeAsset(actor, assetId) {
      if (!imageStorage) throw fail(503, "Challenge image storage is unavailable.");
      const asset = await authorizedChallengeAsset(actor, assetId);
      const bytes = await imageStorage.get(asset.storageKey, { maxBytes: 3 * 1024 * 1024 });
      const latest = await authorizedChallengeAsset(actor, assetId);
      if (latest.storageKey !== asset.storageKey ||
          latest.opportunityId !== asset.opportunityId) throw conflict();
      return { bytes, contentType: "image/webp" };
    },
    async browse(actor, query) {
      const q = input.parse(input.browseInput, query);
      await assertNetworkSession(prisma, actor, now);
      // Rank exact titles first, then prefixes, then other text matches. Every
      // cursor is looked up inside this same authorized query and filter scope.
      const term = q.q.replace(/[\\%_]/g, "\\$&"), pattern = `%${term}%`, prefix = `${term}%`;
      const rows = await prisma.$queryRaw(Prisma.sql`
        WITH candidates AS (
          SELECT o."id", o."createdAt", CASE WHEN lower(o."title") = lower(${q.q}) THEN 3
            WHEN o."title" ILIKE ${prefix} THEN 2 ELSE 1 END AS rank
          FROM "Opportunity" o JOIN "Organization" org ON org."id" = o."organizationId"
          JOIN "OrganizationRequest" r ON r."id" = org."requestId"
          WHERE o."status" = 'PUBLISHED' AND o."deadline" > ${now()}
            AND org."status" = 'ACTIVE' AND r."status" = 'APPROVED' AND org."profileReadyAt" IS NOT NULL
            AND org."profilePhotoId" IS NOT NULL AND org."username" IS NOT NULL AND org."profileSetupStep" = 5
            ${q.type ? Prisma.sql`AND o."type"::text = ${q.type}` : Prisma.empty}
            ${q.q ? Prisma.sql`AND (o."title" ILIKE ${pattern} OR o."description" ILIKE ${pattern} OR o."location" ILIKE ${pattern} OR org."name" ILIKE ${pattern})` : Prisma.empty}
            ${q.following ? Prisma.sql`AND EXISTS (SELECT 1 FROM "NetworkFollow" f WHERE f."followerId" = ${actor.accountId} AND f."targetOrganizationId" = org."id" AND f."active" = true)` : Prisma.empty}
            ${q.saved ? Prisma.sql`AND EXISTS (SELECT 1 FROM "OpportunitySave" s WHERE s."accountId" = ${actor.accountId} AND s."opportunityId" = o."id")` : Prisma.empty}
        ) SELECT c.* FROM candidates c
        ${q.cursor ? Prisma.sql`WHERE EXISTS (SELECT 1 FROM candidates a WHERE a."id" = ${q.cursor}
          AND (c.rank, c."createdAt", c."id") < (a.rank, a."createdAt", a."id"))` : Prisma.empty}
        ORDER BY c.rank DESC, c."createdAt" DESC, c."id" DESC LIMIT 21`);
      const selected = await prisma.opportunity.findMany({ where: { id: { in: rows.slice(0, 20).map(r => r.id) }, status: "PUBLISHED", deadline: { gt: now() }, organization: publicOrganization }, select: opportunitySelect });
      const byId = new Map(selected.map(r => [r.id, r]));
      const saves = selected.length ? await prisma.opportunitySave.findMany({
        where: { accountId: actor.accountId, opportunityId: { in: selected.map(row => row.id) } },
        select: { opportunityId: true },
      }) : [];
      const savedIds = new Set(saves.map(row => row.opportunityId));
      const participantSummaries = await challengeParticipantSummaries(prisma, actor, selected);
      await assertNetworkSession(prisma, actor, now);
      return { items: rows.slice(0, 20).map(r => byId.get(r.id)).filter(Boolean)
        .map(row => ({ ...row, saved: savedIds.has(row.id),
          ...(row.type === "CHALLENGE" ? { participantSummary: participantSummaries.get(row.id) ?? { count: 0, members: [] } } : {}),
        })), nextCursor: rows.length > 20 ? rows[19].id : null };
    },
    async detail(actor, opportunityId) {
      return ownerWork(actor, async db => {
        const row = await opportunity(db, id(opportunityId));
        const application = await db.opportunityApplication.findUnique({ where: { opportunityId_applicantId: { opportunityId: row.id, applicantId: actor.accountId } }, select: { id: true, status: true, version: true } });
        const saved = await db.opportunitySave.findUnique({ where: { accountId_opportunityId: { accountId: actor.accountId, opportunityId: row.id } }, select: { accountId: true } });
        const participants = await challengeParticipantSummaries(db, actor, [row]);
        return { opportunity: { ...row, saved: Boolean(saved),
          ...(row.type === "CHALLENGE" ? { participantSummary: participants.get(row.id) ?? { count: 0, members: [] } } : {}),
        }, application };
      });
    },
    async saveOpportunity(actor, opportunityId, body) {
      const { saved } = input.parse(input.saveInput, body), oppId = id(opportunityId);
      return ownerWork(actor, async db => {
        const row = await db.opportunity.findFirst({
          where: { id: oppId, type: "CHALLENGE", status: "PUBLISHED", organization: publicOrganization },
          select: { id: true },
        });
        if (!row) throw unavailable();
        const key = { accountId: actor.accountId, opportunityId: oppId };
        if (saved) {
          await db.opportunitySave.upsert({
            where: { accountId_opportunityId: key },
            create: key,
            update: {},
          });
        } else {
          await db.opportunitySave.deleteMany({ where: key });
        }
        return { saved };
      });
    },
    async list(actor, organizationId, query) {
      const q = input.parse(input.listInput, query);
      return organizationWork(actor, organizationId, MANAGE, (db, orgId) => page(db, "opportunity", { organizationId: orgId }, q.cursor, managedOpportunitySelect));
    },
    async create(actor, organizationId, body) {
      const { requestKey, ...parsed } = input.parse(input.createInput, body);
      const data = prepareOpportunity(parsed);
      const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
      return organizationWork(actor, organizationId, MANAGE, async (db, orgId) => {
        const prior = await db.opportunity.findUnique({ where: { organizationId_authorId_requestKey: { organizationId: orgId, authorId: actor.accountId, requestKey } } });
        if (prior) { if (prior.inputHash !== hash) throw conflict(); return opportunity(db, prior.id, orgId); }
        if (Date.parse(data.deadline) <= +now()) throw fail(400, "Choose a future application deadline.");
        const { collaboratorIds, ...persisted } = data;
        const row = await db.opportunity.create({ data: { ...persisted, deadline: new Date(data.deadline), organizationId: orgId, authorId: actor.accountId, requestKey, inputHash: hash }, select: { id: true } });
        await bindChallengeAssets(db, actor, orgId, row.id, data);
        await syncCollaborators(db, orgId, row.id, collaboratorIds);
        await audit(db, actor, orgId, "OPPORTUNITY_CREATED", row.id);
        return opportunity(db, row.id, orgId);
      });
    },
    async edit(actor, organizationId, opportunityId, body) {
      const { expectedVersion, ...parsed } = input.parse(input.editInput, body);
      const data = prepareOpportunity(parsed);
      return organizationWork(actor, organizationId, MANAGE, async (db, orgId) => {
        await lockOpportunity(db, id(opportunityId));
        const row = await opportunity(db, opportunityId, orgId);
        if (row.version !== expectedVersion) throw conflict();
        if (!["DRAFT", "PAUSED"].includes(row.status)) throw fail(409, "Pause this opportunity before editing it.");
        if (row.publishedAt && (!isDeepStrictEqual(row.questions, data.questions) || row.type !== data.type))
          throw fail(409, "The type and application questions are locked after first publication.");
        if (Date.parse(data.deadline) <= +now()) throw fail(400, "Choose a future application deadline.");
        const { collaboratorIds, ...persisted } = data;
        await bindChallengeAssets(db, actor, orgId, row.id, data);
        await syncCollaborators(db, orgId, row.id, collaboratorIds);
        await db.opportunity.update({ where: { id: row.id }, data: { ...persisted, deadline: new Date(data.deadline), version: { increment: 1 } } });
        await audit(db, actor, orgId, "OPPORTUNITY_EDITED", row.id);
        return opportunity(db, row.id, orgId);
      });
    },
    async setStatus(actor, organizationId, opportunityId, body) {
      const data = input.parse(input.statusInput, body);
      return organizationWork(actor, organizationId, MANAGE, async (db, orgId) => {
        await lockOpportunity(db, id(opportunityId));
        const row = await opportunity(db, opportunityId, orgId);
        if (row.version !== data.expectedVersion) throw conflict();
        if (!input.opportunityTransitions[row.status].includes(data.status)) throw fail(409, "This opportunity cannot move to that status.");
        if (data.status === "PUBLISHED" && row.deadline <= now()) throw fail(409, "Set a future deadline before publishing.");
        await db.opportunity.update({ where: { id: row.id }, data: { status: data.status, version: { increment: 1 }, ...(data.status === "PUBLISHED" && !row.publishedAt ? { publishedAt: now() } : {}) } });
        await audit(db, actor, orgId, "OPPORTUNITY_" + data.status, row.id);
        return opportunity(db, row.id, orgId);
      });
    },
    async saveApplication(actor, opportunityId, body) {
      const data = input.parse(input.applicationInput, body), oppId = id(opportunityId);
      return ownerWork(actor, async db => {
        const target = await db.opportunity.findUnique({ where: { id: oppId }, select: { organizationId: true } });
        if (!target) throw unavailable();
        await lockOrganization(db, target.organizationId);
        await lockOpportunity(db, oppId);
        const row = await openOpportunity(db, oppId);
        if (row.version !== data.expectedOpportunityVersion) throw conflict();
        const previous = await db.opportunityApplication.findUnique({ where: { opportunityId_applicantId: { opportunityId: oppId, applicantId: actor.accountId } }, include: { files: true } });
        if ((previous?.version || 0) !== data.expectedVersion || (previous && previous.status !== "DRAFT")) throw conflict();
        input.validateAnswers(row.questions, data.answers, previous?.files || [], data.action === "SUBMIT");
        const submit = data.action === "SUBMIT";
        if (submit && !data.shareProfile) throw fail(400, "Confirm sharing your application and professional profile with this organization.");
        if (submit && row.type === "CHALLENGE" && row.maxApplicants !== null) {
          const taken = await db.opportunityApplication.count({ where: {
            opportunityId: row.id, submittedAt: { not: null },
            status: { in: ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "SELECTED", "NOT_SELECTED"] },
          } });
          if (taken >= row.maxApplicants) throw fail(409, "This Challenge has reached its application limit.");
        }
        const snapshot = submit ? await profileSnapshot(db, actor) : null;
        const saved = { answers: data.answers,
          ...(submit ? { publicParticipant: row.type === "CHALLENGE" && data.publicParticipant } : {}),
          ...(submit ? { status: "SUBMITTED", submittedAt: now(), profileSnapshot: snapshot,
          opportunitySnapshot: { title: row.title, type: row.type, organization: row.organization.name, questions: row.questions, description: row.description, location: row.location, workMode: row.workMode, prize: row.prize, prizes: row.prizes, maxApplicants: row.maxApplicants, version: row.version, deadline: row.deadline.toISOString() } } : {}) };
        const app = previous ? await db.opportunityApplication.update({ where: { id: previous.id }, data: { ...saved, version: { increment: 1 } } })
          : await db.opportunityApplication.create({ data: { opportunityId: oppId, applicantId: actor.accountId, ...saved } });
        if (submit) await event(db, actor, { ...app, status: previous?.status || "DRAFT" }, "SUBMITTED");
        return ownedApplication(db, actor, app.id);
      });
    },
    async myApplications(actor, query) {
      const q = input.parse(input.listInput, query);
      return ownerWork(actor, db => page(db, "opportunityApplication", { applicantId: actor.accountId }, q.cursor, applicationSelect));
    },
    async application(actor, applicationId) { return ownerWork(actor, db => ownedApplication(db, actor, id(applicationId))); },
    async withdraw(actor, applicationId, body) {
      const data = input.parse(input.withdrawInput, body);
      return ownerWork(actor, async db => {
        const app = await lockApplicationOpportunity(db, actor, id(applicationId));
        if (app.version !== data.expectedVersion) throw conflict();
        if (app.status === "WITHDRAWN") throw fail(409, "This application was already withdrawn.");
        await db.opportunityApplication.update({ where: { id: app.id }, data: { status: "WITHDRAWN", withdrawnAt: now(), version: { increment: 1 } } });
        await event(db, actor, app, "WITHDRAWN");
        return ownedApplication(db, actor, app.id);
      });
    },
    async reviewList(actor, organizationId, query) {
      const q = input.parse(input.reviewListInput, query);
      return organizationWork(actor, organizationId, REVIEW, (db, orgId) => page(db, "opportunityApplication", { submittedAt: { not: null }, opportunity: { organizationId: orgId }, ...(q.opportunityId ? { opportunityId: q.opportunityId } : {}), ...(q.status ? { status: q.status } : {}) }, q.cursor, applicationSelect));
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
        await lockOpportunity(db, app.opportunityId);
        // The organization row serializes both applicant and reviewer writes.
        const current = await reviewedApplication(db, orgId, app.id);
        if (current.applicantId === actor.accountId) throw fail(403, "You cannot review your own application.");
        if (current.version !== data.expectedVersion) throw conflict();
        if (!input.applicationTransitions[current.status].includes(data.status)) throw fail(409, "This application cannot move to that status.");
        if (["CANCELLED", "REMOVED"].includes(current.opportunity.status)) throw fail(409, "This opportunity is no longer available for review.");
        await db.opportunityApplication.update({ where: { id: app.id }, data: { status: data.status, feedback: data.feedback, version: { increment: 1 } } });
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
        const budget = await db.opportunityUploadBudget.upsert({ where: { accountId_day: { accountId: actor.accountId, day: today } }, create: { accountId: actor.accountId, day: today, attempts: 1 }, update: { attempts: { increment: 1 } } });
        if (budget.attempts > 30) throw fail(429, "Your daily application upload limit has been reached.");
      });
      storage.check();
      const processed = await processFile(bytes, contentType), key = `applications/${randomUUID()}`;
      await storage.put(key, processed.bytes, processed.contentType);
      let replaced;
      try {
        const result = await ownerWork(actor, async db => {
          const app = await lockApplicationOpportunity(db, actor, appId);
          const opp = await openOpportunity(db, app.opportunityId);
          if (app.status !== "DRAFT" || app.version !== data.expectedVersion) throw conflict();
          if (!opp.questions.some(q => q.id === data.questionId && q.type === "FILE_UPLOAD")) throw fail(400, "Choose a file question from this application.");
          const prior = await db.opportunityApplicationFile.findUnique({ where: { applicationId_questionId: { applicationId: appId, questionId: data.questionId } } });
          replaced = prior?.storageKey;
          await db.opportunityApplicationFile.upsert({ where: { applicationId_questionId: { applicationId: appId, questionId: data.questionId } }, create: { applicationId: appId, questionId: data.questionId, storageKey: key, contentType: processed.contentType, size: processed.bytes.length }, update: { storageKey: key, contentType: processed.contentType, size: processed.bytes.length } });
          await db.opportunityApplication.update({ where: { id: appId }, data: { version: { increment: 1 } } });
          return ownedApplication(db, actor, appId);
        });
        if (replaced) await storage.delete(replaced).catch(() => {});
        return result;
      } catch (error) { await storage.delete(key).catch(() => {}); throw error; }
    },
    async readFile(actor, applicationId, fileId, organizationId) {
      const read = async db => {
        const app = organizationId ? await reviewedApplication(db, organizationId, id(applicationId)) : await ownedApplication(db, actor, id(applicationId));
        const file = await db.opportunityApplicationFile.findFirst({ where: { id: id(fileId), applicationId: app.id } });
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
