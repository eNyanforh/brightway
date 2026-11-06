import { z } from "zod";
import { assertNoSelfReview, conflictAccounts } from "../management/management-authority.js";
import { operationError as fail, parse, reason, uuid } from "../management/management-operations.schema.js";
import { lockOperationActors, operationAuthority, recordOperation, replayOperation } from "../management/management-operations.service.js";

const capability = "moderation-agent";
const pending = { moderationStatus: "PENDING", withdrawnAt: null };
const decisionInput = z.strictObject({
  decision: z.enum(["PUBLISHED", "REJECTED"]),
  reason,
  requestKey: uuid,
});

export function createMemberPostModeration({ prisma, now = () => new Date() }) {
  return {
    async list(actor) {
      const staff = await operationAuthority(prisma, actor, capability, now());
      const conflicts = await conflictAccounts(prisma, actor.staffId);
      const items = await prisma.memberPost.findMany({
        where: { ...pending, authorId: { notIn: conflicts } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 20,
        select: {
          id: true, type: true, tags: true, body: true, createdAt: true,
          author: { select: { username: true } },
        },
      });
      const current = await operationAuthority(prisma, actor, capability, now());
      if (current.version !== staff.version) throw fail(403, "Management access changed. Reload before continuing.");
      return { items };
    },

    async decide(actor, id, input) {
      parse(uuid, id);
      const data = parse(decisionInput, input);
      const value = { id, ...data };
      await operationAuthority(prisma, actor, capability, now(), true);
      return prisma.$transaction(async tx => {
        await lockOperationActors(tx, [actor.staffId]);
        await operationAuthority(tx, actor, capability, now(), true);
        const replay = await replayOperation(tx, actor.staffId, data.requestKey, value);
        if (replay) return replay;
        const post = await tx.memberPost.findUnique({ where: { id }, select: { authorId: true } });
        if (!post) throw fail(404, "Post not found.");
        await assertNoSelfReview(tx, actor.staffId, post.authorId);
        const changed = await tx.memberPost.updateMany({
          where: { id, ...pending },
          data: { moderationStatus: data.decision, moderationFeedback: data.decision === "REJECTED" ? data.reason : null },
        });
        if (changed.count !== 1) throw fail(409, "This post is no longer awaiting review.");
        await operationAuthority(tx, actor, capability, now(), true);
        return recordOperation(tx, actor.staffId, data.requestKey, value, {
          action: "MEMBER_POST_" + data.decision,
          targetType: "MEMBER_POST",
          targetId: id,
          reason: data.reason,
          result: { id, moderationStatus: data.decision },
        });
      });
    },
  };
}
