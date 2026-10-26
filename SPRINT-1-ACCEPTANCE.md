# Sprint 1 acceptance record — 26 October 2026

G1 is due **1 November 2026**. The full 14-sprint production target remains **26 January 2027**. This record separates implementation, automated checks and user-reported acceptance; it does not approve deployment. Deployment remains paused until Sprint 1 acceptance. Persona is paused; manual BrightWay identity review is the active path.

## Confirmed evidence

- Source checkpoint: `main` at `db5161a19887d764cd4cb885a271950fbfcba1db`. This document accompanies a subsequent privacy fix, whose own CI must be checked separately.
- Name-correction CI: https://github.com/eNyanforh/brightway/actions/runs/40368076805 . Both Node 22.23.3 and 24.22.1 jobs passed. The Node 24 logs showed 241 backend cases passed, 16 database cases intentionally skipped in the ordinary suite, and all 16 cases passed without skips in the dedicated PostgreSQL 16 suite. Clean migrations and migration replay passed. Frontend, lint, build and security-audit steps passed. The prepared local source passed 165 frontend cases across 16 files.
- Earlier photo-review CI: https://github.com/eNyanforh/brightway/actions/runs/40317887766 . Both Node jobs passed, including the then-existing 15 database cases.
- Dependency-security checkpoint: https://github.com/eNyanforh/brightway/actions/runs/40364720737 . Both Node jobs passed; the patched dependency audit found zero known vulnerabilities at that check. This does not establish absence of all security defects.
- **Owner-reported acceptance on 26 October:** Emmanuel explicitly confirmed **all three** requested checks passed in his environment: the database tests, profile-photo review, and name-correction review. The exact terminal output, per-step HTTP results and local SHA were not supplied with that confirmation. Do not convert this report into independent tool execution or a pass for every negative/security case below.
- Earlier owner-reported evidence: real email recovery/MFA/backup-code journeys; identity approval, hidden Verify action and blue badge; separate applicant/reviewer accounts; private identity upload/download/anonymous denial; synthetic R2 write/exact read/deletion; cleanup of two objects with no retry backlog. These carry forward without restarting working features.

The GitHub PostgreSQL integration cases use disposable data and synthetic/Map storage, not the owner's Neon database or real R2. Local service tests also use fixtures. No application database was migrated or deployed by the assistant.

## Active rules

- Before identity submission/upload: a complete profile, at least one verified education record and at least one verified experience record; saved name and date of birth must also be present.
- Government-issued ID and selfie use the separate private identity bucket. Review target: five working days, with the configured holiday calendar. A missed target never auto-approves.
- Decision evidence/private review payloads: 30 days after decision; pending identity/name requests have a 30-calendar-day cap. Document purge alone must not revoke an otherwise valid identity.
- Identity, education and experience trust remain separate. Exact protected revisions prevent change-and-revert from restoring trust. Approved photo/name changes preserve trust only through their exact approved attestations.
- Individuals may choose MFA; privileged reviewer actions require live server-verified MFA and current permission. No self-review. Credential-only permission does not grant identity review.

## Remaining acceptance and next gate

| Area | Existing evidence | Still to record |
| --- | --- | --- |
| Database/photo/name journeys | CI and explicit owner report of all three passing | Preserve current local SHA and migration status with subsequent results. Do not reimplement these features. |
| Revoked reviewer and stale MFA | Backend/HTTP tests and SQL cases cover rejection; UI tests cover clearing private data | Separate real sessions: after revocation, evidence and decisions are denied, including a workspace already open. Restore the test reviewer's permission afterward. |
| Stale and duplicate submissions/decisions | Service and PostgreSQL race/rollback coverage | Two open tabs: one decision succeeds; stale retry conflicts without a second audit or overwrite. |
| Private documents and feedback | Owner/assigned-reviewer service guards, no-store responses and reauthorization after slow reads | Anonymous, unrelated owner and unassigned reviewer cannot retrieve private images or feedback. Never include real ID images, cookies or passwords in acceptance notes. |
| Retention and deletion retry | Existing grace-period/retry tests; new feedback privacy regressions described below | Dedicated synthetic test evidence for due attached-payload cleanup, object deletion failure/retry and no trust loss. A zero-due cleanup run alone does not prove this case. |
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

No schema migration, new bucket or API key is required for this fix. Its tests include exact-deadline withholding before cleanup, assignment privacy, legacy repair, audit-failure rollback and unchanged valid identity. The existing PostgreSQL case now also asserts feedback removal and preservation of decision audit records. Check this commit's CI before calling its SQL assertions passed.

See `SPRINT-1-SECURITY-CHECKS.md` for the next manual checks. G1 remains open; do not start deployment or declare full production readiness from passing code checks alone.
