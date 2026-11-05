import { z } from "zod";
import { createManualIdentityReviewService } from "../manual-identity/manual-identity-review.service.js";
import { assertMfaSession } from "../auth/mfa.service.js";
import { assertNetworkSession, lockNetworkAccounts } from "../network/network-authority.js";
import { fail } from "../network/network.schema.js";
import { requireOrganizationProfile } from "../organizations/organization-profile.schema.js";

const publishPermission = "organization.posts.publish";
const pageSize = 20;
const organizationFilter = { status: "ACTIVE", request: { status: "APPROVED" } };
const readyFilter = {
  ...organizationFilter,
  profileReadyAt: { not: null },
  profilePhotoId: { not: null },
  username: { not: null },
  profileSetupStep: 5,
};
const postSelect = {
  id: true, body: true, createdAt: true,
  organization: { select: { id: true, name: true, username: true } },
};
const memberPostSelect = {
  id: true, body: true, createdAt: true,
  author: { select: { id: true, username: true, person: { select: { firstName: true, middleName: true, lastName: true } } } },
};
const identifier = z.uuid();
const postInput = z.strictObject({
  body: z.string().trim().min(1).max(2000).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)),
  requestKey: identifier,
});
const cursorInput = z.string().min(1).max(700).optional();
const feedQuery = z.strictObject({ view: z.enum(["for-you", "following"]).default("for-you"), cursor: cursorInput });
const workspaceQuery = z.strictObject({ cursor: cursorInput });
const cursorSchema = z.strictObject({ viewer: identifier, scope: z.string(), at: z.iso.datetime(), id: identifier, source: z.enum(["organization", "member"]).default("organization") });

function parse(schema, data, message) {
  const result = schema.safeParse(data);
  if (!result.success) throw fail(400, message);
  return result.data;
}

function readCursor(cursor, viewer, scope) {
  if (!cursor) return null;
  try {
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (parsed.viewer !== viewer || parsed.scope !== scope) throw Error();
    return { ...parsed, createdAt: new Date(parsed.at) };
  } catch {
    throw fail(400, "Reload the post list to get a current page link.");
  }
}

function boundary(cursor, source) {
  if (!cursor) return {};
  const { createdAt, id } = cursor;
  return { OR: [
    { createdAt: { lt: createdAt } },
    { createdAt, id: source < cursor.source ? { lte: id } : { lt: id } },
  ] };
}

function cursorFor(rows, viewer, scope) {
  if (rows.length <= pageSize) return null;
  const last = rows[pageSize - 1];
  const source = last.author ? "member" : "organization";
  return Buffer.from(JSON.stringify({ viewer, scope, at: last.createdAt.toISOString(), id: last.id, source })).toString("base64url");
}

function memberPost({ author, ...post }) {
  const { firstName, middleName, lastName } = author.person;
  return { ...post, member: { username: author.username, name: [firstName, middleName, lastName].filter(Boolean).join(" ") } };
}

