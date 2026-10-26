# Sprint 1 acceptance record — 26 October 2026

This is an evidence record, not a production-readiness certificate. G1 is due 1 November 2026. The full 14-sprint production target remains 26 January 2027. Deployment is paused; private staging follows Sprint 1 acceptance. Persona is paused; manual BrightWay identity review remains the active path, with government-issued ID and selfie, all three prerequisites, five working days and 30-day decision-evidence retention.

## Subsequent GitHub implementation checkpoint

The scope below headed **Exact evidence scope** records the earlier pre-publication snapshot. It is superseded where explicitly updated here. GitHub commit `cf3baed5b75680f036c3192dee7636b275c41117` published the photo-review update; run https://github.com/eNyanforh/brightway/actions/runs/40317887766 passed both supported Node versions, including all 15 database cases without skips, clean PostgreSQL migrations and replay. Dependency patch `cda7fd0efc0ea1fb15a3cc6f5e50f55dc3f55b4a` and its security audit also passed: https://github.com/eNyanforh/brightway/actions/runs/40364720737 . No application database migration or deployment followed from those CI runs.

The authorized name-correction workflow is now implemented; see `NAME-CORRECTIONS.md` for the new migration, private owner/reviewer flow, exact trust binding, retention and acceptance instructions. Local checks passed 241 backend cases and 165 frontend cases, lint/build/schema validation; the 16 database cases were skipped locally. Its own new CI run and real owner/reviewer/R2 acceptance remain required. Earlier rows calling the workflow unimplemented are historical, not the current code state.

## Exact evidence scope

- GitHub default branch `main`: `634b931a8b525f561caddb591a4a4180da71f051`, committed 25 October 2026 at 18:52:18 UTC, rechecked 26 October. The photo-review changes and CI workflow in this package are not included in that commit. No GitHub writes or deployments were performed here.
- Prepared working copy: 228 backend tests passed, zero failed, 15 database cases skipped; 157 frontend tests passed across 15 files. Frontend lint, combined build, Prisma 7.10 schema validation/client generation, database-test JavaScript syntax and lockfile dry-run checks passed. Node 24.22.1 was used here. Node 22 execution is configured in CI, not claimed as executed here.
- Chromium with simulated APIs and generated synthetic images: pending portrait retention, approval refresh, decline preserving the current portrait, reviewer revocation clearing private images, desktop/mobile overflow and no page runtime exceptions passed. This does not establish real HTTP authorization, PostgreSQL or R2 acceptance.
- The CI workflow parses as YAML and has read-only repository permissions. It has not been pushed or executed on GitHub. It provides disposable PostgreSQL 16 service databases for both Node versions, fresh migration deployment, integration tests, migration replay and logs tied to the tested commit. No application database or cloud credentials are used by it.
- No application/test database URL or R2 credentials are configured in this workspace. No real database migrations, PostgreSQL integration run, live R2 run or real-account browser acceptance were performed during this implementation.
- Earlier user evidence carries forward separately: 14 database integration cases passed before the new photo case; identity bucket synthetic write/exact read/deletion passed; cleanup deleted two objects with no retry backlog; identity approval/badge behavior was reported working. These are not evidence for the new migration or photo flow.

## Implemented protection and remaining acceptance

| Area | Implementation/check evidence | Remaining acceptance |
| --- | --- | --- |
| Identity eligibility and decisions | Server checks complete profile plus verified education/experience, exact revisions, assignment, owner isolation and live reviewer MFA. Service/HTTP tests cover these. | Record actual correction/resubmission, decline and reviewer revocation on separate test accounts. |
| Verified photo replacement | Pending image remains private; current portrait retained; approval/decline/cancel are versioned and audited. A valid identity can follow an approved photo through an exact-bound attestation without editing its original ID/selfie snapshot. | Apply migration 19 to isolated DB, pass the new integration case, then application migration and real owner/reviewer/R2 journey. |
| Concurrent first identity approval/upload | Account review gate is read after locking. New fixture regression passes. Real SQL case pauses the uploader before locking, commits identity approval, then verifies the pending-review path. | Execute that SQL case in the guarded database suite or CI. |
| Atomic photo decision | Service tests cover rollback on audit/MFA failure. Real SQL test now also injects an audit failure after photo changes and asserts portrait/version/revision/review/audit rollback. | Execute PostgreSQL case; confirm no failures or skips in database command. |
| Verified names | Profile patch schema does not accept name/DOB fields. Legacy details route only fills missing fields after password/session checks and cannot replace existing names/DOB. Tests cover rejecting attempts to replace saved details. | The authorized name-correction request, decision and audit workflow is not implemented yet. Do not treat instructions to contact support as a completed workflow or edit Person rows directly as a substitute. |
| Recovery/MFA | Existing recovery, MFA and privileged-action tests passed within the backend/frontend regressions. Earlier real-email/backup-code results carry forward. | Record current-commit registered/unregistered reset checks, old-password/session revocation and MFA after reset. Reset must not disable/bypass the factor. |
| Privacy/retention | Existing owner/reviewer isolation, snapshot purge, deletion retry and trust-retention service tests pass. Prior real R2 probe and cleanup output carry forward. | Record due attached-snapshot/object cleanup in a controlled test with synthetic evidence; real storage failures/retries remain distinct from Map-storage fixtures. |
| Operations | CI prepared. Windows local scheduler remains intentionally deferred. | Hosted durable cleanup, failure/overdue alerts and release/restore operations remain production deployment requirements. |

## Browser checklist for the new update

Use separate consenting test accounts and browser sessions. No real government documents are needed for repeated destructive acceptance tests. Do not manufacture approval by editing trust fields in SQL.

1. A verified owner submits a replacement. Header/profile retain the approved portrait and valid badge. The pending preview is separate and private.
2. An authorized reviewer with MFA opens `/admin/profile-photos`. Images are unavailable before assignment. Another ordinary account, credential-only reviewer or password-only session cannot use this workspace.
3. Reviewer approves with a reason. Owner chooses **Refresh photo review**: both portraits change, the original identity evidence snapshot is unchanged, and unrelated drafts survive.
4. A second request is declined. Owner sees the reason, while current portrait and valid identity remain. Cancel another pending request and verify the same preservation.
5. Revoke reviewer permission or MFA and confirm protected images and decisions are denied. Self-review and stale/double decisions must be rejected.
6. Test private image URLs as anonymous and another account. Confirm candidates are never published by changing frontend flags or directly calling upload.
7. In a controlled test, change a bound verified credential revision or protected identity field. Approval/badge must invalidate; reverting values cannot restore it. Photo approval cannot repair that invalidation.

For each row, record the exact commit, database migration status, date, test-account identifiers without passwords, observed HTTP/status/UI result, pass/fail and any defect reference. Empty or unreported rows remain pending. A failed critical journey blocks G1; update the forecast rather than declaring the gate complete.
