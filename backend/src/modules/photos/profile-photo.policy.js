import { z } from "zod";

export const activePhotoReview = ["PENDING", "IN_REVIEW"];
export const photoReviewSelect = {
  id: true, version: true, state: true, candidatePhotoId: true,
  note: true, createdAt: true, decidedAt: true,
};
export const photoReviewVersionSchema = z.strictObject({ expectedVersion: z.number().int().min(1).max(2147483646) });
export const photoReviewDecisionSchema = photoReviewVersionSchema.extend({
  expectedProfileVersion: z.number().int().min(0).max(2147483646),
  decision: z.enum(["APPROVED", "DECLINED"]),
  note: z.string().trim().min(10).max(2000),
});
export const photoReviewCancelSchema = photoReviewVersionSchema.extend({ expectedProfileVersion: z.number().int().min(0).max(2147483646) });

export function photoReviewView(rows = [], required = false) {
  const safe = (r) => r ? {
    id: r.id, version: r.version, state: r.state, photoAssetId: r.candidatePhotoId,
    note: r.note ?? null, submittedAt: r.createdAt, decidedAt: r.decidedAt ?? null,
  } : null;
  return {
    required: required === true,
    pending: safe(rows.find((row) => activePhotoReview.includes(row.state))),
    latestDecision: safe(rows.find((row) => ["APPROVED", "DECLINED"].includes(row.state))),
  };
}
