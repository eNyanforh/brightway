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
  organization: { select: { id: true, name: true, username: true, profilePhotoId: true } },
};
const memberSelect = { id: true, username: true, person: { select: { firstName: true, middleName: true, lastName: true, profile: { select: { photoId: true } } } } };
const memberPostSelect = { id: true, type: true, tags: true, eventDetails: true, questionDetails: true, body: true, createdAt: true, author: { select: memberSelect } };
const repostSelect = { id: true, createdAt: true, account: { select: memberSelect } };
const identifier = z.uuid();
// Legacy member usernames may predate the stricter signup validator.
const publicPhotoUsername = z.string().trim().min(1).max(120);
const sourceInput = z.enum(["organization", "member"]);
const likeInput = z.strictObject({ liked: z.boolean() });
const repostInput = z.strictObject({ reposted: z.boolean() });
const saveInput = z.strictObject({ saved: z.boolean() });
const registrationInput = z.strictObject({ registered: z.boolean() });
const voteInput = z.strictObject({ value: z.union([z.literal(-1), z.literal(0), z.literal(1)]) });
const answerSortInput = z.strictObject({ sort: z.enum(["top", "newest"]).default("top") });
const reportInput = z.strictObject({
  reason: z.enum(["SPAM", "HARASSMENT", "MISINFORMATION", "OTHER"]),
  details: z.string().trim().max(500).optional(),
});
const textInput = max => z.strictObject({
  body: z.string().trim().min(1).max(max).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)),
  requestKey: identifier,
});
const postInput = textInput(2000);
const topicTags = z.array(z.string().transform(normalizePostTopic).pipe(z.string()))
  .max(MAX_POST_TOPICS)
  .refine(tags => new Set(tags.map(tag => tag.toLowerCase())).size === tags.length);
const eventDetailsInput = z.strictObject({
  title: z.string().trim().min(3).max(120),
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }),
  timezone: z.string().min(1).max(100).refine(value => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }),
  format: z.enum(["IN_PERSON", "ONLINE", "HYBRID"]),
  venue: z.string().trim().max(240).default(""),
  meetingUrl: z.union([z.url({ protocol: /^https?$/ }).max(500), z.literal("")]).default(""),
  coverTheme: z.enum(["NAVY", "SUNSET", "FOREST", "VIOLET"]).default("NAVY"),
}).superRefine((value, ctx) => {
  const start = Date.parse(value.startAt);
  const end = Date.parse(value.endAt);
  if (!(end > start) || end - start > 1000 * 60 * 60 * 24 * 30) {
    ctx.addIssue({ code: "custom", path: ["endAt"], message: "The event must end after it starts and within 30 days." });
  }
  if (value.format !== "ONLINE" && !value.venue) ctx.addIssue({ code: "custom", path: ["venue"], message: "Add an event venue." });
  if (value.format !== "IN_PERSON" && !value.meetingUrl) ctx.addIssue({ code: "custom", path: ["meetingUrl"], message: "Add a meeting link." });
});
const questionDetailsInput = z.strictObject({
  title: z.string().trim().min(10).max(180)
    .refine(value => !/[\u0000-\u001f\u007f]/.test(value)),
  // Helps the feed explain what kind of help is requested, without replacing topic tags.
  intent: z.enum(["EXPLANATION", "FEEDBACK", "GUIDANCE", "DISCUSSION"]).default("GUIDANCE"),
});

