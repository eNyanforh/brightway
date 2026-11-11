import { notify } from "../notifications/platform-notification.js";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { assertNetworkSession, lockNetworkAccounts } from "./network-authority.js";
import { fail, parse, usernameSchema, networkQuerySchema, networkCursorSchema, relationshipView } from "./network.schema.js";
import { followActionSchema, followKind, followRef } from "./network-follow.schema.js";
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fullName = person => [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ");
export function createFollowingService({ prisma, now = () => new Date() }) {
  const authority = (db, actor) => assertNetworkSession(db, actor, now);
  const keyFor = (kind, followerId, targetId) => kind === "PERSON" ? { followerId_targetAccountId: { followerId, targetAccountId: targetId } } : { followerId_targetOrganizationId: { followerId, targetOrganizationId: targetId } };
  async function resolve(db, kind, username) {
    const row = kind === "PERSON" ? await db.account.findUnique({ where: { username }, select: { id: true, username: true, status: true, person: { select: { firstName: true, middleName: true, lastName: true } } } }) : await db.organization.findUnique({ where: { username }, select: { id: true, name: true, username: true, status: true, request: { select: { status: true } } } });
    if (!row) throw fail(404, "This person or organization is unavailable.");
    return { ...row, available: row.status === "ACTIVE" && (kind === "PERSON" || row.request.status === "APPROVED") };
  }
  async function pair(db, actorId, targetId) {
    const [leftAccountId, rightAccountId] = [actorId, targetId].sort();
    return db.networkPair.findUnique({ where: { leftAccountId_rightAccountId: { leftAccountId, rightAccountId } } });
  }
  function unblocked(row) { if (row?.leftBlocked || row?.rightBlocked) throw fail(404, "This person is unavailable."); }
  return {
    async target(actor, kindInput, usernameInput) {
      const kind = parse(followKind, kindInput), username = parse(usernameSchema, usernameInput); await authority(prisma, actor);
      const target = await resolve(prisma, kind, username);
      if (kind === "PERSON" && target.id === actor.accountId) throw fail(400, "You cannot follow yourself.");
      const row = await prisma.networkFollow.findUnique({ where: keyFor(kind, actor.accountId, target.id) });
      const relationship = kind === "PERSON" ? await pair(prisma, actor.accountId, target.id) : null;
      unblocked(relationship);
      if (!target.available && !row?.active) throw fail(404, "This person or organization is unavailable.");
      await authority(prisma, actor);
      return { kind, person: { username: target.username, fullName: !target.available ? kind === "PERSON" ? "Unavailable account" : "Unavailable organization" : kind === "PERSON" ? fullName(target.person) : target.name }, available: target.available,
        relationship: kind === "PERSON" ? relationshipView(relationship, actor.accountId) : { state: "NONE", version: 0 },
        follow: { active: row?.active === true, version: row?.version || 0, targetRef: followRef(kind, target.id) },
        ...(kind === "ORGANIZATION" && target.available ? { publicUrl: `/organizations/${target.id}` } : {}) };
    },
    async action(actor, kindInput, usernameInput, input) {
      const kind = parse(followKind, kindInput), username = parse(usernameSchema, usernameInput), data = parse(followActionSchema, input);
      await authority(prisma, actor); const initial = await resolve(prisma, kind, username);
      if (kind === "PERSON" && initial.id === actor.accountId) throw fail(400, "You cannot follow yourself.");
      if (data.targetRef !== followRef(kind, initial.id)) throw fail(409, "This username now belongs to a different target. Look it up again.");
      const requestHash = hash({ kind, username, ...data });
      return prisma.$transaction(async tx => {
        await lockNetworkAccounts(tx, kind === "PERSON" ? [actor.accountId, initial.id] : [actor.accountId]);
        if (kind === "ORGANIZATION") await tx.organization.updateMany({ where: { id: initial.id }, data: { accessVersion: { increment: 0 } } });
        await authority(tx, actor); const target = await resolve(tx, kind, username);
        if (target.id !== initial.id) throw fail(409, "This username changed. Look it up again.");
        const previous = await tx.networkFollowEvent.findUnique({ where: { actorId_requestKey: { actorId: actor.accountId, requestKey: data.requestKey } } });
        if (previous) { if (previous.requestHash !== requestHash) throw fail(409, "This request key belongs to another follow action. Reload saved state."); return { saved: true, action: previous.action, version: previous.resultVersion }; }
        if (kind === "PERSON") unblocked(await pair(tx, actor.accountId, target.id));
        const where = keyFor(kind, actor.accountId, target.id), row = await tx.networkFollow.findUnique({ where });
        if ((row?.version || 0) !== data.expectedVersion) throw fail(409, "Following changed. Reload saved state before continuing.");
        const active = data.action === "FOLLOW";
        if ((row?.active === true) === active) throw fail(409, active ? "You already follow this target." : "You are not following this target.");
        if (active && !target.available) throw fail(404, "This person or organization is unavailable.");
        if (active && await tx.networkFollowEvent.count({ where: { actorId: actor.accountId, action: "FOLLOW", createdAt: { gte: new Date(+now() - 86400000) } } }) >= 100) throw fail(429, "Daily following limit reached. Try again tomorrow.");
        if (active && await tx.networkFollowEvent.count({ where: { actorId: actor.accountId, createdAt: { gte: new Date(+now() - 3600000) } } }) >= 500) throw fail(429, "Following action limit reached. Try again later.");
        const saved = row ? await tx.networkFollow.update({ where: { id: row.id }, data: { active, version: { increment: 1 }, updatedAt: now() } }) : await tx.networkFollow.create({ data: { followerId: actor.accountId, ...(kind === "PERSON" ? { targetAccountId: target.id } : { targetOrganizationId: target.id }), active, version: 1, updatedAt: now() } });
        await tx.networkFollowEvent.create({ data: { followId: saved.id, actorId: actor.accountId, action: data.action, requestKey: data.requestKey, requestHash, resultVersion: saved.version, createdAt: now() } });
        if (active && kind === "PERSON") await notify(tx, { recipientId: target.id, actorAccountId: actor.accountId, eventKey: "follow:" + data.requestKey, kind: "FOLLOW", title: "You have a new follower", href: "/network" });
        await authority(tx, actor); return { saved: true, action: data.action, version: saved.version };
      });
    },
    async list(actor, input) {
      const query = parse(networkQuerySchema, input); if (!["following", "followers"].includes(query.view)) throw fail(400, "Choose Following or Followers.");
      await authority(prisma, actor); let cursor;
      if (query.cursor) { try { cursor = parse(networkCursorSchema, JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"))); } catch { throw fail(400, "Invalid following page. Reload the first page."); } if (cursor.owner !== actor.accountId || cursor.view !== query.view) throw fail(400, "This page belongs to another account or view."); }
      const following = query.view === "following";
      const scope = following ? Prisma.sql`f."followerId" = ${actor.accountId}` : Prisma.sql`f."targetAccountId" = ${actor.accountId} AND d."status" = 'ACTIVE'`;
      const boundary = cursor ? Prisma.sql`AND (f."updatedAt" < ${new Date(cursor.at)} OR (f."updatedAt" = ${new Date(cursor.at)} AND f."id" < ${cursor.id}))` : Prisma.empty;
      const rows = await prisma.$queryRaw(Prisma.sql`
        SELECT f."id", f."updatedAt", d."username", d."status"::text AS "status", p."firstName", p."middleName", p."lastName",
          o."id" AS "organizationId", o."username" AS "organizationUsername", o."name" AS "organizationName", o."status"::text AS "organizationStatus", r."status"::text AS "requestStatus"
        FROM "NetworkFollow" f
        LEFT JOIN "Account" d ON d."id" = CASE WHEN ${following} THEN f."targetAccountId" ELSE f."followerId" END
        LEFT JOIN "Person" p ON p."id" = d."personId"
        LEFT JOIN "Organization" o ON o."id" = f."targetOrganizationId"
        LEFT JOIN "OrganizationRequest" r ON r."id" = o."requestId"
        WHERE f."active" = true AND ${scope}
          AND NOT EXISTS (SELECT 1 FROM "NetworkPair" np WHERE f."targetAccountId" IS NOT NULL
            AND np."leftAccountId" = LEAST(f."followerId", f."targetAccountId") AND np."rightAccountId" = GREATEST(f."followerId", f."targetAccountId") AND (np."leftBlocked" OR np."rightBlocked"))
          ${boundary} ORDER BY f."updatedAt" DESC, f."id" DESC LIMIT 21`);
      await authority(prisma, actor);
      const items = rows.slice(0, 20).map(row => {
        const kind = row.organizationId ? "ORGANIZATION" : "PERSON", available = row.organizationId ? row.organizationStatus === "ACTIVE" && row.requestStatus === "APPROVED" : row.status === "ACTIVE";
        return { kind, person: { username: row.organizationId ? row.organizationUsername : row.username, fullName: !available ? kind === "PERSON" ? "Unavailable account" : "Unavailable organization" : row.organizationId ? row.organizationName : fullName(row) }, available, relationship: { state: following ? "FOLLOWING" : "FOLLOWS_YOU", version: 0 }, updatedAt: row.updatedAt };
      });
      const last = rows[19]; return { view: query.view, items, nextCursor: rows.length > 20 ? Buffer.from(JSON.stringify({ owner: actor.accountId, view: query.view, at: last.updatedAt.toISOString(), id: last.id })).toString("base64url") : null };
    },
  };
}
