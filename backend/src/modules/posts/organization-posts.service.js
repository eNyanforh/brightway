import { z } from "zod";
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
const identifier = z.uuid();
const postInput = z.strictObject({
  body: z.string().trim().min(1).max(2000).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)),
  requestKey: identifier,
});
const cursorInput = z.string().min(1).max(700).optional();
const feedQuery = z.strictObject({ view: z.enum(["for-you", "following"]).default("for-you"), cursor: cursorInput });
const workspaceQuery = z.strictObject({ cursor: cursorInput });
const cursorSchema = z.strictObject({ viewer: identifier, scope: z.string(), at: z.iso.datetime(), id: identifier });

function parse(schema, data, message) {
  const result = schema.safeParse(data);
  if (!result.success) throw fail(400, message);
  return result.data;
}

function pageBoundary(cursor, viewer, scope) {
  if (!cursor) return {};
  try {
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (parsed.viewer !== viewer || parsed.scope !== scope) throw Error();
    const createdAt = new Date(parsed.at);
    return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: parsed.id } }] };
  } catch {
    throw fail(400, "Reload the post list to get a current page link.");
  }
}

async function page(db, viewer, scope, cursor, where) {
  const rows = await db.organizationPost.findMany({
    where: { ...where, withdrawnAt: null, ...pageBoundary(cursor, viewer, scope) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: postSelect,
    take: pageSize + 1,
  });
  const items = rows.slice(0, pageSize);
  const last = items.at(-1);
  const nextCursor = rows.length > pageSize
    ? Buffer.from(JSON.stringify({ viewer, scope, at: last.createdAt.toISOString(), id: last.id })).toString("base64url")
    : null;
  return { items, nextCursor };
}

export function createOrganizationPosts({ prisma, now = () => new Date() }) {
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
      const blocked = [{ leftBlocked: true }, { rightBlocked: true }];
      const organization = { ...readyFilter };
      if (view === "following") organization.followers = { some: { followerId: actor.accountId, active: true } };
      const result = await page(prisma, actor.accountId, view, cursor, {
        organization,
        author: {
          networkLeft: { none: { rightAccountId: actor.accountId, OR: blocked } },
          networkRight: { none: { leftAccountId: actor.accountId, OR: blocked } },
        },
      });
      await assertNetworkSession(prisma, actor, now);
      return result;
    },

    async list(actor, inputId, query) {
      const organizationId = parse(identifier, inputId, "Choose a valid organization.");
      const { cursor } = parse(workspaceQuery, query, "Reload the organization posts page.");
      return prisma.$transaction(async tx => {
        await publisher(tx, actor, organizationId);
        const result = await page(tx, actor.accountId, organizationId, cursor, { organizationId });
        await publisher(tx, actor, organizationId);
        return result;
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
