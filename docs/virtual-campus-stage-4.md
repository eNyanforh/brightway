# Step 4 — independent management workspace

The new `/campus/:id` shell sits outside AppLayout and the ordinary Organization workspace. It reuses organization identities, memberships, staff invitations and the existing academic, finance and communications services. The initial activation flow remains at `/campus/:id/setup`; completed activation opens this shell immediately, with no academic prerequisites.

Navigation has eight responsibility areas: dashboard, Grade School, TVET, admissions/enrollment, staff/administration, finance/billing, communications, reporting/settings. Academic tools are secondary navigation inside their engine, not duplicated in the sidebar. Only server-authorized areas are returned. Counts are real database aggregates and are omitted for teachers without academic-management permission. Forms and reports reuse existing components and APIs.

`GET /campus/workspace/:section` (under the existing organization API prefix) checks session, current membership, active Campus, Liberia eligibility and per-engine grants. An unauthorized section returns 403. Teachers/instructors retain assignment-level restrictions in academic services. Registrars use organization admission-review permission and/or the appropriate engine's existing academic-management grant; a separate narrower enrollment-only permission is not introduced by this stage. Finance uses the existing Campus billing permission. Staff invitation requires the independent organization membership-management permission. Only the primary administrator can change scoped Campus grants.

Production is still hard-disabled. The preview router mounts academic, announcement and institutional billing APIs only for explicitly allowlisted organizations. Platform management billing remains unmounted. Personal My Campus lists are filtered to the allowlist; copied registration, enrolment and relationship URLs are checked against that list before academic services apply ownership/confirmed-relationship rules. My Campus is available through existing Learning views without rebuilding global navigation.

No tables or records are replaced. No new migration is required; prior Stage 1–3 migrations and Prisma generation remain prerequisites. No production data, merge or deployment is authorized.

Validation additions cover engine-scoped navigation, denied finance/foreign links, permission-list access, current session/route gates, stale response suppression and access withdrawal. Existing Grade School/TVET database tests remain responsible for assignment, enrollment, guardian and sponsor rules. Browser activation fixtures now land in the actual shell. Manual visual/accessibility review, browser-to-real-backend journeys, and real-institution acceptance remain outstanding release gates.

## Local verification (November 28, 2026)

- Backend: 453 passed, 55 skipped; isolated database suites executed separately.
- PostgreSQL: 94 passed, no failures/skips; 82 migrations applied and replay clean.
- Focused frontend: 17 passed across workspace, activation, organization bootstrap and Learning tests.
- Build and syntax checks passed; lint has zero errors and nine existing warnings.
- Latest-commit CI and desktop/mobile browser acceptance are pending at publication.
