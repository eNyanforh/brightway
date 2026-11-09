import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertNetworkSession, lockNetworkAccounts } from "../network/network-authority.js";
import { fail, parse, usernameSchema } from "../network/network.schema.js";
import { createManualIdentityReviewService } from "../manual-identity/manual-identity-review.service.js";

const cursorSchema = z.strictObject({ owner: z.uuid(), at: z.iso.datetime(), id: z.uuid() });
const notificationIdSchema = z.uuid();
const viewProfileSelect = {
  id: true,
  certifications: true,
  profileCertificationsPublicEnabled: true,
  profileCredentialsPublicEnabled: true,
  profileAchievementsPublicEnabled: true,
  profilePublicEnabled: true,
  profileViewSharingEnabled: true,
  profileViewNotificationsEnabled: true,
  headline: true,
  bio: true,
  countryCode: true,
  region: true,
  locality: true,
  careerFieldMode: true,
  careerField: true,
  careerGoals: true,
  skills: true,
  interests: true,
};

function utcDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function publicProfile(account, profile, sections = {}) {
  return {
    username: account.username,
    fullName: [account.person.firstName, account.person.middleName, account.person.lastName].filter(Boolean).join(" "),
    headline: profile.headline,
    bio: profile.bio,
    location: { countryCode: profile.countryCode, region: profile.region, locality: profile.locality },
    careerField: profile.careerFieldMode === "EXPLORING"
      ? { mode: "EXPLORING" }
      : profile.careerFieldMode === "SPECIFIED" ? { mode: "SPECIFIED", label: profile.careerField } : null,
    careerGoals: profile.careerGoals,
    skills: profile.skills,
    interests: profile.interests,
    ...sections,
  };
}

async function verifiedCredentials(tx, profileId) {
  // Source of truth is the reviewed record AND its matching current revision.
  // Do not return evidence, reviewer notes, personal contact data or review history.
  const [reviews, education, experience] = await Promise.all([
    tx.credentialReview.findMany({
      where: { profileId, status: "VERIFIED" },
      select: { kind: true, recordId: true, revision: true, status: true, issuerName: true },
      take: 60,
    }),
    tx.educationRecord.findMany({
      where: { profileId, status: "VERIFIED" },
      select: { id: true, revision: true, status: true, institution: true,
        qualification: true, startMonth: true, endMonth: true, current: true },
      orderBy: [{ startMonth: "desc" }, { id: "desc" }],
      take: 20,
    }),
    tx.experienceRecord.findMany({
      where: { profileId, status: "VERIFIED" },
      select: { id: true, revision: true, status: true, organization: true, role: true,
        startMonth: true, endMonth: true, current: true },
      orderBy: [{ startMonth: "desc" }, { id: "desc" }],
      take: 20,
    }),
  ]);
  const approved = new Map(reviews.map(review => [review.kind + ":" + review.recordId, review]));
  const project = (record, kind) => {
    const review = approved.get(kind + ":" + record.id);
    if (!review || review.revision !== record.revision ||
        record.status !== "VERIFIED" || review.status !== "VERIFIED") return null;
    return {
      id: record.id,
      kind,
      title: kind === "education" ? record.qualification : record.role,
      organization: kind === "education" ? record.institution : record.organization,
      startMonth: record.startMonth,
      endMonth: record.current ? null : record.endMonth,
      current: record.current,
      verifiedBy: review.issuerName || "BrightWay",
    };
  };
  return [...education.map(row => project(row, "education")),
    ...experience.map(row => project(row, "experience"))]
    .filter(Boolean).slice(0, 20);
}

