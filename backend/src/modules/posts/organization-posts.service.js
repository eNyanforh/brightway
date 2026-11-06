import { z } from "zod";
import { MAX_POST_TOPICS, normalizePostTopic } from "../../../../shared/post-topics.mjs";
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
const memberSelect = { id: true, username: true, person: { select: { firstName: true, middleName: true, lastName: true } } };
const memberPostSelect = { id: true, type: true, tags: true, body: true, createdAt: true, author: { select: memberSelect } };
const repostSelect = { id: true, createdAt: true, account: { select: memberSelect } };
const identifier = z.uuid();
const sourceInput = z.enum(["organization", "member"]);
const likeInput = z.strictObject({ liked: z.boolean() });
const repostInput = z.strictObject({ reposted: z.boolean() });
const saveInput = z.strictObject({ saved: z.boolean() });
const textInput = max => z.strictObject({
  body: z.string().trim().min(1).max(max).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)),
  requestKey: identifier,
});
const postInput = textInput(2000);
const topicTags = z.array(z.string().transform(normalizePostTopic).pipe(z.string()))
  .max(MAX_POST_TOPICS)
  .refine(tags => new Set(tags.map(tag => tag.toLowerCase())).size === tags.length);
const memberPostInput = postInput.extend({
  type: z.enum(["POST", "ACHIEVEMENT", "EVENT", "QUESTION"]).default("POST"),
  tags: topicTags.default([]),
});
const commentInput = textInput(1000);
const commentSelect = {
  id: true, body: true, createdAt: true,
  author: { select: { id: true, username: true } },
};
const cursorInput = z.string().min(1).max(700).optional();
const feedQuery = z.strictObject({ view: z.enum(["for-you", "following", "saved"]).default("for-you"), cursor: cursorInput });
const workspaceQuery = z.strictObject({ cursor: cursorInput });
const cursorSchema = z.strictObject({ viewer: identifier, scope: z.string(), at: z.iso.datetime(), id: identifier, source: z.enum(["organization", "member", "repost", "saved"]).default("organization") });

function parse(schema, data, message) {
  const result = schema.safeParse(data);
  if (!result.success) throw fail(400, message);
  return result.data;
}

function postRef(sourceValue, idValue) {
  return {
    source: parse(sourceInput, sourceValue, "Choose a valid post type."),
    id: parse(identifier, idValue, "Choose a valid post."),
  };
}

function postTarget({ source, id }) {
  return source === "member" ? { memberPostId: id } : { organizationPostId: id };
}

