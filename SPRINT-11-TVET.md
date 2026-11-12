# Sprint 11 — TVET Virtual Campus

TVET is an independent Campus engine for physical, in-person training. Organization workspace → Virtual Campus → TVET management contains Programs & intakes, Learners & completion, and Training & assessments. Grade School retains its own models and academic workflows.

## Delivered workflow

- Programs/trades with institution fees stored in integer minor units and currency, and optional links to the same institution's Discover program. Recording fees does not charge a learner.
- Intakes/cohorts with dates and minimum attendance, capacity-limited sections, optional modules, and instructor assignments scoped to an intake, section and/or module. Whole-intake assignments support up to 500 configured places; larger cohorts use section assignments.
- Current enabled organization staff need `organization.campus.teach` for assigned training. Academic administration uses `organization.campus.academics.manage`. Timetables reject instructor and learner-group conflicts across overlapping intakes.
- Direct, accepted-admission and returning enrolment. Accepted admissions are searchable without exposing application answers, snapshots or documents. Linked Discover programs constrain the admission route. There is one learner membership per institution and one enrolment per learner/intake; modules do not duplicate enrolment.
- PRE_REGISTERED enrolment reserves a place, with explicit activation separate from admission acceptance. Suspended membership blocks all intakes; suspended enrolment affects one intake. Withdrawn and completed records preserve history.
- Starting an intake explicitly freezes modules, required assessments and institution fee. Every section and required module needs applicable required assessments. Curriculum edits advance the intake version to reject stale starts. New modules apply to future intakes; current instructors may be replaced.
- Session-specific attendance with separate times, private drafts, complete final rosters and immutable final updates. Final absences notify only confirmed, institution-authorized parents/guardians/sponsors. Records, notifications and actor-attributed audit commit atomically.
- Score, competency and practical assessments. Numeric scores derive Competent/Not Yet Competent from maximum score and passing percentage. Competency/practical assessments take an explicit outcome. Administration defines completion requirements; instructors may add optional practice.
- Result drafts stay private. Final attempts cannot be edited. A Not Yet Competent outcome permits the next numbered reassessment, preserving earlier evidence. Competent results cannot be overwritten through a retake.
- Completion requires all applicable required assessments to have final competent outcomes and the configured minimum attendance. Present and Late count as attended; Excused is excluded. Rounded display percentages never satisfy a threshold that the actual ratio misses.
- Separate completion and certificate/achievement issuance. Certificates use unique numbers, immutable institution/learner/program/intake/result snapshots and retry-safe one-per-enrolment issuance. Administration can revoke with a reason while preserving original evidence. These records do not automatically create public posts or verify self-reported credentials.
- Shared Learning → My Campus lists learner relationships across both engines. PRE_REGISTERED learners get the welcome/Come Later flow; active and completed learners can view their own finalized records and print certificates. Instructors use organization context. Parents, guardians and sponsors use the separate Guardian access surface.
- Institution authorization plus the invited person's explicit confirmation are required for supporter access. Either party can revoke. Protected report requests recheck the current relationship; generic notifications retain no cached names or marks.
- Campus-wide announcements reach active TVET learners. Staff-only notices stay private, and completed enrolments receive no new active-learner announcement fan-out.

## Integrity and rollout

Every staff mutation requires a trusted Origin, verified email, current MFA, current membership/grants and an active Campus with a supported engine and verified Liberia operation. Learner/supporter reads recheck account/session, membership, enrolment, confirmed relationship and Campus eligibility. Sensitive writes retain the actual actor in transactional Campus audit.

Composite tenant/program/intake/section/module foreign keys, unique keys, expected versions and serialized institution mutations prevent wrong-scope records and duplicate enrolment/finalization/certificates. SQL constraints cover fees, dates, capacities, time ranges and assessment shapes. Triggers reject invalid attendance/result scope, final updates and certificate snapshot edits.

Apply additive migration `20261111210000_sprint11_tvet`, then regenerate Prisma Client before starting the updated backend (`npx prisma migrate deploy` and `npx prisma generate` from backend). There is no backfill of enrolments, activations, certificates or charges.

Operator order: configure programs/intakes/sections/modules → grant staff and assign instructors → define required assessments/schedules → start intake → enrol and explicitly activate learners → confirm applicable supporter relationships → record final attendance/results and retakes → review completion blockers → complete program → issue certificate.

BrightWay's US$1 per unique learner/program/intake billing and payment enforcement remain Sprint 12. Online course delivery remains Post-MVP. Deployment remains paused.

## Acceptance

Automated coverage includes strict schemas and HTTP session/Origin privacy; PostgreSQL tenant isolation, current permission/MFA checks, capacity and retry races, admission privacy, frozen curriculum, draft privacy, sequential retakes, transactional audit rollback, completion/certificate integrity, sponsor revocation and eligibility loss; and desktop/mobile staff, learner and sponsor journeys. Full existing regression, lint/build, migration replay, dependency audit and private-staging package checks run in GitHub Actions before merge.