export function createNotificationsService({ prisma, now = () => new Date() }) {
  const identity = createManualIdentityReviewService({ prisma, now });

  async function actorAccount(db, actor) {
    await assertNetworkSession(db, actor, now);
    const account = await db.account.findUnique({ where: { id: actor.accountId }, select: { id: true, personId: true } });
    if (!account) throw fail(401, "Sign in to your personal BrightWay account.");
    return account;
  }

  return {
    async viewProfile(actor, inputUsername) {
      const username = parse(usernameSchema, inputUsername);
      await actorAccount(prisma, actor);
      const initial = await prisma.account.findUnique({ where: { username }, select: { id: true } });
      if (!initial || initial.id === actor.accountId) throw fail(404, "This public profile is unavailable.");

      return prisma.$transaction(async tx => {
        await lockNetworkAccounts(tx, [actor.accountId, initial.id]);
        const viewer = await actorAccount(tx, actor);
        const target = await tx.account.findUnique({
          where: { username },
          select: { id: true, username: true, status: true, personId: true, person: { select: { firstName: true, middleName: true, lastName: true } } },
        });
        if (!target || target.id !== initial.id || target.status !== "ACTIVE" || target.id === viewer.id) throw fail(404, "This public profile is unavailable.");

        const [leftAccountId, rightAccountId] = [viewer.id, target.id].sort();
        const relationship = await tx.networkPair.findUnique({ where: { leftAccountId_rightAccountId: { leftAccountId, rightAccountId } }, select: { leftBlocked: true, rightBlocked: true } });
        if (relationship?.leftBlocked || relationship?.rightBlocked) throw fail(404, "This public profile is unavailable.");

        const profileIds = [viewer.personId, target.personId].sort();
        await tx.$queryRaw(Prisma.sql`SELECT "personId" FROM "Profile" WHERE "personId" IN (${Prisma.join(profileIds)}) ORDER BY "personId" FOR UPDATE`);
        const profile = await tx.profile.findUnique({ where: { personId: target.personId }, select: viewProfileSelect });
        const viewerProfile = await tx.profile.findUnique({ where: { personId: viewer.personId }, select: { profileViewSharingEnabled: true } });
        if (!profile?.profilePublicEnabled) throw fail(404, "This public profile is unavailable.");

        const sections = {};
        const approvedIdentity = await identity.inspectAccount(tx, target.id);
        sections.identityVerified = approvedIdentity.status === "APPROVED";
        if (profile.profileCertificationsPublicEnabled) {
          sections.certifications = Array.isArray(profile.certifications)
            ? profile.certifications.slice(0, 20).map(row => ({
              title: row.title, issuer: row.issuer, issuedMonth: row.issuedMonth,
              expiresMonth: row.expiresMonth || null, credentialUrl: row.credentialUrl || null,
              verified: false,
            }))
            : [];
        }
        if (profile.profileCredentialsPublicEnabled) {
          sections.verifiedCredentials = await verifiedCredentials(tx, profile.id);
        }
        if (profile.profileAchievementsPublicEnabled && sections.identityVerified) {
          sections.achievements = await tx.memberPost.findMany({
            where: { authorId: target.id, type: "ACHIEVEMENT", withdrawnAt: null },
            select: { id: true, body: true, tags: true, createdAt: true },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 8,
          });
        }
        const currentTime = now();
        if (profile.profileViewNotificationsEnabled && viewerProfile?.profileViewSharingEnabled) {
          await tx.profileViewNotification.createMany({
            data: [{ recipientId: target.id, viewerId: viewer.id, viewedOn: utcDay(currentTime), createdAt: currentTime }],
            skipDuplicates: true,
          });
        }
        await assertNetworkSession(tx, actor, now);
        return publicProfile(target, profile, sections);
      });
    },

    async list(actor, inputCursor) {
      const viewer = await actorAccount(prisma, actor);
      let cursor = null;
      if (inputCursor) {
        try { cursor = parse(cursorSchema, JSON.parse(Buffer.from(inputCursor, "base64url").toString("utf8"))); }
        catch { throw fail(400, "This notification page link is invalid. Reload your notifications."); }
        if (cursor.owner !== viewer.id) throw fail(400, "This notification page belongs to another account.");
      }

      const boundary = cursor ? new Date(cursor.at) : null;
      const cursorFilter = cursor
        ? Prisma.sql`AND (n."createdAt" < ${boundary} OR (n."createdAt" = ${boundary} AND n."id" < ${cursor.id}))`
        : Prisma.empty;
      const rows = await prisma.$queryRaw(Prisma.sql`
        SELECT n."id", n."viewedOn", n."createdAt", n."readAt",
          a."username", p."firstName", p."middleName", p."lastName"
        FROM "ProfileViewNotification" n
        JOIN "Account" a ON a."id" = n."viewerId" AND a."status" = 'ACTIVE'
        JOIN "Person" p ON p."id" = a."personId"
        WHERE n."recipientId" = ${viewer.id}
          ${cursorFilter}
        ORDER BY n."createdAt" DESC, n."id" DESC
        LIMIT 31`);
      await assertNetworkSession(prisma, actor, now);
      const items = rows.slice(0, 30).map(row => ({
        id: row.id,
        viewedOn: row.viewedOn,
        createdAt: row.createdAt,
        readAt: row.readAt,
        viewer: { username: row.username, fullName: [row.firstName, row.middleName, row.lastName].filter(Boolean).join(" ") },
      }));
      const last = rows[29];
      return {
        items,
        nextCursor: rows.length > 30 && last
          ? Buffer.from(JSON.stringify({ owner: viewer.id, at: last.createdAt.toISOString(), id: last.id })).toString("base64url")
          : null,
      };
    },

    async markRead(actor, inputId) {
      const id = parse(notificationIdSchema, inputId);
      return prisma.$transaction(async tx => {
        await actorAccount(tx, actor);
        const result = await tx.profileViewNotification.updateMany({ where: { id, recipientId: actor.accountId, readAt: null }, data: { readAt: now() } });
        await assertNetworkSession(tx, actor, now);
        return { updated: result.count === 1 };
      });
    },

    async dismiss(actor, inputId) {
      const id = parse(notificationIdSchema, inputId);
      return prisma.$transaction(async tx => {
        await actorAccount(tx, actor);
        const result = await tx.profileViewNotification.deleteMany({ where: { id, recipientId: actor.accountId } });
        await assertNetworkSession(tx, actor, now);
        return { dismissed: result.count === 1 };
      });
    },

    async markAllRead(actor) {
      return prisma.$transaction(async tx => {
        await actorAccount(tx, actor);
        const result = await tx.profileViewNotification.updateMany({ where: { recipientId: actor.accountId, readAt: null }, data: { readAt: now() } });
        await assertNetworkSession(tx, actor, now);
        return { updated: result.count };
      });
    },
  };
}
