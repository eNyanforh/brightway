import { z } from "zod";
export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/);
export const networkActionSchema = z.strictObject({
  action: z.enum(["REQUEST", "ACCEPT", "DECLINE", "CANCEL", "REMOVE", "BLOCK", "UNBLOCK"]),
  expectedVersion: z.number().int().min(0).max(2147483646),
  requestKey: z.uuid(),
});
export const networkQuerySchema = z.strictObject({
  view: z.enum(["connections", "incoming", "outgoing", "blocked", "following", "followers"]).default("connections"),
  cursor: z.string().min(1).max(700).optional(),
});
export const networkCursorSchema = z.strictObject({ owner: z.uuid(), view: networkQuerySchema.shape.view, at: z.iso.datetime(), id: z.uuid() });
export const fail = (status, message) => Object.assign(Error(message), { status });
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw fail(400, "Please check the network request.");
  return result.data;
}
export function relationshipView(pair, actorId) {
  if (!pair) return { version: 0, state: "NONE" };
  const left = pair.leftAccountId === actorId;
  if (left ? pair.leftBlocked : pair.rightBlocked) return { version: pair.version, state: "BLOCKED" };
  if (left ? pair.rightBlocked : pair.leftBlocked) throw fail(404, "This person is unavailable.");
  return { version: pair.version, state: pair.status === "PENDING" ? pair.requestedById === actorId ? "OUTGOING" : "INCOMING" : pair.status === "CONNECTED" ? "CONNECTED" : "NONE" };
}