function findPosts(model, select, where, cursor, source) {
  return model.findMany({
    where: { ...where, withdrawnAt: null, ...boundary(cursor, source) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select,
    take: pageSize + 1,
  });
}

export function createOrganizationPosts({ prisma, now = () => new Date() }) {
  const identity = createManualIdentityReviewService({ prisma, now });

  async function memberEligibility(db, accountId) {
    const { status, ctx } = await identity.inspectAccount(db, accountId);
    return { identityVerified: status === "APPROVED", profilePublic: ctx.profilePublic };
  }

  async function memberWrite(actor, operation) {
    await assertNetworkSession(prisma, actor, now);
    return prisma.$transaction(async tx => {
      await lockNetworkAccounts(tx, [actor.accountId]);
      await assertNetworkSession(tx, actor, now);
      const result = await operation(tx);
      await assertNetworkSession(tx, actor, now);
      return result;
    });
  }

  async function publisher(db, actor, organizationId) {
    await assertNetworkSession(db, actor, now);
    const organization = await db.organization.findFirst({ where: { id: organizationId, ...organizationFilter } });
    if (!organization) throw fail(404, "This organization workspace is unavailable.");
    const membership = await db.organizationMembership.findFirst({
      where: { organizationId, accountId: actor.accountId, enabled: true },
      select: { role: true, permissions: true, account: { select: { emailVerifiedAt: true } } },
    });
    if (!membership || (membership.role !== "PRIMARY_ADMIN" && !membership.permissions.includes(publishPermission))) {
      throw fail(403, "Your role does not include permission to publish organization posts.");
    }
    requireOrganizationProfile(organization);
    if (!membership.account.emailVerifiedAt) throw fail(403, "Verify your email before managing organization posts.");
    try {
      await assertMfaSession(db, actor.accountId, actor.sessionId, now());
    } catch (error) {
      if (error.status === 403) throw fail(403, "Sign in with two-factor authentication to manage organization posts.");
      throw error;
    }
  }

  async function write(actor, organizationId, operation) {
    await assertNetworkSession(prisma, actor, now);
    return prisma.$transaction(async tx => {
      // Staff changes take the same account and organization row locks.
      await lockNetworkAccounts(tx, [actor.accountId]);
      await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`;
      await publisher(tx, actor, organizationId);
      const data = await operation(tx);
      await publisher(tx, actor, organizationId);
      return data;
    });
  }

  async function audit(db, actor, organizationId, action, entityId) {
    await db.organizationStaffAudit.create({
      data: { organizationId, actorId: actor.accountId, action, entityId, data: {} },
    });
  }

  return {
    async feed(actor, query) {
      const { view, cursor } = parse(feedQuery, query, "Choose a valid Explore view.");
      await assertNetworkSession(prisma, actor, now);
      const position = readCursor(cursor, actor.accountId, view);
      const blocked = [{ leftBlocked: true }, { rightBlocked: true }];
      const unblocked = {
        networkLeft: { none: { rightAccountId: actor.accountId, OR: blocked } },
        networkRight: { none: { leftAccountId: actor.accountId, OR: blocked } },
      };
      const organization = { ...readyFilter };
      const member = {
        ...unblocked,
        status: "ACTIVE",
        manualIdentityRequest: { state: "APPROVED" },
        person: { profile: { profilePublicEnabled: true } },
      };
      if (view === "following") {
        const followers = { some: { followerId: actor.accountId, active: true } };
        organization.followers = followers;
        member.followers = followers;
      }
      const [organizations, members] = await Promise.all([
        findPosts(prisma.organizationPost, postSelect, { organization, author: unblocked }, position, "organization"),
        findPosts(prisma.memberPost, memberPostSelect, { author: member }, position, "member"),
      ]);
      const rows = [...organizations, ...members].sort((a, b) =>
        b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : Number(Boolean(a.author)) - Number(Boolean(b.author))));
      const candidates = rows.slice(0, pageSize);
      // Approval can become invalid when identity details or verified records change.
      // Inspect each candidate author once and advance past hidden rows on the next page.
      const authorIds = [...new Set(candidates.filter(post => post.author).map(post => post.author.id))];
      const eligible = new Set();
      for (let offset = 0; offset < authorIds.length; offset += 4) {
        await Promise.all(authorIds.slice(offset, offset + 4).map(async id => {
          try {
            const access = await memberEligibility(prisma, id);
            if (access.identityVerified && access.profilePublic) eligible.add(id);
          } catch (error) {
            if (error.status !== 403) throw error;
          }
        }));
      }
      await assertNetworkSession(prisma, actor, now);
      return {
        items: candidates.filter(post => !post.author || eligible.has(post.author.id)).map(post => post.author ? memberPost(post) : post),
        nextCursor: cursorFor(rows, actor.accountId, view),
      };
    },

    async memberList(actor, query) {
      const { cursor } = parse(workspaceQuery, query, "Reload your posts page.");
      await assertNetworkSession(prisma, actor, now);
      const position = readCursor(cursor, actor.accountId, "my-posts");
      const [access, rows] = await Promise.all([
        memberEligibility(prisma, actor.accountId),
        findPosts(prisma.memberPost, memberPostSelect, { authorId: actor.accountId }, position, "member"),
      ]);
      await assertNetworkSession(prisma, actor, now);
      return { access, items: rows.slice(0, pageSize).map(memberPost), nextCursor: cursorFor(rows, actor.accountId, "my-posts") };
    },

    async memberPublish(actor, input) {
      const data = parse(postInput, input, "Enter a post with 1 to 2,000 characters.");
      return memberWrite(actor, async tx => {
        // Public-profile updates lock this same row.
        await tx.$queryRaw`SELECT p."id" FROM "Profile" p JOIN "Account" a ON a."personId" = p."personId" WHERE a."id" = ${actor.accountId} FOR UPDATE OF p`;
        const access = await memberEligibility(tx, actor.accountId);
        if (!access.identityVerified) throw fail(403, "Verify your identity before publishing a personal post.");
        if (!access.profilePublic) throw fail(403, "Publish your public profile before sharing personal posts.");
        const key = { authorId: actor.accountId, requestKey: data.requestKey };
        const previous = await tx.memberPost.findUnique({ where: { authorId_requestKey: key }, select: { ...memberPostSelect, withdrawnAt: true } });
        if (previous) {
          const { withdrawnAt, ...post } = previous;
          if (withdrawnAt || post.body !== data.body) throw fail(409, "This publishing request already belongs to another post. Edit your draft before trying again.");
          return { post: memberPost(post) };
        }
        const recent = await tx.memberPost.count({ where: { authorId: actor.accountId, createdAt: { gte: new Date(+now() - 900000) } } });
        if (recent >= 20) throw fail(429, "You have reached the publishing limit. Try again in 15 minutes.");
        const post = await tx.memberPost.create({ data: { ...key, body: data.body, createdAt: now() }, select: memberPostSelect });
        return { post: memberPost(post) };
      });
    },

    async memberWithdraw(actor, inputId) {
      const id = parse(identifier, inputId, "Choose a valid post.");
      return memberWrite(actor, async tx => {
        const post = await tx.memberPost.findFirst({ where: { id, authorId: actor.accountId }, select: { withdrawnAt: true } });
        if (!post) throw fail(404, "This post is unavailable.");
        if (!post.withdrawnAt) await tx.memberPost.update({ where: { id }, data: { withdrawnAt: now() } });
        return { id };
      });
    },

    async list(actor, inputId, query) {
      const organizationId = parse(identifier, inputId, "Choose a valid organization.");
      const { cursor } = parse(workspaceQuery, query, "Reload the organization posts page.");
      return prisma.$transaction(async tx => {
        await publisher(tx, actor, organizationId);
        const position = readCursor(cursor, actor.accountId, organizationId);
        const rows = await findPosts(tx.organizationPost, postSelect, { organizationId }, position, "organization");
        await publisher(tx, actor, organizationId);
        return { items: rows.slice(0, pageSize), nextCursor: cursorFor(rows, actor.accountId, organizationId) };
      });
    },

    async publish(actor, inputId, input) {
      const organizationId = parse(identifier, inputId, "Choose a valid organization.");
      const data = parse(postInput, input, "Enter a post with 1 to 2,000 characters.");
      return write(actor, organizationId, async tx => {
        const key = { organizationId, authorId: actor.accountId, requestKey: data.requestKey };
        const previous = await tx.organizationPost.findUnique({
          where: { organizationId_authorId_requestKey: key },
          select: { ...postSelect, withdrawnAt: true },
        });
        if (previous) {
          const { withdrawnAt, ...post } = previous;
          if (withdrawnAt || post.body !== data.body) throw fail(409, "This publishing request already belongs to another post. Edit your draft before trying again.");
          return { post };
        }
        const recent = await tx.organizationPost.count({
          where: { authorId: actor.accountId, createdAt: { gte: new Date(+now() - 900000) } },
        });
        if (recent >= 20) throw fail(429, "You have reached the publishing limit. Try again in 15 minutes.");
        const post = await tx.organizationPost.create({ data: { ...key, body: data.body, createdAt: now() }, select: postSelect });
        await audit(tx, actor, organizationId, "POST_PUBLISHED", post.id);
        return { post };
      });
    },

    async withdraw(actor, inputId, inputPostId) {
      const organizationId = parse(identifier, inputId, "Choose a valid organization.");
      const id = parse(identifier, inputPostId, "Choose a valid post.");
      return write(actor, organizationId, async tx => {
        const post = await tx.organizationPost.findFirst({ where: { id, organizationId }, select: { withdrawnAt: true } });
        if (!post) throw fail(404, "This post is unavailable.");
        if (!post.withdrawnAt) {
          await tx.organizationPost.update({ where: { id }, data: { withdrawnAt: now() } });
          await audit(tx, actor, organizationId, "POST_WITHDRAWN", id);
        }
        return { id };
      });
    },
  };
}