const memberPostInput = postInput.extend({
  type: z.enum(["POST", "ACHIEVEMENT", "EVENT", "QUESTION"]).default("POST"),
  tags: topicTags.default([]),
  eventDetails: eventDetailsInput.optional(),
  questionDetails: questionDetailsInput.optional(),
}).superRefine((value, ctx) => {
  if (value.type !== "QUESTION" && value.questionDetails)
    ctx.addIssue({ code: "custom", path: ["questionDetails"], message: "Question details are only allowed on questions." });
  if (value.type === "QUESTION" && !value.questionDetails)
    ctx.addIssue({ code: "custom", path: ["questionDetails"], message: "Add a question title and question type." });
  if (value.type !== "EVENT" && value.eventDetails) ctx.addIssue({ code: "custom", path: ["eventDetails"], message: "Event details can only be added to events." });
  if (value.type === "EVENT" && !value.eventDetails) {
    ctx.addIssue({ code: "custom", path: ["eventDetails"], message: "Complete event details before publishing." });
  }
});
const commentInput = textInput(1000);
const commentSelect = {
  id: true, body: true, createdAt: true,
  author: { select: memberSelect },
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

function commentView({ author, ...comment }, viewerId, verified = false) {
  return { ...comment, ...discussionAttribution(author, verified), canDelete: author.id === viewerId };
}

function discussionAttribution(author, verified = false) {
  // A private, unapproved, or stale-identity account must not leak personal
  // profile details into discussion cards. Username is the existing fallback.
  if (!verified) return { username: author.username };
  return memberAttribution(author, true);
}

async function answerVoteTotals(db, answerIds) {
  if (!answerIds.length) return new Map();
  const counts = new Map(answerIds.map(id => [id, { upvoteCount: 0, downvoteCount: 0 }]));
  const groups = await db.answerVote.groupBy({
    by: ["answerId", "value"],
    where: { answerId: { in: answerIds }, value: { in: [1, -1] } },
    _count: { _all: true },
  });
  for (const group of groups) {
    const tally = counts.get(group.answerId);
    if (!tally) continue;
    if (group.value === 1) tally.upvoteCount = group._count._all;
    if (group.value === -1) tally.downvoteCount = group._count._all;
  }
  return counts;
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
  return { _count: { select: { likes: true, views: true } }, likes: { where: { accountId }, select: { id: true } } };
}

function likeSummary({ likes, _count }) {
  return { liked: likes.length > 0, count: _count.likes };
}

// Only read respondents with public profiles that are visible to this viewer.
// Keep this preview bounded rather than requesting every answer for each card.
function answerPreviewSelect(viewerId) {
  return {
    where: { deletedAt: null, author: visibleMember(viewerId) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 12,
    select: {
      author: { select: {
        id: true, username: true,
        person: { select: {
          firstName: true, middleName: true, lastName: true,
          profile: { select: { photoId: true } },
        } },
      } },
    },
  };
}

function memberAttribution({ username, person }, verified = false) {
  const { firstName, middleName, lastName } = person;
  return { username, name: [firstName, middleName, lastName].filter(Boolean).join(" "), photoId: person.profile?.photoId ?? null, ...(verified ? { verified: true } : {}) };
}

function feedPost({ likes, _count, saves, reposts, registrations, answers = [], ...post }, blockedKeys = new Set()) {
  const participants = [];
  if (post.type === "QUESTION" && post.author) {
    const seen = new Set();
    for (const { author } of answers) {
      if (seen.has(author.id) || (author.id !== post.author.id &&
          blockedKeys.has(pairKey(blockPair(author.id, post.author.id))))) continue;
      seen.add(author.id);
      participants.push({
        ...memberAttribution(author),
        photoId: author.person.profile?.photoId ?? null,
      });
      if (participants.length === 3) break;
    }
  }
  return {
    ...(post.author ? memberPost(post, true) : post),
    reaction: likeSummary({ likes, _count }),
    views: _count.views ?? 0,
    ...(registrations && { registration: { registered: registrations.length > 0, count: _count.registrations ?? 0 } }),
    ...(post.type === "QUESTION" && { answerCount: _count.answers ?? 0, answerParticipants: participants }),
    saved: saves.length > 0,
    reposted: reposts.length > 0,
  };
}

function sameQuestionDetails(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.title === right.title && (left.intent || "GUIDANCE") === (right.intent || "GUIDANCE");
}

function sameEventDetails(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return ["title", "startAt", "endAt", "timezone", "format", "venue", "meetingUrl", "coverTheme"]
    .every(key => (left[key] ?? null) === (right[key] ?? null));
}

function memberPost({ author, ...post }, verified = false) {
  return { ...post, member: memberAttribution(author, verified) };
}

function repostAttribution(row, viewer) {
  return { id: row.id, createdAt: row.createdAt, member: memberAttribution(row.account, true), mine: row.account.id === viewer };
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

  async function approvedDiscussionAuthors(db, rows) {
    const accounts = [...new Set(rows.map(row => row.author.id))];
    const approved = new Set();
    // Bounded concurrent checks retain the effective verification rules used
    // by the feed, including invalidated identity and unpublished profiles.
    for (let offset = 0; offset < accounts.length; offset += 4) {
      await Promise.all(accounts.slice(offset, offset + 4).map(async id => {
        try {
          const access = await memberEligibility(db, id);
          if (access.identityVerified && access.profilePublic) approved.add(id);
        } catch (error) {
          if (error.status !== 403) throw error;
        }
      }));
    }
    return approved;
  }

  // Show only confirmed, publicly visible attendee profiles. The total
  // registration count remains independent of how many members can be shown.
  async function eventAttendeePreviews(db, events, viewer) {
    const previews = new Map();
    const candidates = new Map();
    for (let offset = 0; offset < events.length; offset += 4) {
      await Promise.all(events.slice(offset, offset + 4).map(async ({ id, authorId }) => {
        const registrations = await db.eventRegistration.findMany({
          where: {
            memberPostId: id,
            account: { AND: [visibleMember(viewer), unblockedAuthor(authorId)] },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { account: { select: memberSelect } },
          take: 12,
        });
        candidates.set(id, registrations);
      }));
    }
    const approved = await approvedDiscussionAuthors(db,
      [...candidates.values()].flat().map(({ account }) => ({ author: account })));
    for (const { id } of events) {
      const shown = [];
      const seen = new Set();
      for (const { account } of candidates.get(id) ?? []) {
        if (!approved.has(account.id) || seen.has(account.id)) continue;
        seen.add(account.id);
        shown.push(memberAttribution(account, true));
        if (shown.length === 3) break;
      }
      previews.set(id, shown);
    }
    return previews;
  }

  async function projectVisiblePosts(candidates, viewer) {
    // Reuse one identity check per author across original and reposted cards.
    const entries = candidates.map(row => ({ row, post: row.account ? row.memberPost ?? row.organizationPost : row }))
      .filter(entry => entry.post);
    const authorIds = new Set();
    const pairs = new Map();
    for (const { row, post } of entries) {
      if (post.author) authorIds.add(post.author.id);
      if (post.type === "QUESTION" && post.author) {
        for (const { author } of post.answers ?? []) {
          if (author.id === post.author.id) continue;
          const pair = blockPair(author.id, post.author.id);
          pairs.set(pairKey(pair), pair);
        }
      }
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
    const events = new Map();
    for (const { row, post } of entries) {
      if (post.author && !eligible.has(post.author.id)) continue;
      const { authorId, ...original } = post;
      if (!row.account) {
        items.push(feedPost(original, blockedKeys));
        if (post.type === "EVENT" && post.author) events.set(post.id, post.author.id);
        continue;
      }
      if (!eligible.has(row.account.id) || blockedKeys.has(pairKey(blockPair(row.account.id, post.author?.id ?? authorId)))) continue;
      items.push({ ...feedPost(original, blockedKeys), repost: repostAttribution(row, viewer) });
      if (post.type === "EVENT" && post.author) events.set(post.id, post.author.id);
    }
    if (!events.size) return items;
    const previews = await eventAttendeePreviews(prisma,
      [...events].map(([id, authorId]) => ({ id, authorId })), viewer);
    return items.map(item => item.type === "EVENT"
      ? { ...item, eventAttendees: previews.get(item.id) ?? [] } : item);
  }

  async function savedFeed(accountId, position, select, memberEngagementSelect) {
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
        memberPost: { select: { ...memberPostSelect, ...memberEngagementSelect } },
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

  async function requireQuestion(db, actor, questionId) {
    const id = parse(identifier, questionId, "Choose a valid question.");
    const target = await visiblePost(db, actor.accountId, { source: "member", id });
    const question = await db.memberPost.findUniqueOrThrow({ where: { id }, select: { type: true } });
    if (question.type !== "QUESTION") throw fail(400, "Answers are only available for questions.");
    return { id, target };
  }

  async function requireAnswer(db, actor, answerId) {
    const id = parse(identifier, answerId, "Choose a valid answer.");
    const answer = await db.questionAnswer.findFirst({ where: { id, deletedAt: null },
      select: { id: true, authorId: true, questionId: true } });
    if (!answer) throw fail(404, "This answer is unavailable.");
    await requireQuestion(db, actor, answer.questionId);
    return answer;
  }

  async function verifiedContributor(db, accountId) {
    await lockMemberProfile(db, accountId);
    const access = await memberEligibility(db, accountId);
    if (!access.identityVerified || !access.profilePublic) {
      throw fail(403, "Verify your identity and publish your public profile before answering questions.");
    }
  }

  function answerPublic(row, viewerId, verified = false, totals = {}) {
    return {
      id: row.id, body: row.body, createdAt: row.createdAt,
      ...discussionAttribution(row.author, verified),
      canDelete: row.author.id === viewerId,
      score: row.score, myVote: row.votes?.[0]?.value ?? 0,
      upvoteCount: totals.upvoteCount ?? 0,
      downvoteCount: totals.downvoteCount ?? 0,
      commentCount: row._count?.comments ?? 0,
    };
  }

  return {
    async memberPhoto(actor, usernameValue, photoValue) {
      const username = parse(publicPhotoUsername, usernameValue, "Choose a valid member.");
      const photoId = parse(identifier, photoValue, "Choose a valid profile photo.");
      await assertNetworkSession(prisma, actor, now);
      // The member must be visible to this viewer, not merely have an uploaded asset.
      // Recheck the current photo ID on each request so replaced/pending photos
      // cannot be fetched by guessing an old asset ID.
      const member = await prisma.account.findFirst({
        where: { username, ...visibleMember(actor.accountId) },
        select: { id: true, personId: true, person: { select: { profile: { select: { photoId: true } } } } },
      });
      if (!member || member.person.profile?.photoId !== photoId) throw fail(404, "This profile photo is unavailable.");
      const access = await memberEligibility(prisma, member.id);
      if (!access.identityVerified || !access.profilePublic) throw fail(404, "This profile photo is unavailable.");
      await assertNetworkSession(prisma, actor, now);
      return { personId: member.personId, photoId };
    },

    async readPost(actor, sourceValue, idValue) {
      const ref = postRef(sourceValue, idValue);
      await assertNetworkSession(prisma, actor, now);
      await visiblePost(prisma, actor.accountId, ref);
      const ownActivity = { where: { accountId: actor.accountId }, select: { id: true } };
      const select = { ...likeSelect(actor.accountId), saves: ownActivity, reposts: ownActivity };
      const memberSelectEngagement = {
        ...memberPostSelect, ...select,
        _count: { select: { likes: true, views: true, registrations: true, answers: { where: { deletedAt: null } } } },
        registrations: { where: { accountId: actor.accountId }, select: { id: true } },
        answers: answerPreviewSelect(actor.accountId),
      };
      const row = await postModel(prisma, ref.source).findUniqueOrThrow({
        where: { id: ref.id },
        select: ref.source === "member" ? memberSelectEngagement : { ...postSelect, ...select },
      });
      await assertNetworkSession(prisma, actor, now);
      const [post] = await projectVisiblePosts([row], actor.accountId);
      if (!post) throw unavailable();
      return { post };
    },

    async registerEvent(actor, idValue, input) {
      const id = parse(identifier, idValue, "Choose a valid event.");
      const { registered } = parse(registrationInput, input, "Choose whether to register.");
      return writeVisiblePost(actor, { source: "member", id }, async tx => {
        const post = await tx.memberPost.findUniqueOrThrow({ where: { id }, select: { type: true, eventDetails: true, authorId: true } });
        if (post.type !== "EVENT" || !post.eventDetails) throw fail(400, "Registration is only available for events.");
        if (registered && Date.parse(post.eventDetails.endAt) <= +now()) throw fail(409, "Registration is closed for this event.");
        const key = { memberPostId: id, accountId: actor.accountId };
        if (registered) await tx.eventRegistration.createMany({ data: [key], skipDuplicates: true });
        else await tx.eventRegistration.deleteMany({ where: key });
        const count = await tx.eventRegistration.count({ where: { memberPostId: id } });
        const attendees = await eventAttendeePreviews(tx, [{ id, authorId: post.authorId }], actor.accountId);
        return { registration: { registered, count }, eventAttendees: attendees.get(id) ?? [] };
      });
    },

    async recordView(actor, sourceValue, idValue) {
      const ref = postRef(sourceValue, idValue);
      return writeVisiblePost(actor, ref, async tx => {
        const target = await postModel(tx, ref.source).findUniqueOrThrow({
          where: { id: ref.id }, select: { authorId: true },
        });
        if (target.authorId !== actor.accountId) {
          await tx.postView.createMany({
            data: [{ accountId: actor.accountId, ...postTarget(ref) }], skipDuplicates: true,
          });
        }
        return { views: await tx.postView.count({ where: postTarget(ref) }) };
      });
    },

    async reportQuestion(actor, idValue, input) {
      const id = parse(identifier, idValue, "Choose a valid question.");
      const { reason, details } = parse(reportInput, input, "Choose a report reason.");
      return writeVisiblePost(actor, { source: "member", id }, async tx => {
        const post = await tx.memberPost.findUniqueOrThrow({ where: { id }, select: { type: true, authorId: true } });
        if (post.type !== "QUESTION") throw fail(400, "Only questions can be reported here.");
        if (post.authorId === actor.accountId) throw fail(400, "You cannot report your own question.");
        await tx.postReport.createMany({
          data: [{ memberPostId: id, reporterId: actor.accountId, reason, details: details || null }],
          skipDuplicates: true,
        });
        return { reported: true };
      });
    },

    async answers(actor, idValue, input) {
      const { sort } = parse(answerSortInput, input, "Choose a valid answer order.");
      await assertNetworkSession(prisma, actor, now);
      const { id, target } = await requireQuestion(prisma, actor, idValue);
      const rows = await prisma.questionAnswer.findMany({
        where: { questionId: id, deletedAt: null,
          author: { status: "ACTIVE", AND: [unblockedAuthor(actor.accountId), unblockedAuthor(target.authorId)] } },
        orderBy: sort === "top" ? [{ score: "desc" }, { createdAt: "desc" }, { id: "desc" }]
          : [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, body: true, score: true, createdAt: true,
          author: { select: memberSelect },
          votes: { where: { accountId: actor.accountId }, select: { value: true } },
          _count: { select: { comments: { where: { deletedAt: null } } } },
        },
        take: 50,
      });
      const [totals, approved] = await Promise.all([
        answerVoteTotals(prisma, rows.map(row => row.id)),
        approvedDiscussionAuthors(prisma, rows),
      ]);
      await assertNetworkSession(prisma, actor, now);
      return { items: rows.map(row => answerPublic(
        row, actor.accountId, approved.has(row.author.id), totals.get(row.id),
      )), sort };
    },

    async addAnswer(actor, idValue, input) {
      const id = parse(identifier, idValue, "Choose a valid question.");
      const { body, requestKey } = parse(textInput(2000), input, "Write an answer between 1 and 2,000 characters.");
      return writeVisiblePost(actor, { source: "member", id }, async tx => {
        const post = await tx.memberPost.findUniqueOrThrow({ where: { id }, select: { type: true } });
        if (post.type !== "QUESTION") throw fail(400, "Answers are only available for questions.");
        await verifiedContributor(tx, actor.accountId);
        const key = { authorId: actor.accountId, requestKey };
        const previous = await tx.questionAnswer.findUnique({ where: { authorId_requestKey: key } });
        if (previous) {
          if (previous.questionId !== id || previous.body !== body || previous.deletedAt)
            throw fail(409, "This request belongs to another answer.");
          const author = await tx.account.findUniqueOrThrow({
            where: { id: actor.accountId }, select: memberSelect,
          });
          const commentCount = await tx.answerComment.count({ where: { answerId: previous.id, deletedAt: null } });
          const vote = await tx.answerVote.findUnique({
            where: { answerId_accountId: { answerId: previous.id, accountId: actor.accountId } },
            select: { value: true },
          });
          const totals = (await answerVoteTotals(tx, [previous.id])).get(previous.id);
          return { answer: { id: previous.id, body: previous.body, createdAt: previous.createdAt,
            ...discussionAttribution(author, true), canDelete: true,
            score: previous.score, myVote: vote?.value ?? 0, ...totals, commentCount } };
        }
        const recent = await tx.questionAnswer.count({
          where: { authorId: actor.accountId, createdAt: { gte: new Date(+now() - 900000) } },
        });
        if (recent >= 10) throw fail(429, "You have reached the answer limit. Try again later.");
        const answer = await tx.questionAnswer.create({
          data: { questionId: id, ...key, body, createdAt: now() },
          select: { id: true, body: true, createdAt: true, score: true,
            author: { select: memberSelect } },
        });
        return { answer: { id: answer.id, body: answer.body, createdAt: answer.createdAt,
          ...discussionAttribution(answer.author, true), canDelete: true, score: 0, myVote: 0,
          upvoteCount: 0, downvoteCount: 0, commentCount: 0 } };
      });
    },

    async voteAnswer(actor, answerId, input) {
      const id = parse(identifier, answerId, "Choose a valid answer.");
      const { value } = parse(voteInput, input, "Choose upvote, downvote, or remove vote.");
      const answer = await requireAnswer(prisma, actor, id);
      return writeVisiblePost(actor, { source: "member", id: answer.questionId }, async tx => {
        await tx.$queryRaw`SELECT "id" FROM "QuestionAnswer" WHERE "id" = ${id} FOR UPDATE`;
        const current = await tx.questionAnswer.findUniqueOrThrow({
          where: { id }, select: { authorId: true, deletedAt: true },
        });
        if (current.deletedAt) throw fail(404, "This answer is unavailable.");
        if (current.authorId === actor.accountId) throw fail(400, "You cannot vote on your own answer.");
        const key = { answerId: id, accountId: actor.accountId };
        const previous = await tx.answerVote.findUnique({ where: { answerId_accountId: key } });
        const oldValue = previous?.value ?? 0;
        if (value === 0) await tx.answerVote.deleteMany({ where: key });
        else await tx.answerVote.upsert({
          where: { answerId_accountId: key },
          create: { ...key, value, createdAt: now() },
          update: { value },
        });
        const updated = await tx.questionAnswer.update({
          where: { id }, data: { score: { increment: value - oldValue } },
          select: { score: true },
        });
        const totals = (await answerVoteTotals(tx, [id])).get(id);
        return { score: updated.score, myVote: value, ...totals };
      });
    },

    async answerComments(actor, answerId) {
      const answer = await requireAnswer(prisma, actor, answerId);
      const rows = await prisma.answerComment.findMany({
        where: { answerId: answer.id, deletedAt: null,
          author: { status: "ACTIVE", AND: [unblockedAuthor(actor.accountId), unblockedAuthor(answer.authorId)] } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 50,
        select: commentSelect,
      });
      const approved = await approvedDiscussionAuthors(prisma, rows);
      await assertNetworkSession(prisma, actor, now);
      return { items: rows.map(row => commentView(row, actor.accountId, approved.has(row.author.id))) };
    },

    async addAnswerComment(actor, answerId, input) {
      const { body, requestKey } = parse(textInput(1000), input, "Write a comment between 1 and 1,000 characters.");
      const answer = await requireAnswer(prisma, actor, answerId);
      return writeVisiblePost(actor, { source: "member", id: answer.questionId }, async tx => {
        const key = { authorId: actor.accountId, requestKey };
        const old = await tx.answerComment.findUnique({ where: { authorId_requestKey: key },
          select: { ...commentSelect, answerId: true, deletedAt: true } });
        if (old) {
          if (old.answerId !== answer.id || old.body !== body || old.deletedAt)
            throw fail(409, "This request belongs to another comment.");
          const access = await memberEligibility(tx, actor.accountId);
          return { comment: commentView(old, actor.accountId, access.identityVerified && access.profilePublic) };
        }
        const row = await tx.answerComment.create({
          data: { ...key, answerId: answer.id, body, createdAt: now() }, select: commentSelect,
        });
        const access = await memberEligibility(tx, actor.accountId);
        return { comment: commentView(row, actor.accountId, access.identityVerified && access.profilePublic) };
      });
    },

    async deleteAnswer(actor, answerId) {
      const answer = await requireAnswer(prisma, actor, answerId);
      if (answer.authorId !== actor.accountId) throw fail(403, "You can only remove your own answer.");
      return writeVisiblePost(actor, { source: "member", id: answer.questionId }, async tx => {
        await tx.questionAnswer.update({ where: { id: answer.id }, data: { deletedAt: now() } });
        return { id: answer.id };
      });
    },

    async deleteAnswerComment(actor, answerId, commentId) {
      const answer = await requireAnswer(prisma, actor, answerId);
      const id = parse(identifier, commentId, "Choose a valid comment.");
      return writeVisiblePost(actor, { source: "member", id: answer.questionId }, async tx => {
        const comment = await tx.answerComment.findFirst({ where: { id, answerId: answer.id, authorId: actor.accountId } });
        if (!comment) throw fail(404, "This comment is unavailable.");
        if (!comment.deletedAt) await tx.answerComment.update({ where: { id }, data: { deletedAt: now(), body: "" } });
        return { id };
      });
    },

    async feed(actor, query) {
      const { view, cursor } = parse(feedQuery, query, "Choose a valid Explore view.");
      await assertNetworkSession(prisma, actor, now);
      const position = readCursor(cursor, actor.accountId, view);
      const ownActivity = { where: { accountId: actor.accountId }, select: { id: true } };
      const select = { ...likeSelect(actor.accountId), saves: ownActivity, reposts: ownActivity };
      const memberEngagementSelect = {
        ...select,
        _count: { select: { likes: true, views: true, registrations: true, answers: { where: { deletedAt: null } } } },
        registrations: { where: { accountId: actor.accountId }, select: { id: true } },
        answers: answerPreviewSelect(actor.accountId),
      };
      if (view === "saved") {
        const page = await savedFeed(actor.accountId, position, select, memberEngagementSelect);
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
        findPosts(prisma.memberPost, { ...memberPostSelect, ...memberEngagementSelect }, { author: member }, position, "member"),
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
            memberPost: { select: { ...memberPostSelect, ...memberEngagementSelect } },
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
      const { liked } = parse(likeInput, input, "Choose whether to celebrate this achievement.");
      return writeVisiblePost(actor, ref, async tx => {
        if (ref.source === "member") {
          const target = await tx.memberPost.findUniqueOrThrow({ where: { id: ref.id }, select: { type: true } });
          if (target.type !== "ACHIEVEMENT" && target.type !== "POST") {
            throw fail(400, "Only achievements can receive celebrations.");
          }
        }
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
        if (ref.source === "member") {
          const original = await tx.memberPost.findUniqueOrThrow({ where: { id: ref.id }, select: { type: true } });
          if (original.type === "QUESTION") throw fail(400, "Questions cannot be reposted. Share a link instead.");
        }
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
      const page = rows.slice(0, pageSize);
      const approved = await approvedDiscussionAuthors(prisma, page);
      await assertNetworkSession(prisma, actor, now);
      return { items: page.map(row => commentView(row, actor.accountId, approved.has(row.author.id))),
        nextCursor: cursorFor(rows, actor.accountId, scope, ref.source) };
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
          const access = await memberEligibility(tx, actor.accountId);
          return { comment: commentView(comment, actor.accountId, access.identityVerified && access.profilePublic) };
        }

        const recent = await tx.postComment.count({ where: { authorId: actor.accountId, createdAt: { gte: new Date(+now() - 900000) } } });
        if (recent >= 20) throw fail(429, "You have reached the commenting limit. Try again in 15 minutes.");
        const comment = await tx.postComment.create({ data: { ...key, ...target, body, createdAt: now() }, select: commentSelect });
        const access = await memberEligibility(tx, actor.accountId);
        return { comment: commentView(comment, actor.accountId, access.identityVerified && access.profilePublic) };
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
      return { access, items: rows.slice(0, pageSize).map(post => memberPost(post, access.identityVerified)), nextCursor: cursorFor(rows, actor.accountId, "my-posts") };
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
          const sameEvent = sameEventDetails(post.eventDetails, data.eventDetails);
          const sameQuestion = sameQuestionDetails(post.questionDetails, data.questionDetails);
          if (withdrawnAt || post.body !== data.body || post.type !== data.type || !sameTags || !sameEvent || !sameQuestion) throw fail(409, "This publishing request already belongs to another post. Edit your draft before trying again.");
          return { post: memberPost(post, true) };
        }
        // An older tagless post may be retried, but new posts require a topic.
        if (!data.tags.length) throw fail(400, "Add at least one topic tag before publishing.");
        const recent = await tx.memberPost.count({ where: { authorId: actor.accountId, createdAt: { gte: new Date(+now() - 900000) } } });
        if (recent >= 20) throw fail(429, "You have reached the publishing limit. Try again in 15 minutes.");
        const post = await tx.memberPost.create({ data: { ...key, type: data.type, tags: data.tags, eventDetails: data.eventDetails ?? undefined, questionDetails: data.questionDetails ?? undefined, body: data.body, createdAt: now() }, select: memberPostSelect });
        return { post: memberPost(post, true) };
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
