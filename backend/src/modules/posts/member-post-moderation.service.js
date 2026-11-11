import { z } from "zod";
import { assertNoSelfReview, conflictAccounts } from "../management/management-authority.js";
import { operationError as fail, parse, reason, uuid } from "../management/management-operations.schema.js";
import { lockOperationActors, operationAuthority, recordOperation, replayOperation } from "../management/management-operations.service.js";

const capability = "moderation-agent";
const statusSchema = z.enum(["PENDING", "PUBLISHED", "REJECTED"]);
const listInput = z.strictObject({ cursor: uuid.optional(), status: statusSchema.default("PENDING") });
const decisionInput = z.strictObject({
  decision: z.enum(["PUBLISHED", "REJECTED"]),
  reason,
  expectedVersion: z.number().int().positive(),
  requestKey: uuid,
});
const visibleEvent = event => event && ({
  title: event.title, startAt: event.startAt, endAt: event.endAt,
  format: event.format, venue: event.venue,
});
// Publicly visible reviews are displayed newest first; pending reviews oldest
// first. A cursor cannot be reused across statuses.
function order(status) { return status === "PENDING" ? "asc" : "desc"; }

export function createMemberPostModeration({ prisma, now = () => new Date() }) {
  return {
    async list(actor, input = {}) {
      const { cursor, status } = parse(listInput, input);
      const authority = await operationAuthority(prisma, actor, capability, now());
      const conflicts = await conflictAccounts(prisma, actor.staffId);
      const scope = { moderationStatus: status, withdrawnAt: null, authorId: { notIn: conflicts } };
      let position = null;
      if (cursor) {
        position = await prisma.memberPost.findFirst({
          where: { id: cursor, ...scope },
          select: { id: true, createdAt: true },
        });
        if (!position) throw fail(409, "This review queue changed. Start from the first page.");
      }
      const ascending = status === "PENDING";
      const rows = await prisma.memberPost.findMany({
        where: {
          ...scope,
          ...(position ? { OR: [
            { createdAt: { [ascending ? "gt" : "lt"]: position.createdAt } },
            { createdAt: position.createdAt, id: { [ascending ? "gt" : "lt"]: position.id } },
          ] } : {}),
        },
        orderBy: [{ createdAt: order(status) }, { id: order(status) }],
        take: 21,
        select: {
          id: true, type: true, tags: true, body: true, createdAt: true,
          moderationStatus: true, moderationVersion: true, moderationScreenStatus: true,
          moderationFlags: true, moderationRelevanceStatus: true,
          moderationRelevanceCategory: true, moderationRelevanceReason: true,
          eventDetails: true, questionDetails: true,
          author: { select: { username: true } },
        },
      });
      const current = await operationAuthority(prisma, actor, capability, now());
      if (current.version !== authority.version) throw fail(403, "Management access changed. Reload.");
      return {
        status,
        items: rows.slice(0, 20).map(({ eventDetails, ...post }) => ({
          ...post, ...(post.type === "EVENT" && eventDetails && { eventDetails: visibleEvent(eventDetails) }),
        })),
        nextCursor: rows.length > 20 ? rows[19].id : null,
      };
    },

    async decide(actor, id, input) {
      parse(uuid, id);
      const data = parse(decisionInput, input);
      const value = { id, ...data };
      await operationAuthority(prisma, actor, capability, now(), true);
      const owner = await prisma.memberPost.findUnique({ where: { id }, select: { authorId: true } });
      if (!owner) throw fail(404, "Post not found.");
      return prisma.$transaction(async tx => {
        // Lock the same account as personal post edits, then CAS the exact
        // moderation revision. Prevent an old decision from overriding edits.
        await lockOperationActors(tx, [actor.staffId, owner.authorId]);
        await operationAuthority(tx, actor, capability, now(), true);
        const replay = await replayOperation(tx, actor.staffId, data.requestKey, value);
        if (replay) return replay;
        await assertNoSelfReview(tx, actor.staffId, owner.authorId);
        const post = await tx.memberPost.findFirst({
          where: { id, authorId: owner.authorId, withdrawnAt: null },
          select: { moderationStatus: true, moderationVersion: true },
        });
        if (!post || post.moderationVersion !== data.expectedVersion ||
          post.moderationStatus === data.decision) {
          throw fail(409, "This post changed or its review state changed. Reload before deciding.");
        }
        const changed = await tx.memberPost.updateMany({
          where: {
            id, authorId: owner.authorId, withdrawnAt: null,
            moderationStatus: post.moderationStatus, moderationVersion: data.expectedVersion,
          },
          data: {
            moderationStatus: data.decision,
            moderationVersion: { increment: 1 },
            moderationFeedback: data.decision === "REJECTED" ? data.reason : null,
          },
        });
        if (changed.count !== 1) throw fail(409, "This post changed. Reload before deciding.");
        await operationAuthority(tx, actor, capability, now(), true);
        const action = post.moderationStatus === "PUBLISHED"
          ? "MEMBER_POST_REMOVED"
          : post.moderationStatus === "REJECTED" ? "MEMBER_POST_RESTORED"
            : data.decision === "PUBLISHED" ? "MEMBER_POST_PUBLISHED" : "MEMBER_POST_REJECTED";
        return recordOperation(tx, actor.staffId, data.requestKey, value, {
          action, targetType: "MEMBER_POST", targetId: id, reason: data.reason,
          result: { id, moderationStatus: data.decision, moderationVersion: data.expectedVersion + 1 },
        });
      });
    },
  };
}
