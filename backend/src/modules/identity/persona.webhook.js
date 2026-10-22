import { createHmac, timingSafeEqual } from "node:crypto";
const invalid = () => Object.assign(new Error("Invalid Persona webhook signature."), { status: 401 });
export function verifyPersonaSignature(rawBody, header, secret, timestamp = new Date()) {
  if (!secret || typeof secret !== "string") throw Object.assign(new Error("Identity webhooks are not configured."), { status: 503 });
  if (!Buffer.isBuffer(rawBody) || typeof header !== "string" || header.length > 4096) throw invalid();
  // During rotation Persona can send multiple space-separated t=...,v1=... pairs.
  const pairs = header.trim().split(/\s+/);
  for (const pair of pairs) {
    const match = /^t=(\d{1,12}),v1=([a-fA-F0-9]{64})$/.exec(pair);
    if (!match || Math.abs(+timestamp / 1000 - Number(match[1])) > 300) continue;
    const expected = createHmac("sha256", secret).update(`${match[1]}.`).update(rawBody).digest();
    if (timingSafeEqual(expected, Buffer.from(match[2], "hex"))) return;
  }
  throw invalid();
}
