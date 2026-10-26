# Audited name corrections

This closes the implemented name-correction workflow gap recorded during Sprint 1. It does not accept Sprint 1 or deploy the application. Identity, education and experience trust remain separate. Persona remains paused.

## Owner and reviewer journey

An owner with a currently approved manual BrightWay identity opens **Request a name correction** from `/manual-identity`. The direct URL is `/manual-identity/name-change`.

The owner supplies a proposed first/middle/last name, a reason, the unchanged current password and fresh private government-ID/selfie uploads. Middle name may explicitly be cleared. Date of birth, gender, email, credentials, ownership and trust flags are not editable through this request. The saved name, public portrait and existing valid identity remain unchanged while it is pending.

The existing dedicated identity-reviewer permission and a current MFA session grant access to `/admin/name-changes`; a link appears with the other identity-reviewer tools. Credential-only permission grants no access. Reviewers cannot review their own requests. Before assignment, proposed names, reasons and evidence are withheld. After assignment, compare the current approved portrait with the fresh government-issued ID and selfie, check the proposed name, and explicitly approve or decline with feedback. The UI waits for all three private images before offering its decision form.

Approval changes only the requested name, increments the protected Person revision and saved profile version, and writes an exact identity attestation and decision audit in the same transaction. Original identity attempts, their names/ID/selfie snapshots, and original identity hashes are never rewritten. The new attestation preserves an otherwise valid identity only for the same account, current approved identity attempt, exact new protected identity hash and unchanged verified credential revisions. Later unreviewed identity changes, reverting values or revoked/changed credentials cannot reuse it. Subsequent approved portrait replacements compose with the corrected identity.

Decline or owner cancellation keeps the saved name and existing identity unchanged. The owner sees request history and private feedback. **Reload name-correction status** also refreshes the authenticated account name, updating the app header when approval is visible. It preserves a still-unsaved proposed name/reason on a normal reload and clears passwords. Form details/files are kept only in page memory; keep the tab open while preparing a request.

## Concurrency, recovery and access controls

- Trusted Origin and a cookie-authenticated session are required for mutations. Current-password attempts are limited to five per account per 15 minutes and committed before expensive password work; wrong guesses remain counted. If the account has MFA enabled, its current session must still prove that factor.
- Password hashing/verification and R2 network calls occur outside write transactions. Account/password/session state is checked again before a write.
- Requests bind the current Person revision and saved profile version. One active request per account is enforced in PostgreSQL. Up to five requests may be submitted per rolling day. Expired pending requests are explicitly audited as expired when superseded by a fresh request.
- Submission uses an owner-bound UUID idempotency key and input hash excluding the password. A lost response can retry the same request; changing its content conflicts. Fresh ID/selfie records are owner-, type-, expiry- and state-bound and claimed atomically. PostgreSQL prevents evidence belonging to both an original identity attempt and a name correction.
- Assignment/decisions require exact versions. Decisions lock the applicant and reviewer accounts, then the profile and person, recheck eligibility/current identity, and recheck live role/MFA before commit. Failed audits roll the name, revisions, latest-proof pointer and attestation back together.
- Private current portraits and ID/selfie images are served without caching. Slow storage reads reauthorize afterward; revoked permissions cannot receive the resulting bytes. Storage keys, passwords and trust hashes are not returned to the UI.

## Review timing and retention

Review targets use the existing five-working-day calendar, excluding configured holidays. A missed target does not approve a request. Pending requests expire after 30 calendar days.

`MANUAL_IDENTITY_RETENTION_DAYS=30` and a valid configured review calendar are required. Submitted correction evidence, previous/proposed name snapshots, reason and reviewer feedback are retained for 30 days after a decision; pending requests have a 30-day cap. Private projections and downloads stop exposing payloads when retention ends, even before cleanup runs. The existing identity cleanup command now also purges correction payloads and queues its evidence for retriable object deletion:

```bash
node backend/scripts/cleanup-manual-identity-reviews.js
```

Minimal actor/action/time audit and exact trust hashes remain separate from document payloads. A retention purge alone does not revoke an otherwise valid identity. No Windows task or production scheduler is installed. Hosted cleanup scheduling and failure/overdue monitoring remain deployment requirements.

## Pull and migrate when returning to development

Stop the local servers and obtain the updated GitHub source with your usual safe pull workflow. If the working tree has uncommitted changes or `git pull --ff-only` refuses, preserve and inspect those changes; do not reset or clean them away.

Migration 20 is `20261026200000_add_identity_name_changes`. Migration 19 for photo reviews is also required; deploy applies both if still pending. Test the isolated database before the application database:

```bash
cd ~/Downloads/brightway
npm ci
cd backend
npx prisma validate && npx prisma generate
cd ..
npm run test:database --workspace backend -- --migrate
```

This now discovers 16 integration files. Keep `TEST_DATABASE_URL` distinct from the application URLs and retain the existing destination guard. After the isolated checks pass:

```bash
cd backend
npx prisma migrate deploy && npx prisma generate
cd ..
npm run test --workspace backend
npm run test --workspace frontend
npm run lint --workspace frontend
npm run build
```

Restart the frontend/backend in separate terminals and perform the real owner/reviewer journey with consenting test accounts. Reuse the configured private identity bucket for ID/selfie and configured profile-photo bucket for the current portrait. No new API key or bucket is needed. The application database has not been migrated by these GitHub changes.

## Validation at publication

The prepared source passed 241 backend service/HTTP/unit cases, with 16 database cases skipped locally, and 165 frontend cases across 16 files. Frontend lint, combined build and Prisma schema validation passed. The new PostgreSQL case covers concurrent same-key submissions, assignment/decision races, rollback on a deliberately failed audit, real trigger-produced revisions, immutable original snapshots, composition with approved photo replacement, revocation, retention and change-and-revert invalidation. Its JavaScript syntax was checked locally; actual SQL execution is left to GitHub CI and the isolated database command.

Native Chromium was exercised at 1280px and 390px with simulated APIs and synthetic WebP images. Upload/submit, saved-name retention until approval, assignment before private details, all three evidence images, explicit decision, owner/auth refresh, no horizontal overflow and no page runtime errors passed. These are UI checks; they do not prove real R2 or application-database acceptance.

The preceding commits' GitHub CI runs passed both Node 22 and Node 24, including all 15 then-existing PostgreSQL cases and clean migration replay. The dependency patch also passed the new security audit. The new name-correction commit needs its own 16-case CI result; do not transfer the earlier pass to this change.
