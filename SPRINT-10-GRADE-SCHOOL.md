# Sprint 10 — Grade School Virtual Campus

## Delivery

The active Grade School Campus now has an academic workspace alongside Campus settings and announcements. TVET retains its separate Sprint 11 engine. Admission acceptance does not automatically register, activate or bill a learner.

- Subjects with percentage passing marks; class levels and capacity-limited sections.
- Academic years longer than four calendar months; terms/semesters contained within a year without overlapping periods in that year. Future years may be prepared while a current year operates.
- Period/section subject offerings with compulsory or elective status. One current teacher per offering is enforced by the period + section + subject unique key. Reassignment requires the current version and records both teachers in audit.
- Direct registration by BrightWay identity, searchable accepted-admission registration, and returning registration from a previously activated school period. A retry cannot duplicate a registration or its electives. Compulsory subjects automatically apply to the section; electives are selected for the individual registration and period.
- Separate school membership and period-registration states: PRE_REGISTERED, ACTIVE, SUSPENDED and FORMER. Membership suspension blocks every period. Period registration preserves placement and results. Explicit administrative activation enables a registration; no payments or charges are introduced in this sprint.
- Timetables tied to the actual subject offering and teacher, with section/teacher conflicts checked across overlapping academic periods.
- Subject lesson attendance only, with separate session times when a subject meets more than once on one date, and Present, Absent, Late and Excused statuses. Drafts remain internal. A complete final roster is required; final records are locked and confirmed guardian absence notifications are committed atomically once.
- Weighted assessments with independently defined maximum scores, draft score entry, complete final submission and locked final grades. Student reports include only finalized records; a subject without finalized assessments has no fabricated grade.
- School-authorized guardian invitations require the guardian's explicit confirmation. Only confirmed relationships grant student-report access or absence alerts. The guardian or academic administrator can revoke access. Notification text does not retain student names/marks after revocation.
- Learning > My Campus is a learner surface with own timetable, results, attendance and explicitly campus-wide announcements. Existing announcements and new announcements default to staff-only; learners never receive or read staff-only notices. A PRE_REGISTERED student sees the agreed welcome message and Come Later action, with no academic entry. Student campuses also appear in My Workspace before activation. Teachers use organization context and only their assigned subjects. Guardian access is separate from the student My Campus surface.
- Printable school/student/period reports, final subject gradebooks, paginated student and accepted-admission lists, current access rechecks and actor-attributed audit records.

## Authority and integrity

`organization.campus.academics.manage` grants academic administration. The distinct `organization.campus.teach` permission grants only assigned teaching; it does not grant setup, registration, staff management or whole-student reports. A teacher must be an enabled school staff member before assignment. Staff mutations require verified email and current MFA. All operations retain Sprint 9's active Campus, approved institution and verified Liberia operating-location gates.

Composite school/record foreign keys prevent cross-school references. Unique registration and offering keys, serialized school mutations, optimistic versions, score/date/capacity checks, trusted Origin, private responses and rate limits apply on the backend. Academic history is retained without delete/recreate operations. Draft replacement and final notifications roll back if audit persistence fails. Learner/guardian reports recheck current ownership, status and confirmed relationship before returning.

## Operator path

1. Apply migrations and regenerate Prisma Client. On an eligible Grade School Campus, open Organization workspace → Virtual Campus → School management.
2. Configure subjects, classes/sections, academic year and period, then offer subjects to sections. Give accepted staff the teaching permission and assign them in Teaching & attendance.
3. Register students for the selected period and electives. Accepted applicants can be chosen without exposing their application answers or documents. Activate registrations explicitly once school requirements are satisfied.
4. Authorize guardian relationships; guardians confirm through Learning → Guardian access.
5. Teachers open their organization workspace, choose an assigned subject, save attendance/scores as drafts, then submit complete final records.
6. Students use Learning → My Campus; administrators use View report beside a registration. Printing expands assessment and attendance details.

## Validation and rollout

Migration: `20261111200000_sprint10_grade_school`. Run `npx prisma migrate deploy` and `npx prisma generate` from backend before starting the updated server. This is additive and does not backfill student registrations or billing.

Regression coverage includes field/calendar validation, HTTP session/Origin protection, frontend setup/teacher/student/guardian flows, and real PostgreSQL scenarios for tenant isolation, current grants/MFA, capacity, accepted and returning registrations, electives, guardian confirmation/revocation, draft privacy, concurrent finalization, notification deduplication, weighted grades, audit rollback, membership suspension, Campus pause and operating-location loss.

Desktop and 375px mobile component acceptance used synthetic school/student identities. Production database and real-school acceptance remain separate rollout checks. Deployment remains paused. Campus billing and payment enforcement remain Sprint 12 work.
