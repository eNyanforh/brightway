# Verified profile photo replacement review

This implements the locked specification rule that a replacement photo after identity verification stays private until approval. It completes a Sprint 1 dependency before organization onboarding. Organization registration is not included in this update. Windows task installation and deployment remain deferred.

## Resulting behavior

- Accounts never approved for identity verification keep the existing immediate photo replacement flow.
- After identity approval, replacement uploads create a private photo request. The approved portrait remains the current profile/header photo. The owner sees a separate private preview and may cancel or supersede a pending replacement.
- The existing dedicated BrightWay identity-reviewer permission and a valid MFA session are required. Credential-reviewer status alone grants no access. A reviewer cannot review their own photo.
- Assignment is required before images are served. The comparison screen shows the approved portrait and the proposed replacement. Decisions require an explicit reason and the exact request/profile versions.
- Approval publishes the candidate atomically. It preserves an otherwise valid identity approval through a photo-specific attestation bound to the exact new protected identity hash and current approved identity attempt. Original ID/selfie snapshots and original identity hashes are never rewritten.
- Photo approval does not verify an unverified identity, restore revoked education/experience trust, or undo a protected name/country/email change. Change-and-revert remains invalidating.
- Decline keeps the approved portrait and provides private owner feedback. Cancellation/supersession also leaves it unchanged. Rejected/replaced/cancelled candidate objects enter the existing photo cleanup flow.
- Pending images are accessible only to their owner and the assigned authorized reviewer. Storage keys and trust hashes are not returned. Images and JSON responses are private and uncached.
- The owner uses **Refresh photo review** after a decision. If other saved profile fields are unchanged, this updates the portrait and review status while preserving/rebasing unsaved drafts. If another session changed other saved fields, refresh reports a conflict and retains those drafts for explicit reload.
- Identity status also covers profiles cached before their first approval, so the photo editor explains the review gate immediately when identity approval becomes visible.

## Copy location

Stop the frontend and backend development servers with Ctrl+C before copying.

Extract this package into your existing project root:

`C:\Users\DELL\Downloads\brightway`

Merge its `backend` and `frontend` folders into the existing folders and replace the listed files. Keep existing files outside this package. No environment file, dependency, lockfile, Windows task or API credential is included. Existing profile-photo R2 settings continue to be used; ID/selfie storage and its separate retention policy are unchanged.

The replacement `backend/prisma/schema.prisma` requires the included new migration:

`backend/prisma/migrations/20261025200000_add_verified_photo_reviews/migration.sql`

Existing migrations are not changed. This is migration 19 if your checkout currently has the 18 migrations from our previous checkpoint.

## Validate and test the isolated database first

From Git Bash, with both development servers stopped:

```bash
cd ~/Downloads/brightway/backend
npx prisma validate && npx prisma generate
cd ..
npm run test:database --workspace backend -- --migrate
```

The guarded command compares `TEST_DATABASE_URL` with the application database destinations, applies the new migration only to the isolated database, generates the client, then discovers all database integration cases, including the new photo review case. This should run 15 integration files on the previous checkout. Keep the destination guard enabled. If this fails, inspect the actual failure before proceeding to the application database.

The migration creates photo-review/audit tables and a latest-review relation. It backfills the review-required flag for accounts with a recorded manual identity approval, including later-invalidated approvals. It adds a PostgreSQL uniqueness rule allowing only one active photo review per account and a constraint preventing an identity attestation without an approved photo decision and bound identity attempt. The migration is wrapped in a PostgreSQL transaction.

## Apply to the application database after the isolated check passes

```bash
cd ~/Downloads/brightway/backend
npx prisma migrate deploy && npx prisma generate
```

Confirm `20261025200000_add_verified_photo_reviews` was successfully applied before restarting the backend. Generating a client alone does not migrate the database.

From the project root, run the remaining regression checks:

```bash
cd ~/Downloads/brightway
npm run test --workspace backend
npm run test --workspace frontend
npm run lint --workspace frontend
npm run build
```

Application servers need not run during these checks. No dependency installation or new credentials are needed.

## Run the browser journey

Start the backend and frontend in separate terminals from the project root:

```bash
npm run dev --workspace backend
```

```bash
npm run dev --workspace frontend
```

1. Sign in as the identity-approved applicant at `http://localhost:5173/profile`.
2. Choose **Change profile picture**, select a suitable replacement and click **Submit photo for review**.
3. Confirm the current profile/header pictures remain unchanged and the private pending preview appears. A still-valid identity badge stays visible.
4. In a separate browser session, sign in as the authorized reviewer (`nyeswa001`) with MFA. Open `http://localhost:5173/admin/profile-photos`. The new **Profile photo reviews** link is also in the existing identity reviewer navigation.
5. Open the request and choose **Assign photo review to me**. Images must not be available before assignment. Compare both portraits, choose Approve or Decline and enter a clear reason.
6. Return to the owner and choose **Refresh photo review**. Approval changes both current portraits; decline preserves the previous portrait and shows feedback. A valid identity badge remains valid. Test cancellation with a separate pending candidate as well.
7. Confirm another account cannot fetch a pending image and revoked reviewer access cannot load comparison images or save a decision. Use a separate applicant and reviewer; self-review is forbidden.

The review flag is server-enforced even if someone changes the page or directly calls the existing upload endpoint. It is read after the uploader acquires the same account lock as identity approval, so a concurrent first approval cannot be bypassed using a stale pre-approval lookup. A photo approval does not remove unrelated verification requirements.

If the reviewer workspace returns 403, confirm the MFA session and existing dedicated identity permission. The established operator command from the project root remains:

```bash
node backend/scripts/set-identity-reviewer.js nyeswa001 grant
```

## Cleanup and production operations

The existing cleanup command now resolves `backend/.env` explicitly from either working directory:

```bash
node backend/scripts/cleanup-photos.js
```

This deletes due abandoned/replaced profile-photo objects on the application's configured storage. Current approved and pending claimed candidates are protected by service states and current-profile references. It is separate from government-ID/selfie retention cleanup. Production still requires a durable scheduled cleanup job, failure monitoring and overdue-run/backlog checks. No Windows task or production schedule is installed here.

A review left assigned to a revoked reviewer stays protected. The owner can cancel or upload a new candidate, superseding it into a fresh pending request; authorized reassignment tooling is a separate operational enhancement. No revoked reviewer is silently allowed to continue.

## Evidence and limits

See `VALIDATION-PHOTO-REVIEWS.md` and `SPRINT-1-ACCEPTANCE.md`. Mocked service/HTTP/UI tests and simulated-API Chromium checks are distinct from real PostgreSQL/R2 acceptance. The new migration and real-database integration case have not been executed in this workspace. Your prior 14 passing database cases do not prove this new case passed. Full Sprint 1 acceptance and deployment remain open until the remaining acceptance evidence is recorded.
