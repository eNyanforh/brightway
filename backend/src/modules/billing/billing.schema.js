import { z } from "zod";
export const fail = (status, message) => Object.assign(Error(message), { status });
export function parse(schema, input) { const r = schema.safeParse(input); if (!r.success) throw fail(400, "Check the billing fields, amounts and selected records."); return r.data; }
const id = z.uuid(), text = max => z.string().trim().min(1).max(max).refine(v => !/[\u0000-\u001f\u007f]/.test(v));
const date = z.iso.date().transform(v => new Date(v));
export const accountQuery = z.strictObject({ q: z.string().trim().max(100).default(""), cursor: id.optional() });
export const page = z.strictObject({ cursor: id.optional() });
export const semesterInput = z.strictObject({ name: text(100), startsOn: date, endsOn: date, resumesOn: date, periodIds: z.array(id).min(1).max(20).refine(v => new Set(v).size === v.length) }).refine(v => v.endsOn > v.startsOn && v.resumesOn >= v.startsOn && v.resumesOn <= v.endsOn);
export const paymentInput = z.strictObject({ requestKey: id, reference: text(160), allocations: z.array(z.strictObject({ chargeId: id, amountCents: z.int().min(1).max(100) })).min(1).max(500).refine(v => new Set(v.map(r => r.chargeId)).size === v.length) }).transform(v => ({ ...v, allocations: [...v.allocations].sort((a, b) => a.chargeId.localeCompare(b.chargeId)) }));
export const decisionInput = z.strictObject({ decision: z.enum(["CONFIRM", "REJECT"]), reason: text(1000).refine(v => v.length >= 10), settlementReference: text(160).optional() }).refine(v => (v.decision === "CONFIRM") === Boolean(v.settlementReference));
export const adjustmentInput = z.strictObject({ requestKey: id, amountCents: z.int().min(-100).max(100).refine(v => v !== 0), reason: text(1000).refine(v => v.length >= 10) });
export const empty = z.strictObject({});
export const DAY = 86400000;
export const dueFor = semester => new Date(+semester.resumesOn + 30 * DAY);
export const outstanding = charge => charge.amountCents + charge.adjustments.reduce((n, a) => n + a.amountCents, 0) - charge.allocations.filter(a => a.payment.status === "CONFIRMED").reduce((n, a) => n + a.amountCents, 0);
export const accessState = (charge, timestamp) => {
  const balanceCents = outstanding(charge), restricted = balanceCents > 0 && charge.engine === "GRADE_SCHOOL" && !!charge.noticeAt && !!charge.enforceAt && +timestamp >= +charge.enforceAt;
  return { chargeId: charge.id, balanceCents, dueAt: charge.dueAt, noticeAt: charge.noticeAt, enforceAt: charge.enforceAt, restricted };
};
