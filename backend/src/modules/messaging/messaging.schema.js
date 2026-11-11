import { z } from "zod";
import { fail } from "../network/network.schema.js";
export const id = z.uuid();
export const page = z.strictObject({ cursor: z.string().max(700).optional(), organizationId: id.optional() });
export const share = z.strictObject({ kind: z.enum(["POST", "PROFILE", "ORGANIZATION", "OPPORTUNITY", "PROGRAM"]), id: id });
export const sendInput = z.strictObject({ requestKey: id, body: z.string().trim().max(4000).default(""), attachmentIds: z.array(id).max(4).default([]), share: share.optional() }).refine(v => v.body || v.attachmentIds.length || v.share, "Write a message or attach content.").refine(v => new Set(v.attachmentIds).size === v.attachmentIds.length);
export const officialInput = z.strictObject({ recipientKind: z.enum(["USER", "ORGANIZATION"]), recipientId: id, body: z.string().trim().min(1).max(4000), reason: z.string().trim().min(10).max(1000), requestKey: id });
export const preferenceInput = z.strictObject({ showActive: z.boolean(), showTyping: z.boolean() });
export const typingInput = z.strictObject({ active: z.boolean() });
export function parse(schema, value) { const result = schema.safeParse(value); if (!result.success) throw fail(400, "Provide valid messaging fields only."); return result.data; }
export function cursor(input, scope) {
  if (!input) return null;
  try {
    const v = parse(z.strictObject({ scope: z.string(), at: z.iso.datetime(), id }), JSON.parse(Buffer.from(input, "base64url").toString("utf8")));
    if (v.scope !== scope) throw Error();
    return { OR: [{ updatedAt: { lt: new Date(v.at) } }, { updatedAt: new Date(v.at), id: { lt: v.id } }] };
  } catch { throw fail(400, "This message page belongs to another view. Reload the conversation."); }
}
export const nextCursor = (rows, size, scope) => rows.length > size ? Buffer.from(JSON.stringify({ scope, at: rows[size - 1].updatedAt.toISOString(), id: rows[size - 1].id })).toString("base64url") : null;

export function messageCursor(value, scope) {
  if (!value) return {};
  try {
    const v = parse(z.strictObject({ scope: z.string(), sequence: z.string().regex(/^[0-9]{1,20}$/) }), JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (v.scope !== scope) throw Error();
    return { sequence: { lt: BigInt(v.sequence) } };
  } catch { throw fail(400, "This message page belongs to another conversation."); }
}
export const messageNextCursor = (rows, size, scope) => rows.length > size ? Buffer.from(JSON.stringify({ scope, sequence: rows[size - 1].sequence.toString() })).toString("base64url") : null;
