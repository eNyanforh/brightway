import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { reviewPolicy } from "../src/modules/manual-identity/manual-identity.policy.js";
export function validateStagingEnvironment(env) {
  const invalid = [];
  if (env.NODE_ENV !== "production") invalid.push("NODE_ENV");
  if (env.BRIGHTWAY_STAGE !== "private-staging") invalid.push("BRIGHTWAY_STAGE");
  if (env.STAGING_DATABASE_ACK !== "isolated-staging-database") invalid.push("STAGING_DATABASE_ACK");
  try {
    const url = new URL(env.CLIENT_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) throw Error();
  } catch { invalid.push("CLIENT_URL"); }
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    try { const url = new URL(env[key]); if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw Error(); }
    catch { invalid.push(key); }
  }
  try { const host = new URL(env.DIRECT_URL).hostname; if (host.endsWith(".neon.tech") && host.includes("-pooler.")) invalid.push("DIRECT_URL (direct connection required)"); } catch { /* Already reported. */ }
  if (!/^[a-f0-9]{64}$/i.test(env.MFA_ENCRYPTION_KEY ?? "")) invalid.push("MFA_ENCRYPTION_KEY");
  if ((env.EMAIL_VERIFICATION_SECRET?.length ?? 0) < 32) invalid.push("EMAIL_VERIFICATION_SECRET");
  if (!env.RESEND_API_KEY?.trim()) invalid.push("RESEND_API_KEY");
  if (!env.EMAIL_FROM?.includes("@") || env.EMAIL_FROM.includes("example.com") || env.EMAIL_FROM.includes("onboarding@resend.dev")) invalid.push("EMAIL_FROM");
  if (!/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID ?? "")) invalid.push("R2_ACCOUNT_ID");
  for (const key of ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_IDENTITY_BUCKET"]) if (!env[key]?.trim()) invalid.push(key);
  if (env.R2_BUCKET?.trim() === env.R2_IDENTITY_BUCKET?.trim()) invalid.push("R2_IDENTITY_BUCKET (separate private bucket required)");
  if (!["default", "eu", "us", "fedramp"].includes(env.R2_JURISDICTION || "default")) invalid.push("R2_JURISDICTION");
  if (env.MANUAL_IDENTITY_RETENTION_DAYS !== "30") invalid.push("MANUAL_IDENTITY_RETENTION_DAYS");
  try { reviewPolicy(env).check(); } catch { invalid.push("MANUAL_IDENTITY_HOLIDAYS"); }
  if (env.AUTH_TIMING === "true") invalid.push("AUTH_TIMING");
  // Persona is paused. Do not accidentally activate it by carrying development provider credentials over.
  if (Object.keys(env).some(key => key.startsWith("PERSONA_") && env[key]?.trim())) invalid.push("PERSONA_* (paused)");
  if (invalid.length) throw Error(`Private staging configuration is incomplete: ${[...new Set(invalid)].join(", ")}. Values are hidden.`);
  return { valid: true, stage: "private-staging", https: true, retentionDays: 30 };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(validateStagingEnvironment(process.env))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
