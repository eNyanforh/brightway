import { z } from "zod";
import { assertNoSelfReview, conflictAccounts } from "../management/management-authority.js";
import { operationError as fail, parse, reason, uuid } from "../management/management-operations.schema.js";
import { lockOperationActors, operationAuthority, recordOperation, replayOperation } from "../management/management-operations.service.js";

const capability = "moderation-agent";
const pending = { moderationStatus: "PENDING", withdrawnAt: null };
const listInput = z.strictObject({ cursor: uuid.optional() });
const decisionInput = z.strictObject({
  decision: z.enum(["PUBLISHED", "REJECTED"]),
  reason,
  expectedVersion: z.number().int().positive(),
  requestKey: uuid,
});

export function createMemberPostModeration({ prisma, now = () => new Date() }) {
  return {
    async list(actor, input = {}) {
      const { cursor } = parse(listInput, input);
      const authority = await operationAuthority(prisma, actor, capability, now());
      const conflicts = await conflictAccounts(prisma, actor.staffId);
      let position = null;
      if (cursor) {
        position = await prisma.memberPost.findFirst({
          where: { id: cursor, ...pending, authorId: { notIn: conflicts } },
          select: { id: true, createdAt: true },
        });
        if (!position) throw fail(409, "The review queue changed. Reload from the beginning.");
      }
      const rows = await prisma.memberPost.findMany({
        where: {
          ...pending,
          authorId: { notIn: conflicts },
          ...(position ? { OR: [
            { createdAt: { gt: position.createdAt } },
            { createdAt: position.createdAt, id: { gt: position.id } },
          ] } : {}),
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 21,
        select: {
          id: true, type: true, tags: true, body: true, createdAt: true,
          moderationVersion: true, moderationScreenStatus: true, moderationFlags: true,
          eventDetails: true, questionDetails: true,
          author: { select: { username: true } },
        },
      });
      const current = await operationAuthority(prisma, actor, capability, now());
      if (current.version !== authority.version) throw fail(403, "Management access changed. Reload before continuing.");
      return {
        items: rows.slice(0, 20).map(({ eventDetails, ...post }) => ({
          ...post,
          ...(post.type === "EVENT" && eventDetails && { eventDetails: {
            title: eventDetails.title, startAt: eventDetails.startAt,
            endAt: eventDetails.endAt, format: eventDetails.format, venue: eventDetails.venue,
          } }),
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
        // Author and management actor locks serialize edits and review decisions.
        await lockOperationActors(tx, [actor.staffId, owner.authorId]);
        await operationAuthority(tx, actor, capability, now(), true);
        const replay = await replayOperation(tx, actor.staffId, data.requestKey, value);
        if (replay) return replay;
        await assertNoSelfReview(tx, actor.staffId, owner.authorId);
        const changed = await tx.memberPost.updateMany({
          where: {
            id, authorId: owner.authorId, ...pending,
            moderationVersion: data.expectedVersion,
          },
          data: {
            moderationStatus: data.decision,
            moderationFeedback: data.decision === "REJECTED" ? data.reason : null,
          },
        });
        if (changed.count !== 1) throw fail(409, "This post changed or is no longer awaiting review. Reload before deciding.");
        await operationAuthority(tx, actor, capability, now(), true);
        return recordOperation(tx, actor.staffId, data.requestKey, value, {
          action: "MEMBER_POST_" + data.decision,
          targetType: "MEMBER_POST",
          targetId: id,
          reason: data.reason,
          result: { id, moderationStatus: data.decision, moderationVersion: data.expectedVersion },
        });
      });
    },
  };
}