function commentView({ author, ...comment }, viewerId) {
  return { ...comment, username: author.username, canDelete: author.id === viewerId };
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

function feedSource(row) {
  if (row.account) return "repost";
  return row.author ? "member" : "organization";
}

function cursorFor(rows, viewer, scope, source) {
  if (rows.length <= pageSize) return null;
  const last = rows[pageSize - 1];
  const kind = source ?? feedSource(last);
  return Buffer.from(JSON.stringify({ viewer, scope, at: last.createdAt.toISOString(), id: last.id, source: kind })).toString("base64url");
}

function unblockedAuthor(accountId) {
  const blocked = [{ leftBlocked: true }, { rightBlocked: true }];
  return {
    networkLeft: { none: { rightAccountId: accountId, OR: blocked } },
    networkRight: { none: { leftAccountId: accountId, OR: blocked } },
  };
}

function visibleMember(accountId) {
  return {
    ...unblockedAuthor(accountId),
    status: "ACTIVE",
    manualIdentityRequest: { state: "APPROVED" },
    person: { profile: { profilePublicEnabled: true } },
  };
}

function likeSelect(accountId) {
  return { _count: { select: { likes: true } }, likes: { where: { accountId }, select: { id: true } } };
}

function likeSummary({ likes, _count }) {
  return { liked: likes.length > 0, count: _count.likes };
}

function memberAttribution({ username, person }) {
  const { firstName, middleName, lastName } = person;
  return { username, name: [firstName, middleName, lastName].filter(Boolean).join(" ") };
}

function feedPost({ likes, _count, saves, reposts, ...post }) {
  return {
    ...(post.author ? memberPost(post) : post),
    reaction: likeSummary({ likes, _count }),
    saved: saves.length > 0,
    reposted: reposts.length > 0,
  };
}

function memberPost({ author, ...post }) {
  return { ...post, member: memberAttribution(author) };
}

function repostAttribution(row, viewer) {
  return { id: row.id, createdAt: row.createdAt, member: memberAttribution(row.account), mine: row.account.id === viewer };
}

function blockPair(left, right) {
  const [leftAccountId, rightAccountId] = [left, right].sort();
  return { leftAccountId, rightAccountId };
}

function pairKey({ leftAccountId, rightAccountId }) {
  return leftAccountId + ":" + rightAccountId;
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

  async function projectVisiblePosts(candidates, viewer) {
    // Reuse one identity check per author across original and reposted cards.
    const entries = candidates.map(row => ({ row, post: row.account ? row.memberPost ?? row.organizationPost : row }))
      .filter(entry => entry.post);
    const authorIds = new Set();
    const pairs = new Map();
    for (const { row, post } of entries) {
      if (post.author) authorIds.add(post.author.id);
      if (row.account) {
        authorIds.add(row.account.id);
        const pair = blockPair(row.account.id, post.author?.id ?? post.authorId);
        if (pair.leftAccountId !== pair.rightAccountId) pairs.set(pairKey(pair), pair);
      }
    }
    const blocked = pairs.size ? await prisma.networkPair.findMany({
      where: { AND: [{ OR: [...pairs.values()] }, { OR: [{ leftBlocked: true }, { rightBlocked: true }] }] },
      select: { leftAccountId: true, rightAccountId: true },
    }) : [];
    const blockedKeys = new Set(blocked.map(pairKey));
    const eligible = new Set();
    const authors = [...authorIds];
    for (let offset = 0; offset < authors.length; offset += 4) {
      await Promise.all(authors.slice(offset, offset + 4).map(async id => {
        try {
          const access = await memberEligibility(prisma, id);
          if (access.identityVerified && access.profilePublic) eligible.add(id);
        } catch (error) {
          if (error.status !== 403) throw error;
        }
      }));
    }
    const items = [];
    for (const { row, post } of entries) {
      if (post.author && !eligible.has(post.author.id)) continue;
      const { authorId, ...original } = post;
      if (!row.account) {
        items.push(feedPost(original));
        continue;
      }
      if (!eligible.has(row.account.id) || blockedKeys.has(pairKey(blockPair(row.account.id, post.author?.id ?? authorId)))) continue;
      items.push({ ...feedPost(original), repost: repostAttribution(row, viewer) });
    }
    return items;
  }

  async function savedFeed(accountId, position, select) {
    const rows = await prisma.postSave.findMany({
      where: {
        accountId,
        AND: [
          boundary(position, "saved"),
          { OR: [
            { memberPost: { withdrawnAt: null, author: visibleMember(accountId) } },
            { organizationPost: { withdrawnAt: null, organization: readyFilter, author: unblockedAuthor(accountId) } },
          ] },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        createdAt: true,
        memberPost: { select: { ...memberPostSelect, ...select } },
        organizationPost: { select: { ...postSelect, ...select } },
      },
      take: pageSize + 1,
    });
    const posts = rows.slice(0, pageSize)
      .map(row => row.memberPost ?? row.organizationPost)
      .filter(post => post?.saves.length);
    return { items: await projectVisiblePosts(posts, accountId), nextCursor: cursorFor(rows, accountId, "saved", "saved") };
  }

  async function lockMemberProfile(db, id) {
    await db.$queryRaw`SELECT p."id" FROM "Profile" p JOIN "Account" a ON a."personId" = p."personId" WHERE a."id" = ${id} FOR UPDATE OF p`;
  }

  async function lockOrganization(db, id) {
    await db.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${id} FOR UPDATE`;
  }

  const unavailable = () => fail(404, "This post is no longer available.");

  function postModel(db, source) {
    return source === "member" ? db.memberPost : db.organizationPost;
  }

  async function visiblePost(db, viewer, { source, id }) {
    const member = source === "member";
    const author = member ? visibleMember(viewer) : unblockedAuthor(viewer);
    const where = { id, withdrawnAt: null, author, ...(!member && { organization: readyFilter }) };
    const target = await postModel(db, source).findFirst({ where, select: { authorId: true } });
    if (!target) throw unavailable();
    if (member) {
      const access = await memberEligibility(db, target.authorId);
      if (!access.identityVerified || !access.profilePublic) throw unavailable();
    }
    return target;
  }

  async function writeVisiblePost(actor, ref, operation) {
    await assertNetworkSession(prisma, actor, now);
    const { source, id } = ref;
    const member = source === "member";
    const select = member ? { authorId: true } : { authorId: true, organizationId: true };
    const target = await postModel(prisma, source).findUnique({ where: { id }, select });
    if (!target) throw unavailable();

    return prisma.$transaction(async tx => {
      // Match block and post mutation lock order before rechecking visibility.
      await lockNetworkAccounts(tx, [actor.accountId, target.authorId]);
      await assertNetworkSession(tx, actor, now);
      if (member) await lockMemberProfile(tx, target.authorId);
      else await lockOrganization(tx, target.organizationId);

      await visiblePost(tx, actor.accountId, ref);
      const result = await operation(tx);
      await assertNetworkSession(tx, actor, now);
      return result;
    });
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
      await lockOrganization(tx, organizationId);
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
      const ownActivity = { where: { accountId: actor.accountId }, select: { id: true } };
      const select = { ...likeSelect(actor.accountId), saves: ownActivity, reposts: ownActivity };
      if (view === "saved") {
        const page = await savedFeed(actor.accountId, position, select);
        await assertNetworkSession(prisma, actor, now);
        return page;
      }
      const organization = { ...readyFilter };
      const member = visibleMember(actor.accountId);
      const reposter = { ...member };
      if (view === "following") {
        const followers = { some: { followerId: actor.accountId, active: true } };
        organization.followers = followers;
        member.followers = followers;
        reposter.followers = followers;
      }
      const [organizations, members, reposts] = await Promise.all([
        findPosts(prisma.organizationPost, { ...postSelect, ...select }, { organization, author: unblockedAuthor(actor.accountId) }, position, "organization"),
        findPosts(prisma.memberPost, { ...memberPostSelect, ...select }, { author: member }, position, "member"),
        prisma.postRepost.findMany({
          where: {
            account: reposter,
            AND: [
              boundary(position, "repost"),
              { OR: [
                { memberPost: { withdrawnAt: null, author: visibleMember(actor.accountId) } },
                { organizationPost: { withdrawnAt: null, organization: readyFilter, author: unblockedAuthor(actor.accountId) } },
              ] },
            ],
          },
          select: {
            ...repostSelect,
            memberPost: { select: { ...memberPostSelect, ...select } },
            organizationPost: { select: { ...postSelect, ...select, authorId: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: pageSize + 1,
        }),
      ]);
      const rows = [...organizations, ...members, ...reposts].sort((a, b) =>
        b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : feedSource(b).localeCompare(feedSource(a))));
      const items = await projectVisiblePosts(rows.slice(0, pageSize), actor.accountId);
      await assertNetworkSession(prisma, actor, now);
      return {
        items,
        nextCursor: cursorFor(rows, actor.accountId, view),
      };
    },

    async setLike(actor, sourceValue, idValue, input) {
      const ref = postRef(sourceValue, idValue);
      const { liked } = parse(likeInput, input, "Choose whether to like this post.");
      return writeVisiblePost(actor, ref, async tx => {
        const data = { accountId: actor.accountId, ...postTarget(ref) };
        if (liked) await tx.postLike.createMany({ data: [data], skipDuplicates: true });
        else await tx.postLike.deleteMany({ where: data });
        const post = await postModel(tx, ref.source).findUniqueOrThrow({ where: { id: ref.id }, select: likeSelect(actor.accountId) });
        return { reaction: likeSummary(post) };
      });
    },

    async setSaved(actor, sourceValue, idValue, input) {
      const ref = postRef(sourceValue, idValue);
      const { saved } = parse(saveInput, input, "Choose whether to save this post.");
      const data = { ...postTarget(ref), accountId: actor?.accountId };
      if (!saved) {
        // Removing a private bookmark remains possible if the original post is hidden.
        return memberWrite(actor, async tx => {
          await tx.postSave.deleteMany({ where: data });
          return { saved: false };
        });
      }
      return writeVisiblePost(actor, ref, async tx => {
        await tx.postSave.createMany({ data: [{ ...data, createdAt: now() }], skipDuplicates: true });
        return { saved: true };
      });
    },

    async setReposted(actor, sourceValue, idValue, input) {
      const ref = postRef(sourceValue, idValue);
      const { reposted } = parse(repostInput, input, "Choose whether to repost this post.");
      const data = { ...postTarget(ref), accountId: actor?.accountId };
      if (!reposted) {
        return memberWrite(actor, async tx => {
          await tx.postRepost.deleteMany({ where: data });
          return { reposted: false };
        });
      }

      return writeVisiblePost(actor, ref, async tx => {
        await lockMemberProfile(tx, actor.accountId);
        const access = await memberEligibility(tx, actor.accountId);
        if (!access.identityVerified || !access.profilePublic) {
          throw fail(403, "Verify your identity and publish your public profile before reposting.");
        }
        await tx.postRepost.createMany({ data: [{ ...data, createdAt: now() }], skipDuplicates: true });
        const row = await tx.postRepost.findFirstOrThrow({ where: data, select: repostSelect });
        return { reposted: true, repost: repostAttribution(row, actor.accountId) };
      });
    },

    async comments(actor, sourceValue, idValue, query) {
      const ref = postRef(sourceValue, idValue);
      const { cursor } = parse(workspaceQuery, query, "Reload the comments to get a current page link.");
      await assertNetworkSession(prisma, actor, now);
      const scope = `comments:${ref.source}:${ref.id}`;
      const position = readCursor(cursor, actor.accountId, scope);
      const target = await visiblePost(prisma, actor.accountId, ref);
      const author = {
        status: "ACTIVE",
        AND: [unblockedAuthor(actor.accountId), unblockedAuthor(target.authorId)],
      };
      const rows = await prisma.postComment.findMany({
        where: { ...postTarget(ref), deletedAt: null, author, ...boundary(position, ref.source) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: commentSelect,
        take: pageSize + 1,
      });
      await assertNetworkSession(prisma, actor, now);
      return { items: rows.slice(0, pageSize).map(row => commentView(row, actor.accountId)), nextCursor: cursorFor(rows, actor.accountId, scope, ref.source) };
    },

    async addComment(actor, sourceValue, idValue, input) {
      const ref = postRef(sourceValue, idValue);
      const { body, requestKey } = parse(commentInput, input, "Enter a comment with 1 to 1,000 characters.");
      return writeVisiblePost(actor, ref, async tx => {
        const { emailVerifiedAt } = await tx.account.findUniqueOrThrow({ where: { id: actor.accountId }, select: { emailVerifiedAt: true } });
        if (!emailVerifiedAt) throw fail(403, "Verify your email before commenting.");

        const target = postTarget(ref);
        const key = { authorId: actor.accountId, requestKey };
        const previous = await tx.postComment.findUnique({
          where: { authorId_requestKey: key },
          select: { ...commentSelect, deletedAt: true, memberPostId: true, organizationPostId: true },
        });
        if (previous) {
          const { deletedAt, memberPostId, organizationPostId, ...comment } = previous;
          if (deletedAt || comment.body !== body ||
              (target.memberPostId ?? null) !== memberPostId || (target.organizationPostId ?? null) !== organizationPostId) {
            throw fail(409, "This request already belongs to another comment. Edit your draft before trying again.");
          }
          return { comment: commentView(comment, actor.accountId) };
        }

        const recent = await tx.postComment.count({ where: { authorId: actor.accountId, createdAt: { gte: new Date(+now() - 900000) } } });
        if (recent >= 20) throw fail(429, "You have reached the commenting limit. Try again in 15 minutes.");
        const comment = await tx.postComment.create({ data: { ...key, ...target, body, createdAt: now() }, select: commentSelect });
        return { comment: commentView(comment, actor.accountId) };
      });
    },

    async deleteComment(actor, sourceValue, idValue, commentValue) {
      const ref = postRef(sourceValue, idValue);
      const id = parse(identifier, commentValue, "Choose a valid comment.");
      return writeVisiblePost(actor, ref, async tx => {
        const comment = await tx.postComment.findFirst({
          where: { id, authorId: actor.accountId, ...postTarget(ref) },
          select: { deletedAt: true },
        });
        if (!comment) throw fail(404, "This comment is unavailable.");
        if (!comment.deletedAt) await tx.postComment.update({ where: { id }, data: { deletedAt: now(), body: "" } });
        return { id };
      });
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
      const data = parse(memberPostInput, input, "Choose a post type, write 1 to 2,000 characters, and add 1 to 5 distinct topic tags.");
      return memberWrite(actor, async tx => {
        // Public-profile updates lock this same row.
        await lockMemberProfile(tx, actor.accountId);
        const access = await memberEligibility(tx, actor.accountId);
        if (!access.identityVerified) throw fail(403, "Verify your identity before publishing a personal post.");
        if (!access.profilePublic) throw fail(403, "Publish your public profile before sharing personal posts.");
        const key = { authorId: actor.accountId, requestKey: data.requestKey };
        const previous = await tx.memberPost.findUnique({ where: { authorId_requestKey: key }, select: { ...memberPostSelect, withdrawnAt: true } });
        if (previous) {
          const { withdrawnAt, ...post } = previous;
          const sameTags = post.tags.length === data.tags.length && post.tags.every((tag, index) => tag === data.tags[index]);
          if (withdrawnAt || post.body !== data.body || post.type !== data.type || !sameTags) throw fail(409, "This publishing request already belongs to another post. Edit your draft before trying again.");
          return { post: memberPost(post) };
        }
        // An older tagless post may be retried, but new posts require a topic.
        if (!data.tags.length) throw fail(400, "Add at least one topic tag before publishing.");
        const recent = await tx.memberPost.count({ where: { authorId: actor.accountId, createdAt: { gte: new Date(+now() - 900000) } } });
        if (recent >= 20) throw fail(429, "You have reached the publishing limit. Try again in 15 minutes.");
        const post = await tx.memberPost.create({ data: { ...key, type: data.type, tags: data.tags, body: data.body, createdAt: now() }, select: memberPostSelect });
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
