import { notify } from "../notifications/platform-notification.js";
import { assertNetworkSession, lockNetworkAccounts } from "./network-authority.js";
import { createFollowingService } from "./network-follow.service.js";
import { followRef } from "./network-follow.schema.js";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { projectContact } from "../profile/profile-contact.js";
import { fail, parse, usernameSchema, networkActionSchema, networkQuerySchema, networkCursorSchema, relationshipView } from "./network.schema.js";
const personSelect = { id: true, username: true, status: true, person: { select: { firstName: true, middleName: true, lastName: true } } };
const personView = row => ({ username: row.username, fullName: [row.person.firstName, row.person.middleName, row.person.lastName].filter(Boolean).join(" ") });
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createNetworkService({ prisma, now = () => new Date() }) {
  const authority = (db, actor) => assertNetworkSession(db, actor, now);
  const following = createFollowingService({ prisma, now });
  const pairKey = (a, b) => { const [leftAccountId, rightAccountId] = [a, b].sort(); return { leftAccountId, rightAccountId }; };
  const pairRead = (db, key) => db.networkPair.findUnique({ where: { leftAccountId_rightAccountId: key } });
  async function target(db, username) {
    const row = await db.account.findUnique({ where: { username }, select: personSelect });
    if (!row) throw fail(404, "This person is unavailable.");
    return row;
  }
  return {
    async person(actor, value) {
      const username = parse(usernameSchema, value); await authority(prisma, actor);
      const account = await target(prisma, username);
      if (account.id === actor.accountId) throw fail(404, "Choose another active BrightWay username.");
      const pair = await pairRead(prisma, pairKey(actor.accountId, account.id));
      const ownBlock = pair && (pair.leftAccountId === actor.accountId ? pair.leftBlocked : pair.rightBlocked);
      if (account.status !== "ACTIVE" && !ownBlock) throw fail(404, "This person is unavailable.");
      const relationship = relationshipView(pair, actor.accountId);
      const follow = await prisma.networkFollow.findUnique({ where: { followerId_targetAccountId: { followerId: actor.accountId, targetAccountId: account.id } } });
      await authority(prisma, actor);
      return { kind: "PERSON", person: personView(account), relationship, available: account.status === "ACTIVE", follow: { active: follow?.active === true, version: follow?.version || 0, targetRef: followRef("PERSON", account.id) } };
    },
    async list(actor, input) {
      const query = parse(networkQuerySchema, input);
      if (["following", "followers"].includes(query.view)) return following.list(actor, query);
      await authority(prisma, actor);
      const id = actor.accountId;
      const visibleSide = side => ({ [`${side}AccountId`]: id, [`${side}Account`]: { status: "ACTIVE" }, ...(query.view === "blocked" ? { [`${side}Blocked`]: true } : { [`${side === "left" ? "right" : "left"}Account`]: { status: "ACTIVE" }, leftBlocked: false, rightBlocked: false }) });
      const where = { OR: [visibleSide("left"), visibleSide("right")], ...(query.view !== "blocked" ? { status: query.view === "connections" ? "CONNECTED" : "PENDING", ...(query.view === "incoming" ? { NOT: { requestedById: id } } : query.view === "outgoing" ? { requestedById: id } : {}) } : {}) };
      let boundary;
      if (query.cursor) {
        try { boundary = parse(networkCursorSchema, JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"))); } catch { throw fail(400, "This network page link is invalid. Reload the first page."); }
        if (boundary.owner !== id || boundary.view !== query.view) throw fail(400, "This network page belongs to another view.");
      }
      const rows = await prisma.networkPair.findMany({ where: { AND: [where, ...(boundary ? [{ OR: [{ updatedAt: { lt: new Date(boundary.at) } }, { updatedAt: new Date(boundary.at), id: { lt: boundary.id } }] }] : [])] }, take: 21, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], include: { leftAccount: { select: personSelect }, rightAccount: { select: personSelect } } });
      await authority(prisma, actor);
      const items = rows.slice(0, 20).map(row => ({ person: personView(row.leftAccountId === id ? row.rightAccount : row.leftAccount), relationship: relationshipView(row, id), updatedAt: row.updatedAt }));
      const last = rows[19];
      return { view: query.view, items, nextCursor: rows.length > 20 ? Buffer.from(JSON.stringify({ owner: id, view: query.view, at: last.updatedAt.toISOString(), id: last.id })).toString("base64url") : null };
    },
    async action(actor, value, input) {
      const username = parse(usernameSchema, value), data = parse(networkActionSchema, input);
      await authority(prisma, actor);
      const initial = await target(prisma, username);
      if (initial.id === actor.accountId) throw fail(400, "You cannot connect with or block yourself.");
      const key = pairKey(actor.accountId, initial.id), requestHash = digest({ username, ...data });
      return prisma.$transaction(async tx => {
        // The same sorted Account row locks serialize both directions and access
        // suspension. No locks or interactive transactions are used for reads.
        await lockNetworkAccounts(tx, [key.leftAccountId, key.rightAccountId]);
        await authority(tx, actor);
        const account = await target(tx, username);
        if (account.id !== initial.id) throw fail(409, "This username changed. Look up the person again.");
        const old = await tx.networkEvent.findUnique({ where: { actorId_requestKey: { actorId: actor.accountId, requestKey: data.requestKey } } });
        if (old) {
          if (old.requestHash !== requestHash) throw fail(409, "This request key was already used. Reload saved network state.");
          return { saved: true, action: old.action, version: old.resultVersion };
        }
        const existing = await pairRead(tx, key), version = existing?.version || 0;
        if (data.expectedVersion !== version) throw fail(409, "This connection changed. Reload before continuing.");
        if (account.status !== "ACTIVE" && !["REMOVE", "CANCEL", "DECLINE", "BLOCK", "UNBLOCK"].includes(data.action)) throw fail(404, "This person is unavailable.");
        const ownKey = actor.accountId === key.leftAccountId ? "leftBlocked" : "rightBlocked";
        const otherKey = ownKey === "leftBlocked" ? "rightBlocked" : "leftBlocked";
        const row = existing || { ...key, status: "NONE", requestedById: null, leftBlocked: false, rightBlocked: false };
        if (row[otherKey] && !["BLOCK", "UNBLOCK"].includes(data.action)) throw fail(404, "This person is unavailable.");
        if (row[ownKey] && !["BLOCK", "UNBLOCK"].includes(data.action)) throw fail(409, "Unblock this person before requesting a new connection.");
        if (await tx.networkEvent.count({ where: { actorId: actor.accountId, createdAt: { gte: new Date(+now() - 3600000) } } }) >= 200) throw fail(429, "Network action limit reached. Try again later.");
        let changes;
        switch (data.action) {
          case "REQUEST":
            if (row.status !== "NONE") throw fail(409, "There is already a request or connection. Reload its saved status.");
            if (row.lastRequestedAt && +now() - +row.lastRequestedAt < 86400000) throw fail(429, "Wait 24 hours before sending another request to this person.");
            if (await tx.networkEvent.count({ where: { actorId: actor.accountId, action: "REQUEST", createdAt: { gte: new Date(+now() - 86400000) } } }) >= 30) throw fail(429, "Daily connection request limit reached. Try again tomorrow.");
            changes = { status: "PENDING", requestedById: actor.accountId, lastRequestedAt: now() }; break;
          case "ACCEPT": case "DECLINE":
            if (row.status !== "PENDING" || row.requestedById === actor.accountId) throw fail(403, "Only the recipient can answer a pending request.");
            changes = { status: data.action === "ACCEPT" ? "CONNECTED" : "NONE", requestedById: null }; break;
          case "CANCEL":
            if (row.status !== "PENDING" || row.requestedById !== actor.accountId) throw fail(403, "Only the sender can cancel this request.");
            changes = { status: "NONE", requestedById: null }; break;
          case "REMOVE":
            if (row.status !== "CONNECTED") throw fail(409, "There is no current connection to remove.");
            changes = { status: "NONE", requestedById: null }; break;
          case "BLOCK":
            if (row[ownKey]) throw fail(409, "This person is already blocked.");
            changes = { [ownKey]: true, status: "NONE", requestedById: null }; break;
          case "UNBLOCK":
            if (!row[ownKey]) throw fail(409, "This person is not in your blocked list.");
            changes = { [ownKey]: false }; break;
        }
        const saved = existing ? await tx.networkPair.update({ where: { id: existing.id }, data: { ...changes, version: { increment: 1 }, updatedAt: now() } }) : await tx.networkPair.create({ data: { ...key, ...changes, version: 1, updatedAt: now() } });
        if (data.action === "BLOCK") {
          await tx.networkFollow.updateMany({ where: { active: true, OR: [{ followerId: actor.accountId, targetAccountId: account.id }, { followerId: account.id, targetAccountId: actor.accountId }] }, data: { active: false, version: { increment: 1 }, updatedAt: now() } });
          await tx.profileViewNotification.deleteMany({ where: { OR: [{ recipientId: actor.accountId, viewerId: account.id }, { recipientId: account.id, viewerId: actor.accountId }] } });
          if (tx.platformNotification) await tx.platformNotification.deleteMany({ where: { OR: [{ recipientId: actor.accountId, actorAccountId: account.id }, { recipientId: account.id, actorAccountId: actor.accountId }] } });
          if (tx.messagingTyping) await tx.messagingTyping.deleteMany({ where: { accountId: { in: [actor.accountId, account.id] }, conversationId: { in: (await tx.messagingConversation.findMany({ where: { leftAccountId: key.leftAccountId, rightAccountId: key.rightAccountId }, select: { id: true } })).map(c => c.id) } } });
        }
        await tx.networkEvent.create({ data: { pairId: saved.id, actorId: actor.accountId, action: data.action, requestKey: data.requestKey, requestHash, resultVersion: saved.version, createdAt: now() } });
        if (["REQUEST", "ACCEPT"].includes(data.action)) await notify(tx, { recipientId: account.id, actorAccountId: actor.accountId, eventKey: "network:" + data.requestKey, kind: "CONNECTION", title: data.action === "REQUEST" ? "You received a connection request" : "Your connection request was accepted", href: "/network" });
        await authority(tx, actor);
        return { saved: true, action: data.action, version: saved.version };
      });
    },
    async visibleContact(value, viewerPersonId = null) {
      const username = parse(usernameSchema, value);
      // One database snapshot binds contact settings, active identities and the
      // exact accepted relationship. No client-supplied audience flags or cache.
      const rows = await prisma.$queryRaw(Prisma.sql`
        SELECT a."email", p."phoneNumber", p."id" AS "personId", f."whatsappNumber",
          f."emailVisibility", f."phoneVisibility", f."whatsappVisibility",
          (v."id" IS NOT NULL AND np."status" = 'CONNECTED') AS "connected",
          COALESCE(np."leftBlocked" OR np."rightBlocked", false) AS "blocked"
        FROM "Account" a JOIN "Person" p ON p."id" = a."personId"
        LEFT JOIN "Profile" f ON f."personId" = p."id"
        LEFT JOIN "Account" v ON v."personId" = ${viewerPersonId} AND v."status" = 'ACTIVE'
        LEFT JOIN "NetworkPair" np ON np."leftAccountId" = LEAST(a."id", v."id") AND np."rightAccountId" = GREATEST(a."id", v."id") AND v."id" IS NOT NULL AND v."id" <> a."id"
        WHERE a."username" = ${username} AND a."status" = 'ACTIVE' LIMIT 1`);
      const row = rows[0]; if (!row) throw fail(404, "Profile not found.");
      return projectContact({ email: row.email, phoneNumber: row.phoneNumber, whatsappNumber: row.whatsappNumber, visibility: { email: row.emailVisibility || "ONLY_ME", phone: row.phoneVisibility || "ONLY_ME", whatsapp: row.whatsappVisibility || "ONLY_ME" } }, { owner: viewerPersonId === row.personId, connected: row.connected === true, blocked: row.blocked === true });
    },
  };
}
