import { createHash } from "node:crypto";
import { z } from "zod";
export const followKind = z.enum(["PERSON", "ORGANIZATION"]);
export const followActionSchema = z.strictObject({ action: z.enum(["FOLLOW", "UNFOLLOW"]), expectedVersion: z.number().int().min(0).max(2147483646), requestKey: z.uuid(), targetRef: z.string().regex(/^[a-f0-9]{64}$/) });
// Identity binding, not an authorization token. Renamed/reused usernames cannot
// silently redirect an action to a different account or organization.
export const followRef = (kind, id) => createHash("sha256").update(`brightway-follow-v1:${kind}:${id}`).digest("hex");
