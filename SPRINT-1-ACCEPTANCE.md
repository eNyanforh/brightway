# Sprint 1 acceptance record — 26 October 2026

G1 is due **1 November 2026**. The full 14-sprint production target remains **26 January 2027**. This record separates implementation, automated checks and user-reported acceptance; it does not approve deployment. Deployment is now paused until after Sprint 2 acceptance, including private staging; see the subsequent owner decision below. Persona is paused; manual BrightWay identity review is the active path.

## Confirmed evidence

- Reviewed source checkpoint: `main` at `ed376dc98025f9a6d896b8eff54b9517d843a96d`, committed 26 October 2026 at 19:27:58 UTC. This follow-up changes documentation only.
- Privacy-fix CI: https://github.com/eNyanforh/brightway/actions/runs/40386996948 . Rechecked completed/success for that exact SHA. Both Node 22 and Node 24 jobs passed. Its Node 24 logs recorded 243 backend cases passed, 165 frontend cases passed, all 16 PostgreSQL integration cases passed without skips, clean migrations/replay and zero known dependency findings at that check. The ordinary backend run intentionally skips the 16 database cases; the dedicated job executes them.
- Name-correction CI: https://github.com/eNyanforh/brightway/actions/runs/40368076805 . Both Node 22.23.3 and 24.22.1 jobs passed. The Node 24 logs showed 241 backend cases passed, 16 database cases intentionally skipped in the ordinary suite, and all 16 cases passed without skips in the dedicated PostgreSQL 16 suite. Clean migrations and migration replay passed. Frontend, lint, build and security-audit steps passed. The prepared local source passed 165 frontend cases across 16 files.
- Earlier photo-review CI: https://github.com/eNyanforh/brightway/actions/runs/40317887766 . Both Node jobs passed, including the then-existing 15 database cases.
- Dependency-security checkpoint: https://github.com/eNyanforh/brightway/actions/runs/40364720737 . Both Node jobs passed; the patched dependency audit found zero known vulnerabilities at that check. This does not establish absence of all security defects.
- **Owner-reported acceptance on 26 October:** Emmanuel explicitly confirmed **all three** requested checks passed in his environment: the database tests, profile-photo review, and name-correction review. The exact terminal output, per-step HTTP results and local SHA were not supplied with that confirmation. Do not convert this report into independent tool execution or a pass for every negative/security case below.
- **Subsequent owner-reported acceptance on 26 October:** reviewer permission revocation/restoration passed; the second stale decision was rejected as expected; private-document access protection passed; the requested targeted privacy/retention regression command returned **48 passed**. These are explicit conversation reports, not independently observed browser/network logs. They do not establish live storage deletion failure/retry or the original identity correction/resubmission journey at that checkpoint.
- **Later owner report:** the original identity Changes requested → fresh evidence → resubmission → approval browser journey worked as expected. Its manual acceptance is now recorded as passed by owner report. The remaining evidence gap is the real-storage attached-document retention cycle.
- Earlier owner-reported evidence: real email recovery/MFA/backup-code journeys; identity approval, hidden Verify action and blue badge; separate applicant/reviewer accounts; private identity upload/download/anonymous denial; synthetic R2 write/exact read/deletion; cleanup of two objects with no retry backlog. These carry forward without restarting working features.

The GitHub PostgreSQL integration cases use disposable data and synthetic/Map storage, not the owner's Neon database or real R2. Local service tests also use fixtures. No application database was migrated or deployed by the assistant.

## Active rules

- Before identity submission/upload: a complete profile, at least one verified education record and at least one verified experience record; saved name and date of birth must also be present.
- Government-issued ID and selfie use the separate private identity bucket. Review target: five working days, with the configured holiday calendar. A missed target never auto-approves.
- Decision evidence/private review payloads: 30 days after decision; pending identity/name requests have a 30-calendar-day cap. Document purge alone must not revoke an otherwise valid identity.
- Identity, education and experience trust remain separate. Exact protected revisions prevent change-and-revert from restoring trust. Approved photo/name changes preserve trust only through their exact approved attestations.
- Individuals may choose MFA; privileged reviewer actions require live server-verified MFA and current permission. No self-review. Credential-only permission does not grant identity review.

## Historical acceptance checklist — superseded where noted below

| Area | Existing evidence | Still to record |
| --- | --- | --- |
| Database/photo/name journeys | CI and explicit owner report of all three passing | Preserve current local SHA and migration status with subsequent results. Do not reimplement these features. |
| Revoked reviewer and stale MFA | Owner reports revocation/restoration passed; backend/HTTP/SQL tests cover live MFA rejection, UI tests private-data clearing | Revocation browser acceptance complete by owner report. No separate report of an MFA-expiry browser case; automated coverage remains distinct. |
| Stale and duplicate submissions/decisions | Owner reports the two-tab stale-decision check passed; service/PostgreSQL race and replay coverage passed | Manual stale-decision acceptance complete by owner report. No new blanket claim for every duplicate-request scenario. |
| Private documents and feedback | Owner reports private-document access protection passed; the 48-case regression includes assignment/feedback privacy | Document access browser acceptance complete by owner report. No request-by-request HTTP transcript was supplied. |
| Retention and deletion retry | Owner reports 48 targeted cases passed; current CI passed SQL feedback purge, grace-period and synthetic-storage deletion coverage | Real-bucket attached-document expiry/deletion cycle remains unrecorded. Earlier real R2 probe and two-object cleanup do not establish this entire case. Storage-failure/retry is tested with injected storage, not claimed as a live R2 outage test. |
| Original identity correction/resubmission | Service/UI tests cover changes requested, fresh evidence, preserved review target and trust separation | Owner explicitly reports this browser sequence worked as expected. Carry the pass forward; do not ask for a repeat. |
| Recovery/MFA | Earlier real-email owner report plus automated regressions | Tie the carried-forward results to the accepted revision, or rerun if affected code changes. Unregistered addresses get no code; password reset does not bypass MFA. |
| Operations | CI is operational; Windows task was intentionally deferred | Hosted durable cleanup, failure/overdue monitoring, restore and release operations remain production requirements. Configure them when hosting is selected; do not reinstall a Windows task as a deployment prerequisite. |

