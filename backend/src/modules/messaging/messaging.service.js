import { createManualIdentityReviewService } from "../manual-identity/manual-identity-review.service.js";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { assertNetworkSession, lockNetworkAccounts } from "../network/network-authority.js";
import { assertManagementSession, managementPermission, lockReviewActors } from "../management/management-authority.js";
import { assertMfaSession } from "../auth/mfa.service.js";
import { processEvidence } from "../credentials/evidence.process.js";
import { fail, usernameSchema } from "../network/network.schema.js";
import { notify } from "../notifications/platform-notification.js";
import * as input from "./messaging.schema.js";

const unavailable = () => fail(404, "This conversation is unavailable.");
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fileSelect = { id: true, name: true, contentType: true, size: true };
const publicOrg = { status: "ACTIVE", request: { status: "APPROVED" }, profileReadyAt: { not: null }, username: { not: null } };
const messageSelect = { sequence: true, id: true, conversationId: true, senderAccountId: true, senderStaffId: true, body: true, shareKind: true, shareId: true, createdAt: true, deliveredAt: true, readAt: true, attachments: { select: fileSelect } };
const ascending = (a, b) => a.sequence < b.sequence ? -1 : a.sequence > b.sequence ? 1 : 0;

export function createMessagingService({ prisma, storage, now = () => new Date(), processFile = processEvidence }) {
  const identity = createManualIdentityReviewService({ prisma, now });
  async function auth(db, actor) {
    if (actor.staffId) { await assertManagementSession(db, actor.staffId, actor.sessionId, now()); await managementPermission(db, actor.staffId, "support-agent"); }
    else await assertNetworkSession(db, actor, now);
  }
  async function organizationAccess(db, actor, organizationId) {
    const org = await db.organization.findFirst({ where: { id: organizationId, status: "ACTIVE", request: { status: "APPROVED" } } });
    const member = await db.organizationMembership.findUnique({ where: { organizationId_accountId: { organizationId, accountId: actor.accountId } }, include: { account: { select: { emailVerifiedAt: true } } } });
    if (!org || !member?.enabled || member.role !== "PRIMARY_ADMIN" || !member.account.emailVerifiedAt) throw fail(403, "Only the current primary administrator can open the organization's official inbox.");
    await assertMfaSession(db, actor.accountId, actor.sessionId, now());
    return org;
  }
  async function pair(db, a, b, requireConnected = false) {
    const [leftAccountId, rightAccountId] = [a, b].sort();
    const row = await db.networkPair.findUnique({ where: { leftAccountId_rightAccountId: { leftAccountId, rightAccountId } } });
    const accounts = await db.account.count({ where: { id: { in: [a, b] }, status: "ACTIVE" } });
    if (accounts !== 2 || row?.leftBlocked || row?.rightBlocked) throw unavailable();
    if (requireConnected && row?.status !== "CONNECTED") throw fail(403, "An accepted connection is required to send messages.");
    return row?.status === "CONNECTED";
  }
  async function access(db, actor, conversationId, write = false) {
    await auth(db, actor);
    const convo = await db.messagingConversation.findUnique({ where: { id: input.parse(input.id, conversationId) } });
    if (!convo) throw unavailable();
    if (actor.staffId) { if (convo.kind === "DIRECT") throw unavailable(); return convo; }
    if (convo.kind === "DIRECT") {
      if (![convo.leftAccountId, convo.rightAccountId].includes(actor.accountId)) throw unavailable();
      convo.canSend = await pair(db, convo.leftAccountId, convo.rightAccountId, write);
    } else if (convo.kind === "OFFICIAL_USER") {
      if (convo.recipientAccountId !== actor.accountId) throw unavailable();
      convo.canSend = true;
    } else { const org = await organizationAccess(db, actor, convo.organizationId); convo.organizationName = org.name; convo.canSend = true; }
    return convo;
  }
  async function transaction(actor, conversationId, work, write = false) {
    try {
      return await prisma.$transaction(async db => {
        // Account locks share the Network/suspension lock order. Blocking/removal
        // and message sends therefore cannot race past each other's authority.
        const initial = await access(db, actor, conversationId);
        const ids = initial.kind === "DIRECT" ? [initial.leftAccountId, initial.rightAccountId] : actor.accountId ? [actor.accountId] : [];
        await lockNetworkAccounts(db, ids);
        if (actor.staffId) await lockReviewActors(db, [actor.staffId]);
        if (initial.organizationId) await db.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${initial.organizationId} FOR UPDATE`;
        await db.$queryRaw`SELECT "id" FROM "MessagingConversation" WHERE "id" = ${initial.id} FOR UPDATE`;
        const convo = await access(db, actor, conversationId, write);
        const result = await work(db, convo);
        await auth(db, actor);
        return result;
      }, { timeout: 15000 });
    } catch (e) { if (["P2002", "P2034"].includes(e.code)) throw fail(409, "This conversation changed. Retry with the same message key."); throw e; }
  }
  async function person(db, accountId) {
    const a = await db.account.findUnique({ where: { id: accountId }, select: { id: true, username: true, manualIdentityRequest: { select: { id: true } }, person: { select: { firstName: true, middleName: true, lastName: true, profile: { select: { photoId: true } } } } } });
    return a && { id: a.id, username: a.username, fullName: [a.person.firstName, a.person.middleName, a.person.lastName].filter(Boolean).join(" "), photoId: a.person.profile?.photoId || null, identityVerified: !!a.manualIdentityRequest && (await identity.inspectAccount(db, a.id)).status === "APPROVED" };
  }
  async function shareView(db, actor, kind, id, sending = false) {
    if (!kind) return null;
    let row, href, label, owner;
    if (kind === "PROFILE") { row = await db.account.findFirst({ where: { id, status: "ACTIVE" } }); if (row && actor.accountId && row.id !== actor.accountId) await pair(db, actor.accountId, row.id); href = row && `/${encodeURIComponent(row.username)}`; label = "View BrightWay profile"; }
    if (kind === "ORGANIZATION") { row = await db.organization.findFirst({ where: { id, ...publicOrg } }); href = `/organizations/${id}`; label = row?.name; }
    if (kind === "PROGRAM") { row = await db.program.findFirst({ where: { id, status: "PUBLISHED", organization: publicOrg } }); href = `/learning/programs/${id}`; label = row?.title; }
    if (kind === "OPPORTUNITY") { row = await db.opportunity.findFirst({ where: { id, status: "PUBLISHED", organization: publicOrg } }); href = `/opportunities/${id}`; label = row?.title; }
    if (kind === "POST") {
      row = await db.memberPost.findFirst({ where: { id, withdrawnAt: null, moderationStatus: "PUBLISHED", author: { status: "ACTIVE" } } });
      if (row) { owner = row.authorId; if (actor.accountId && owner !== actor.accountId) await pair(db, actor.accountId, owner); href = `/explore?post=${id}&source=member`; label = "View shared BrightWay post"; }
      else { row = await db.organizationPost.findFirst({ where: { id, withdrawnAt: null, organization: publicOrg } }); href = `/explore?post=${id}&source=organization`; label = "View shared organization post"; }
    }
    if (!row) { if (sending) throw fail(404, "Only available published BrightWay content can be shared."); return { kind, unavailable: true }; }
    return { kind, id, href, label };
  }
  async function project(db, actor, row, convo, people = new Map()) {
    let shared;
    try { shared = await shareView(db, actor, row.shareKind, row.shareId); } catch { shared = row.shareKind ? { kind: row.shareKind, unavailable: true } : null; }
    if (row.senderAccountId && !people.has(row.senderAccountId)) people.set(row.senderAccountId, person(db, row.senderAccountId));
    return { sequence: row.sequence.toString(), id: row.id, conversationId: row.conversationId, body: row.body, createdAt: row.createdAt, deliveredAt: row.deliveredAt, readAt: row.readAt,
      own: actor.staffId ? !!row.senderStaffId : convo.organizationId ? !!row.senderAccountId : row.senderAccountId === actor.accountId,
      sender: row.senderStaffId ? { fullName: "BrightWay", official: true } : convo.organizationId ? { fullName: convo.organizationName || "Organization administrator" } : await people.get(row.senderAccountId),
      state: row.readAt ? "READ" : row.deliveredAt ? "DELIVERED" : "SENT", attachments: row.attachments, share: shared };
  }
  async function presence(db, actor, convo) {
    if (convo.kind !== "DIRECT" || !convo.canSend) return { active: false, lastActiveAt: null, typing: false };
    const other = convo.leftAccountId === actor.accountId ? convo.rightAccountId : convo.leftAccountId;
    const pref = await db.messagingPreference.findUnique({ where: { accountId: other } });
    const active = pref?.showActive ? await db.messagingPresence.findUnique({ where: { accountId: other } }) : null;
    const lease = pref?.showTyping !== false ? await db.messagingTyping.findUnique({ where: { conversationId_accountId: { conversationId: convo.id, accountId: other } } }) : null;
    return { active: !!active && +now() - +active.lastActiveAt < 45000, lastActiveAt: active?.lastActiveAt || null, typing: !!lease && lease.expiresAt > now() };
  }
  async function summary(db, actor, c) {
    const latest = c.messages ? c.messages[0] : await db.directMessage.findFirst({ where: { conversationId: c.id }, orderBy: { sequence: "desc" }, select: messageSelect });
    const counterpart = c.kind === "DIRECT" ? await person(db, c.leftAccountId === actor.accountId ? c.rightAccountId : c.leftAccountId) : { fullName: "BrightWay", official: true };
    if (actor.staffId) {
      if (c.recipientAccountId) Object.assign(counterpart, await person(db, c.recipientAccountId), { official: false });
      else { const org = await db.organization.findUnique({ where: { id: c.organizationId }, select: { name: true } }); counterpart.fullName = org?.name || "Organization"; }
    }
    const incoming = actor.staffId ? { senderStaffId: null } : c.kind === "DIRECT" ? { NOT: { senderAccountId: actor.accountId } } : { senderStaffId: { not: null } };
    const unread = c._count ? c._count.messages : await db.directMessage.count({ where: { conversationId: c.id, readAt: null, ...incoming } });
    return { id: c.id, kind: c.kind, organizationId: c.organizationId || null, counterpart, ...(actor.staffId ? { recipientKind: c.recipientAccountId ? "USER" : "ORGANIZATION", recipientId: c.recipientAccountId || c.organizationId } : {}), canSend: actor.staffId || c.canSend, updatedAt: c.updatedAt, unread,
      latest: latest ? { id: latest.id, body: latest.body.slice(0, 120), createdAt: latest.createdAt, deliveredAt: latest.deliveredAt, readAt: latest.readAt } : null };
  }
  const service = {
    async recipients(actor, query) {
      const q = input.parse(z.strictObject({ kind: z.enum(["USER", "ORGANIZATION"]), q: z.string().trim().min(2).max(100) }), query);
      await auth(prisma, actor); if (!actor.staffId) throw fail(403, "Management permission required.");
      if (q.kind === "USER") {
        const rows = await prisma.account.findMany({ where: { status: "ACTIVE", OR: [{ username: { contains: q.q, mode: "insensitive" } }, { person: { firstName: { contains: q.q, mode: "insensitive" } } }, { person: { lastName: { contains: q.q, mode: "insensitive" } } }] }, select: { id: true, username: true, person: { select: { firstName: true, lastName: true } } }, orderBy: { username: "asc" }, take: 20 });
        return { items: rows.map(r => ({ id: r.id, label: [r.person.firstName, r.person.lastName].join(" "), username: r.username })) };
      }
      return { items: (await prisma.organization.findMany({ where: { status: "ACTIVE", request: { status: "APPROVED" }, OR: [{ name: { contains: q.q, mode: "insensitive" } }, { username: { contains: q.q, mode: "insensitive" } }] }, select: { id: true, name: true, username: true }, orderBy: { name: "asc" }, take: 20 })).map(r => ({ id: r.id, label: r.name, username: r.username })) };
    },
    async resolveShare(actor, query) {
      await auth(prisma, actor);
      const { path } = input.parse(z.strictObject({ path: z.string().min(2).max(400) }), query);
      if (!path.startsWith("/") || path.startsWith("//")) throw fail(400, "Paste a BrightWay content link.");
      const url = new URL(path, "https://joinbrightway.me");
      let kind, target;
      if (/^\/explore\/?$/.test(url.pathname)) { kind = "POST"; target = input.parse(input.id, url.searchParams.get("post")); }
      else {
        const match = /^\/(organizations|opportunities|learning\/programs)\/([a-f0-9-]+)\/?$/.exec(url.pathname);
        if (match) { kind = { organizations: "ORGANIZATION", opportunities: "OPPORTUNITY", "learning/programs": "PROGRAM" }[match[1]]; target = input.parse(input.id, match[2]); }
        else { const name = /^\/([a-z0-9_]{3,30})\/?$/i.exec(url.pathname)?.[1]; if (!name) throw fail(400, "Choose a profile, post, organization, opportunity or program link."); const a = await prisma.account.findUnique({ where: { username: name.toLowerCase() }, select: { id: true } }); if (!a) throw unavailable(); kind = "PROFILE"; target = a.id; }
      }
      return shareView(prisma, actor, kind, target, true);
    },
    async open(actor, value) {
      const username = input.parse(usernameSchema, value);
      await auth(prisma, actor);
      const target = await prisma.account.findUnique({ where: { username }, select: { id: true } });
      if (!target || target.id === actor.accountId) throw unavailable();
      const [leftAccountId, rightAccountId] = [actor.accountId, target.id].sort();
      return prisma.$transaction(async db => {
        await lockNetworkAccounts(db, [leftAccountId, rightAccountId]); await auth(db, actor);
        await pair(db, leftAccountId, rightAccountId, true);
        const key = `direct:${leftAccountId}:${rightAccountId}`;
        const c = await db.messagingConversation.upsert({ where: { key }, create: { key, kind: "DIRECT", leftAccountId, rightAccountId, updatedAt: now() }, update: {} });
        return { id: c.id };
      });
    },
    async list(actor, query = {}) {
      const q = input.parse(input.page, query); await auth(prisma, actor);
      if (q.organizationId && !actor.staffId) await organizationAccess(prisma, actor, q.organizationId);
      const where = actor.staffId ? { kind: { not: "DIRECT" } } : q.organizationId ? { organizationId: q.organizationId } : { OR: [{ leftAccountId: actor.accountId }, { rightAccountId: actor.accountId }, { recipientAccountId: actor.accountId }] };
      // Refresh reloads recent activity; the cursor is bound to this mailbox.
      const scope = `inbox:${actor.staffId || actor.accountId}:${q.organizationId || "personal"}`;
      const incoming = actor.staffId ? { senderStaffId: null } : q.organizationId ? { senderStaffId: { not: null } } : { NOT: { senderAccountId: actor.accountId } };
      const rows = await prisma.messagingConversation.findMany({ where: { AND: [where, input.cursor(q.cursor, scope) || {}] }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 31,
        include: { messages: { orderBy: { sequence: "desc" }, take: 1, select: messageSelect }, _count: { select: { messages: { where: { readAt: null, ...incoming } } } } } });
      const direct = rows.filter(c => c.kind === "DIRECT"), targetIds = direct.map(c => c.leftAccountId === actor.accountId ? c.rightAccountId : c.leftAccountId);
      const pairs = direct.length ? await prisma.networkPair.findMany({ where: { OR: [{ leftAccountId: actor.accountId, rightAccountId: { in: targetIds } }, { rightAccountId: actor.accountId, leftAccountId: { in: targetIds } }] } }) : [];
      const activeAccounts = direct.length ? await prisma.account.findMany({ where: { id: { in: targetIds }, status: "ACTIVE" }, select: { id: true } }) : [];
      const activeIds = new Set(activeAccounts.map(a => a.id));
      const items = [];
      for (const c of rows.slice(0, 30)) {
        if (c.kind === "DIRECT") {
          const p = pairs.find(p => p.leftAccountId === c.leftAccountId && p.rightAccountId === c.rightAccountId);
          const other = c.leftAccountId === actor.accountId ? c.rightAccountId : c.leftAccountId;
          if (!activeIds.has(other) || p?.leftBlocked || p?.rightBlocked) continue;
          c.canSend = p?.status === "CONNECTED";
        } else c.canSend = true;
        items.push(await summary(prisma, actor, c));
      }
      await auth(prisma, actor);
      if (q.organizationId && !actor.staffId) await organizationAccess(prisma, actor, q.organizationId);
      const currentBlocks = direct.length ? await prisma.networkPair.findMany({ where: { OR: [{ leftAccountId: actor.accountId, rightAccountId: { in: targetIds } }, { rightAccountId: actor.accountId, leftAccountId: { in: targetIds } }], AND: [{ OR: [{ leftBlocked: true }, { rightBlocked: true }] }] }, select: { leftAccountId: true, rightAccountId: true } }) : [];
      const blocked = new Set(currentBlocks.map(p => p.leftAccountId === actor.accountId ? p.rightAccountId : p.leftAccountId));
      return { items: items.filter(c => !blocked.has(c.counterpart.id)), nextCursor: input.nextCursor(rows, 30, scope) };
    },
    async detail(actor, conversationId, query = {}) {
      const q = input.parse(input.page, query);
      const c = await access(prisma, actor, conversationId);
      if (q.organizationId && c.organizationId !== q.organizationId) throw unavailable();
      const scope = `thread:${actor.staffId || actor.accountId}:${c.id}`;
      const rows = await prisma.directMessage.findMany({ where: { conversationId: c.id, ...input.messageCursor(q.cursor, scope) }, select: messageSelect, orderBy: { sequence: "desc" }, take: 41 });
      const people = new Map();
      const items = await Promise.all(rows.slice(0, 40).sort(ascending).map(row => project(prisma, actor, row, c, people)));
      const result = { conversation: await summary(prisma, actor, c), items, nextCursor: input.messageNextCursor(rows, 40, scope), presence: actor.staffId ? null : await presence(prisma, actor, c) };
      await access(prisma, actor, c.id); return result;
    },
    async send(actor, conversationId, value) {
      const data = input.parse(input.sendInput, value), hash = digest(data);
      return transaction(actor, conversationId, async (db, c) => {
        if (actor.staffId) throw fail(403, "Send official messages through the audited management action.");
        const old = await db.directMessage.findUnique({ where: { conversationId_requestKey: { conversationId: c.id, requestKey: data.requestKey } }, select: { ...messageSelect, requestHash: true } });
        if (old) { if (old.requestHash !== hash || old.senderAccountId !== actor.accountId) throw fail(409, "This message key was already used."); return project(db, actor, old, c); }
        if (await db.directMessage.count({ where: { senderAccountId: actor.accountId, createdAt: { gte: new Date(+now() - 60000) } } }) >= 30) throw fail(429, "Message limit reached. Try again in a minute.");
        if (data.share) {
          await shareView(db, actor, data.share.kind, data.share.id, true);
          // Validate the recipient's view too; a sender cannot smuggle blocked or
          // unavailable public content into another person's conversation.
          if (c.kind === "DIRECT") await shareView(db, { accountId: c.leftAccountId === actor.accountId ? c.rightAccountId : c.leftAccountId }, data.share.kind, data.share.id, true);
        }
        const files = await db.messageAttachment.findMany({ where: { id: { in: data.attachmentIds }, conversationId: c.id, ownerId: actor.accountId, messageId: null, discardedAt: null } });
        if (files.length !== data.attachmentIds.length) throw fail(400, "Choose your own unattached files from this conversation.");
        const row = await db.directMessage.create({ data: { conversationId: c.id, senderAccountId: actor.accountId, requestKey: data.requestKey, requestHash: hash, body: data.body, shareKind: data.share?.kind, shareId: data.share?.id, createdAt: now() }, select: messageSelect });
        if (files.length) {
          const bound = await db.messageAttachment.updateMany({ where: { id: { in: files.map(f => f.id) }, messageId: null, discardedAt: null }, data: { messageId: row.id } });
          if (bound.count !== files.length) throw fail(409, "A draft attachment expired. Remove it and upload it again.");
        }
        row.attachments = files.map(f => Object.fromEntries(Object.keys(fileSelect).map(key => [key, f[key]])));
        await db.messagingConversation.update({ where: { id: c.id }, data: { updatedAt: now() } });
        await db.messagingTyping.deleteMany({ where: { conversationId: c.id, accountId: actor.accountId } });
        if (c.kind === "DIRECT") await notify(db, { recipientId: c.leftAccountId === actor.accountId ? c.rightAccountId : c.leftAccountId, actorAccountId: actor.accountId, eventKey: row.id, kind: "MESSAGE", title: "You received a new message", href: `/messages?conversation=${c.id}` });
        return project(db, actor, row, c);
      }, true);
    },
    async receipts(actor, conversationId, value) {
      const data = input.parse(z.strictObject({ state: z.enum(["DELIVERED", "READ"]), throughId: input.id }), value);
      return transaction(actor, conversationId, async (db, c) => {
        const through = await db.directMessage.findFirst({ where: { id: data.throughId, conversationId: c.id } });
        if (!through) throw unavailable();
        const incoming = actor.staffId ? { senderStaffId: null } : c.kind === "DIRECT" ? { NOT: { senderAccountId: actor.accountId } } : { senderStaffId: { not: null } };
        const where = { conversationId: c.id, ...incoming, sequence: { lte: through.sequence } };
        await db.directMessage.updateMany({ where: { ...where, deliveredAt: null }, data: { deliveredAt: now() } });
        if (data.state === "READ") {
          await db.directMessage.updateMany({ where: { ...where, readAt: null }, data: { readAt: now() } });
          if (actor.accountId) await db.platformNotification.updateMany({ where: { recipientId: actor.accountId, kind: { in: ["MESSAGE", "OFFICIAL_MESSAGE"] }, href: c.organizationId ? `/organization-workspace/${c.organizationId}/messages?conversation=${c.id}` : `/messages?conversation=${c.id}`, readAt: null }, data: { readAt: now() } });
        }
        return { saved: true };
      });
    },
    async preferences(actor, value) {
      await auth(prisma, actor);
      if (value === undefined) return await prisma.messagingPreference.findUnique({ where: { accountId: actor.accountId }, select: { showActive: true, showTyping: true } }) || { showActive: false, showTyping: true };
      const data = input.parse(input.preferenceInput, value);
      return prisma.$transaction(async db => {
        await lockNetworkAccounts(db, [actor.accountId]); await auth(db, actor);
        await db.messagingPreference.upsert({ where: { accountId: actor.accountId }, create: { accountId: actor.accountId, ...data }, update: data });
        if (!data.showTyping) await db.messagingTyping.deleteMany({ where: { accountId: actor.accountId } });
        return data;
      });
    },
    async heartbeat(actor) {
      await auth(prisma, actor);
      await prisma.messagingTyping.deleteMany({ where: { expiresAt: { lte: now() } } });
      await prisma.messagingPresence.upsert({ where: { accountId: actor.accountId }, create: { accountId: actor.accountId, lastActiveAt: now() }, update: { lastActiveAt: now() } });
      return { saved: true };
    },
    async typing(actor, conversationId, value) {
      const data = input.parse(input.typingInput, value);
      return transaction(actor, conversationId, async (db, c) => {
        if (c.kind !== "DIRECT") return { saved: true };
        const pref = await db.messagingPreference.findUnique({ where: { accountId: actor.accountId } });
        if (data.active && pref?.showTyping !== false) await db.messagingTyping.upsert({ where: { conversationId_accountId: { conversationId: c.id, accountId: actor.accountId } }, create: { conversationId: c.id, accountId: actor.accountId, expiresAt: new Date(+now() + 6000) }, update: { expiresAt: new Date(+now() + 6000) } });
        else await db.messagingTyping.deleteMany({ where: { conversationId: c.id, accountId: actor.accountId } });
        return { saved: true };
      }, true);
    },
    async upload(actor, conversationId, query, bytes, type) {
      const data = input.parse(z.strictObject({ name: z.string().trim().min(1).max(120) }), query);
      await access(prisma, actor, conversationId, true); storage.check();
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 5 * 1024 * 1024) throw fail(413, "Choose an image or PDF up to 5 MiB.");
      if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(type)) throw fail(415, "Choose an image or PDF document.");
      // Persist attempts before expensive decoding/storage. Removing draft files
      // or failing validation cannot reset the rolling daily processing budget.
      await transaction(actor, conversationId, async db => {
        const budget = await db.messagingUploadAttempt.aggregate({ where: { accountId: actor.accountId, createdAt: { gte: new Date(+now() - 86400000) } }, _count: true, _sum: { inputSize: true } });
        if (budget._count >= 50 || (budget._sum.inputSize || 0) + bytes.length > 50 * 1024 * 1024) throw fail(429, "Your daily message file limit has been reached.");
        await db.messagingUploadAttempt.create({ data: { accountId: actor.accountId, inputSize: bytes.length, createdAt: now() } });
      }, true);
      const processed = await processFile(bytes, type), key = `messages/${randomUUID()}`;
      await storage.put(key, processed.bytes, processed.contentType);
      try {
        return await transaction(actor, conversationId, async (db, c) => {
          const aggregate = await db.messageAttachment.aggregate({ where: { ownerId: actor.accountId, createdAt: { gte: new Date(+now() - 86400000) } }, _sum: { size: true }, _count: true });
          if (aggregate._count >= 50 || (aggregate._sum.size || 0) + processed.bytes.length > 50 * 1024 * 1024) throw fail(429, "Your daily message file limit has been reached.");
          if (await db.messageAttachment.count({ where: { conversationId: c.id, ownerId: actor.accountId, messageId: null, discardedAt: null, createdAt: { gte: new Date(+now() - 86400000) } } }) >= 12) throw fail(429, "Too many unused files in this conversation.");
          return db.messageAttachment.create({ data: { conversationId: c.id, ownerId: actor.accountId, storageKey: key, name: data.name.replace(/[\x00-\x1f\x7f/\\]/g, "_").replace(/\.[^.]+$/, "").slice(0, 115) + (processed.contentType === "application/pdf" ? ".pdf" : ".webp"), contentType: processed.contentType, size: processed.bytes.length, createdAt: now() }, select: fileSelect });
        }, true);
      } catch (e) { await storage.delete(key).catch(() => {}); throw e; }
    },
    async discardFile(actor, conversationId, fileId) {
      const assetId = input.parse(input.id, fileId);
      const row = await transaction(actor, conversationId, async (db, c) => {
        const file = await db.messageAttachment.findFirst({ where: { id: assetId, conversationId: c.id, ownerId: actor.accountId, messageId: null } });
        if (!file) throw unavailable();
        await db.messageAttachment.update({ where: { id: file.id }, data: { discardedAt: now() } });
        return file;
      });
      // Keep a tombstone until the private object is removed, so maintenance can
      // retry a storage outage without making discarded content accessible again.
      try { await storage.delete(row.storageKey); await prisma.messageAttachment.deleteMany({ where: { id: row.id, messageId: null, discardedAt: { not: null } } }); } catch { /* retryable by cleanupDraftFiles */ }
      return { discarded: true };
    },
    async cleanupDraftFiles() {
      storage.check();
      const cutoff = new Date(+now() - 86400000);
      const rows = await prisma.messageAttachment.findMany({ where: { messageId: null, OR: [{ discardedAt: { not: null } }, { createdAt: { lt: cutoff } }] }, orderBy: { createdAt: "asc" }, take: 100 });
      let deleted = 0;
      for (const row of rows) {
        const claimed = await prisma.messageAttachment.updateMany({ where: { id: row.id, messageId: null }, data: { discardedAt: now() } });
        if (!claimed.count) continue;
        try { await storage.delete(row.storageKey); deleted += (await prisma.messageAttachment.deleteMany({ where: { id: row.id, messageId: null, discardedAt: { not: null } } })).count; } catch { /* retain tombstone for the next maintenance run */ }
      }
      await prisma.messagingTyping.deleteMany({ where: { expiresAt: { lte: now() } } });
      await prisma.messagingUploadAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } });
      return { deleted, attempted: rows.length };
    },
    async file(actor, conversationId, fileId) {
      await access(prisma, actor, conversationId);
      const file = await prisma.messageAttachment.findFirst({ where: { id: input.parse(input.id, fileId), conversationId, discardedAt: null, OR: [{ messageId: { not: null } }, { ownerId: actor.accountId || "" }] } });
      if (!file) throw unavailable();
      const bytes = await storage.get(file.storageKey, { maxBytes: 5 * 1024 * 1024 });
      await access(prisma, actor, conversationId);
      return { bytes, contentType: file.contentType, name: file.name };
    },
    async official(actor, value) {
      const data = input.parse(input.officialInput, value), requestHash = digest(data);
      if (!actor.staffId) throw fail(403, "A separate management identity is required.");
      return prisma.$transaction(async db => {
        await lockReviewActors(db, data.recipientKind === "USER" ? [actor.staffId, data.recipientId] : [actor.staffId]); await auth(db, actor);
        if (data.recipientKind === "ORGANIZATION") await db.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${data.recipientId} FOR UPDATE`;
        const old = await db.managementAction.findUnique({ where: { actorId_requestKey: { actorId: actor.staffId, requestKey: data.requestKey } } });
        if (old) { if (old.requestHash !== requestHash) throw fail(409, "This official message key was already used."); return old.result; }
        if (await db.managementAction.count({ where: { actorId: actor.staffId, action: "OFFICIAL_MESSAGE", createdAt: { gte: new Date(+now() - 60000) } } }) >= 20) throw fail(429, "Official message limit reached.");
        const target = data.recipientKind === "USER" ? await db.account.findFirst({ where: { id: data.recipientId, status: "ACTIVE" } }) : await db.organization.findFirst({ where: { id: data.recipientId, status: "ACTIVE", request: { status: "APPROVED" } } });
        if (!target) throw fail(404, "This official recipient is unavailable.");
        const key = `official:${data.recipientKind}:${target.id}`;
        const c = await db.messagingConversation.upsert({ where: { key }, create: { key, kind: data.recipientKind === "USER" ? "OFFICIAL_USER" : "OFFICIAL_ORGANIZATION", ...(data.recipientKind === "USER" ? { recipientAccountId: target.id } : { organizationId: target.id }), updatedAt: now() }, update: { updatedAt: now() } });
        const m = await db.directMessage.create({ data: { conversationId: c.id, senderStaffId: actor.staffId, body: data.body, requestKey: data.requestKey, requestHash, createdAt: now() } });
        const result = { conversationId: c.id, messageId: m.id };
        await db.managementAction.create({ data: { actorId: actor.staffId, requestKey: data.requestKey, requestHash, action: "OFFICIAL_MESSAGE", targetType: data.recipientKind === "USER" ? "ACCOUNT" : "ORGANIZATION", targetId: target.id, reason: data.reason, result, createdAt: now() } });
        const recipients = data.recipientKind === "USER" ? [{ accountId: target.id }] : await db.organizationMembership.findMany({ where: { organizationId: target.id, enabled: true, role: "PRIMARY_ADMIN" }, select: { accountId: true } });
        for (const r of recipients) await notify(db, { recipientId: r.accountId, eventKey: m.id, kind: "OFFICIAL_MESSAGE", title: "BrightWay sent you an official message", href: data.recipientKind === "USER" ? `/messages?conversation=${c.id}` : `/organization-workspace/${target.id}/messages?conversation=${c.id}` });
        return result;
      }, { timeout: 15000 });
    },
    async snapshot(actor, query = {}) {
      await auth(prisma, actor);
      if (query.organizationId && !actor.staffId) await organizationAccess(prisma, actor, query.organizationId);
      const scope = actor.staffId ? Prisma.sql`c.kind <> 'DIRECT'`
        : query.organizationId ? Prisma.sql`c."organizationId" = ${query.organizationId}`
        : Prisma.sql`(c."leftAccountId" = ${actor.accountId} OR c."rightAccountId" = ${actor.accountId} OR c."recipientAccountId" = ${actor.accountId})`;
      const rows = await prisma.$queryRaw(Prisma.sql`
        SELECT c.id, c."updatedAt", COUNT(m.id)::int AS count,
          MAX(m."deliveredAt") AS delivered, MAX(m."readAt") AS read,
          COUNT(m.id) FILTER (WHERE m."readAt" IS NULL)::int AS unread
        FROM "MessagingConversation" c LEFT JOIN "DirectMessage" m ON m."conversationId" = c.id
        LEFT JOIN "NetworkPair" np ON np."leftAccountId" = c."leftAccountId" AND np."rightAccountId" = c."rightAccountId"
        LEFT JOIN "Account" la ON la.id = c."leftAccountId"
        LEFT JOIN "Account" ra ON ra.id = c."rightAccountId"
        WHERE ${scope} AND (c.kind <> 'DIRECT' OR (COALESCE(np."leftBlocked" OR np."rightBlocked", false) IS FALSE AND la.status = 'ACTIVE' AND ra.status = 'ACTIVE'))
        GROUP BY c.id ORDER BY c."updatedAt" DESC, c.id DESC LIMIT 100`);
      const result = { messages: digest(rows.map(c => [c.id, c.count, c.unread])), delivered: digest(rows.map(c => [c.id, c.delivered])), read: digest(rows.map(c => [c.id, c.read])) };
      if (query.conversationId) {
        const c = await access(prisma, actor, query.conversationId);
        if (query.organizationId && c.organizationId !== query.organizationId) throw unavailable();
        // Includes receipts on older messages, not only the inbox preview.
        const latest = await prisma.directMessage.findMany({ where: { conversationId: c.id }, select: { id: true, deliveredAt: true, readAt: true }, orderBy: { sequence: "desc" }, take: 40 });
        result.delivered = digest(latest.map(m => [m.id, m.deliveredAt])); result.read = digest(latest.map(m => [m.id, m.readAt]));
        if (!actor.staffId) result.presence = await presence(prisma, actor, c);
      }
      return result;
    },
  };
  return service;
}
