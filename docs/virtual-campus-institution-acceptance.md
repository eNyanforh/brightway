# Virtual Campus — Real-Institution UAT and Security Sign-off

**PR #167 — NOT SIGNED OFF.** This is an executable plan and evidence ledger, not a claim that real-institution testing has occurred.

## Automated evidence on 17 November 2026

- [Browser acceptance — run 44143598377](https://github.com/eNyanforh/brightway/actions/runs/44143598377): **230 tests: 220 passed, 10 skipped, 0 failed**, desktop and mobile, using intercepted synthetic API responses.
- [Node 22/24 and isolated PostgreSQL — run 44143598816](https://github.com/eNyanforh/brightway/actions/runs/44143598816): backend and frontend tests, lint, build, clean migrations, database integration and migration replay passed on both Node versions. Both jobs remain FAILED at their mandatory dependency security gate.
- [Private staging package — run 44143598481](https://github.com/eNyanforh/brightway/actions/runs/44143598481): passed.
- Security: [GHSA-fc5q-39xc-vjpf / CVE-2026-112366](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) affects picomatch through 4.0.7; the upstream advisory reports no published patched release. Do not suppress audit or claim remediation without verified evidence.

## Real-institution prerequisites

Two separately verified and approved Liberia institutions (one GRADE_SCHOOL, one TVET), with an ACTIVE Campus and consent for UAT. Prefer their de-identified staging copies. Distinct, authorized sessions are required for school administrator/teacher/learner/confirmed guardian, TVET administrator/instructor/learner/confirmed supporter, and an outsider account with no membership in either institution.

Select one actual registration and assigned offering in the Grade School, one actual enrolment and instructor assignment in TVET. Both institutions must have existing charged registrations/enrolments for fee verification. **Never use production grades, payments, certificate issues, or notification flows for destructive testing.**

## Read-only institutional API smoke

Run the checked-in script at scripts/campus-institution-smoke.mjs using Node 22+ on a private approved runner. It sends only GET requests against the deployed API, checks role-specific data, denies unauthorized access and cross-tenant access, verifies the grade-school/TVET engine, $1 platform charges, account-private records, and no-store cache headers. The script does not print response bodies or make writes.

Provide through a private secrets manager, not committed files or PR comments:

| Category | Required environment variables |
| --- | --- |
| Target/ack | BW_UAT_BASE_URL (HTTPS origin), BW_UAT_READ_ONLY_ACK=I_APPROVE_READ_ONLY_CHECKS |
| Institution IDs | BW_UAT_SCHOOL_ID, BW_UAT_TVET_ID |
| Record IDs | BW_UAT_SCHOOL_REGISTRATION_ID, BW_UAT_SCHOOL_OFFERING_ID, BW_UAT_TVET_ENROLMENT_ID, BW_UAT_TVET_ASSIGNMENT_ID |
| Sessions | BW_UAT_SCHOOL_ADMIN_COOKIE, BW_UAT_SCHOOL_TEACHER_COOKIE, BW_UAT_SCHOOL_LEARNER_COOKIE, BW_UAT_SCHOOL_GUARDIAN_COOKIE, BW_UAT_TVET_ADMIN_COOKIE, BW_UAT_TVET_INSTRUCTOR_COOKIE, BW_UAT_TVET_LEARNER_COOKIE, BW_UAT_TVET_SUPPORTER_COOKIE, BW_UAT_OUTSIDER_COOKIE |

Command: node scripts/campus-institution-smoke.mjs

Do not upload cookies, account credentials, learner identities, financial records, request/response bodies, or raw traces into public CI artifacts. Expire all UAT sessions after use. A passing probe demonstrates *real API read access and denial* only. It does not verify workflows that modify institutional data or UI rendering.

## Supervised write-path staging UAT — all pending real evidence

| Scenario | Persisted evidence required | Status |
| --- | --- | --- |
| Campus eligibility and workspace | Verified Liberia operation; independent workspace/switching; ACTIVE and PAUSED permission behavior | NOT EXECUTED |
| Grade School setup | Academic years/periods, classes/sections, offerings, teacher assignment, conflict rejection, SQL/audit snapshots | NOT EXECUTED |
| Grade School registration | Direct/accepted/returning, pre-registration waiting, activation and fee generation (not on admission) | NOT EXECUTED |
| Grade School attendance | DRAFT no notification, FINAL exactly one guardian notification, immutable final record | NOT EXECUTED |
| Grade School results | Weighted finalized assessments; matching staff/student/guardian reports; suspension and guardian revocation | NOT EXECUTED |
| TVET setup and enrollment | Programs/intakes/sections, assignments and scheduling, learner intake/activation, SQL/audit snapshots | NOT EXECUTED |
| TVET attendance and competency | DRAFT/FINAL, retake history, only assigned instructors may submit, immutable final records | NOT EXECUTED |
| TVET completion and certificates | Deny early completion; issue once after requirements; verify immutable snapshot and audited reasoned revocation | NOT EXECUTED |
| Authorization | Copied deep links, outsider/cross-tenant denial, MFA, staff revocation, guardian/supporter revocation and account switch | NOT EXECUTED |
| Platform billing | School US$1 per student/semester; TVET US$1 per learner/intake; charge uniqueness, settlement, receipt reconciliation, adjustments and audit immutability | NOT EXECUTED |
| Resilience and accessibility | 375px mobile and desktop, keyboard, screen-reader, private-cache invalidation, backup/restore drill | NOT EXECUTED |

For each row, record build SHA, date/time, institution and role (no direct identifiers), two witnesses, expected vs actual result, de-identified SQL/audit evidence, and ticket ID for defects. Only execute writes on institution-approved staging data with a tested restore plan.

## Exit criteria

All mandatory checks GREEN for the final PR head (including security audit); read-only real-API smoke PASS; every supervised staging UAT row PASS with de-identified evidence; explicit institution/founder/security approval. No merge or deployment until all conditions are met.