Use consenting test accounts. Record date, SHA, actor labels, expected/observed result, pass/fail and defect reference for each remaining case. Do not edit application trust flags or move the application clock to manufacture acceptance. Controlled retention tests belong in the isolated database with synthetic files.

## Privacy fix accompanying this record

The original manual-identity projection exposed reviewer feedback without the same assignment/retention guards used for its snapshot. Cleanup removed the snapshot but left both attempt feedback and its duplicate audit text. The fix:

1. Returns feedback only to the owner or currently assigned reviewer and only before the exact retention deadline.
2. Keeps new free-text feedback on the retention-controlled attempt, not duplicated in the permanent action audit.
3. Clears due feedback and legacy audit copies in the same transaction as snapshot purge and evidence deletion queuing.
4. Repairs feedback left on already-purged attempts by earlier cleanup versions without duplicating purge audit events.
5. Preserves actor/action/time/state records and exact verification hashes; failures roll back and remain retriable.

No schema migration, new bucket or API key is required for this fix. Its tests include exact-deadline withholding before cleanup, assignment privacy, legacy repair, audit-failure rollback and unchanged valid identity. The existing PostgreSQL case now also asserts feedback removal and preservation of decision audit records. The privacy-fix CI referenced above executed those SQL assertions successfully.

This historical checkpoint preceded the later owner-reported passes below. Preserve those results; do not treat its superseded pending items as requests to repeat accepted journeys. G1 still requires explicit owner acceptance, and deployment remains paused through Sprint 2.

## Historical G1 assessment before the final retention result

**Open; not yet accepted.** Implementation and regression checks passed at the reviewed SHA. The owner has confirmed the main database/photo/name journeys and the three requested security browser checks. Carry these passes forward.

The original identity changes-requested/resubmission path has subsequently been confirmed by the owner and is no longer pending. Close the controlled real-storage retention evidence gap using synthetic documents with the guarded runner in IDENTITY-RETENTION-CHECK.md. No unrecorded failure is asserted; these are evidence gaps.

Hosted cleanup scheduling/alerts, private staging configuration and restore operations remain tracked deployment/production work. They have not been installed or proven by local tests. The deployment pause remains in effect, and the next gate date stays 1 November. If a required case fails, fix it and update the forecast rather than silently accepting the gate or shrinking the agreed release.

## Guarded retention acceptance runner

`backend/scripts/check-identity-retention.js --run` now provides a fixture-scoped database-to-storage check; see `IDENTITY-RETENTION-CHECK.md`. It requires an isolated database destination and existing private identity storage configuration, uses generated synthetic images, and restricts cleanup to its own records and exact generated object keys. It exercises a real submission/decision, exact expiry, ten-minute deletion grace, one injected pre-provider deletion failure, retry, authenticated absence checks, preserved trust and cleanup. The injected failure is not a claim that R2 itself failed. Its SQL test uses Map storage in CI; only a successful user run against R2 closes the real-storage evidence gap. No cloud run has been performed in this workspace.

## Final owner-reported Sprint 1 evidence — 26 October

Emmanuel subsequently reported **PASS** for the guarded real-storage retention command after it was supplied. This records the database-to-R2 synthetic retention acceptance by owner report; the detailed output and local SHA were not included. The probe's exact implementing commit is `cfb5730e567eac04d8f3142a73e48163d1c378c5`; CI https://github.com/eNyanforh/brightway/actions/runs/40391774551 passed both Node jobs, including 247 backend cases, 165 frontend cases and 17/17 real PostgreSQL cases. CI storage was Map-backed; the owner's live PASS is separate evidence.

This supersedes earlier rows calling that live cycle or the original correction/resubmission journey pending. All specifically identified Sprint 1 evidence gaps in this record have now received passing automated or owner-reported results. The implementation is **ready for owner acceptance of G1**; no independent cloud/browser observation or formal whole-product production readiness is asserted. The owner then requested proceeding with private staging preparation. See PRIVATE-STAGING.md for the provider-neutral package and the distinct hosted acceptance requirements. No environment has been provisioned or deployed, and no paid resources or alerts have been created. Public deployment remains paused.

## Subsequent deployment decision — 27 October

The owner paused deployment until after Sprint 2 acceptance, including private staging. The existing preparation package remains parked; it does not authorize provisioning. Continue organization onboarding under SPRINT-2-ORGANIZATIONS.md while preserving the recorded Sprint 1 results.
