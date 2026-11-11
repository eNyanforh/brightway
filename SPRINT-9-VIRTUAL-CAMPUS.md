# Sprint 9 — Virtual Campus Core

Virtual Campus is an opt-in, Liberia-restricted product. Organizations outside Liberia retain global Programs, Admissions and other BrightWay features.

## Eligibility
An active, approved, verified organization must have a separately verified operating location in Liberia and be approved for Grade School or TVET. ProductAvailability enables only VIRTUAL_CAMPUS/LR at MVP. An overseas headquarters with a verified Liberia site can qualify; a Liberia headquarters without a verified Liberia operating site cannot.

## Lifecycle and administration
Primary administrators explicitly configure SETUP, then activate ACTIVE. Campus never activates from organization approval or accepted admission. Pause disables Campus grants, resume rechecks eligibility. Revoked verified locations or product availability block an otherwise ACTIVE stored Campus immediately. Engine choice is immutable after activation.

Campus settings, announcements, staff notifications and actor-attributed immutable audit apply to both engine types. Staff permissions for Campus management, announcements, academics and billing are never effective before activation. Every mutation requires active membership, verified email and MFA, with optimistic version checks. Announcements are private to authorized Campus staff and published using retry-safe keys.

Sprints 10 and 11 build separate Grade School and TVET academic models. Sprint 12 builds the audited ledger and charging. Sprint 9 creates no student registration, attendance or billing charge. Learning > My Campus remains learner-only once implemented.

## Rollout
Apply migration 20261111190000_sprint9_virtual_campus_core and run Prisma generate before backend startup. Run Node regressions, Prisma validation, frontend lint/build, isolated PostgreSQL migration and integration tests, plus desktop/mobile browser acceptance.

Deployment remains paused.
