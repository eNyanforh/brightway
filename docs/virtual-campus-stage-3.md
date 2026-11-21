# Step 3: activation and initial configuration

The activation preview has four steps: automatic eligibility verification, Campus identity, academic engine selection, and confirmation of the current primary organization administrator. Eligible verified schools and other organizations offering education/training are supported under the existing verified Liberia operation and product rules.

`CampusOnboarding` stores one resumable draft per organization, separate from the retained Campus identity. Continue and Save and exit persist progress. Saves use expected versions and a request key/input hash, allowing retry of an interrupted save without duplicating changes. Browser refresh loads the persisted step, name and engine selection. Unsaved edits remain in the form on errors; Reload saved progress explicitly discards them.

The primary administrator completes setup through one transaction: current eligibility, membership, verified email, organization profile and MFA are checked again; the Campus and engine configuration rows are created or reused; activation and administrator confirmation are audited. Concurrent/repeated completion of an active Campus returns its existing workspace path without another activation audit or duplicate Campus. Existing engine data cannot be removed by onboarding.

Routes are under the existing Campus API prefix: GET/PUT `/onboarding` and POST `/onboarding/complete`. They inherit the non-production organization allowlist, session, Origin and write-rate guards. Production is still hard-disabled.

The primary administrator sees Activate/Resume/Open Campus on the Organization overview only after the server confirms preview eligibility. The four-step page lives at `/campus/:id/setup`. Completion navigates directly to `/campus/:id`, outside the ordinary AppLayout/Organization dashboard. The dedicated workspace displays persisted identity, administrator and engine configuration; adding an engine uses the audited Step 2 endpoint. No subjects, classes, teachers, intakes, learners, schedules or fees are required. Historical academic components are preserved; operational screens remain a later implementation stage and are explicitly unavailable in this preview.

Apply additive migration `20261121090000_campus_onboarding` after Steps 1–2 and regenerate Prisma Client. It creates an empty draft table without changing historical records. Keep preview disabled during any approved deployment. No production migration, deployment or enablement is authorized.

Tests cover persisted resume, save replay/conflicts, administrator mismatch, concurrent completion, one Campus/activation audit, no academic or financial prerequisites, disabled/production route guards, four-step UI navigation and final dedicated workspace destination. Playwright covers desktop/mobile with mocked transport; PostgreSQL tests separately exercise real persistence and authorization. Neither substitutes for real-institution acceptance.

## Results on November 21, 2026

- Backend regression: 452 passed, 55 environment/database suites skipped; database suites executed separately.
- Isolated PostgreSQL 18.7: 92 passed, no failures/skips; 82 migrations applied, replay found none pending.
- Focused frontend activation/entry/navigation: 12 passed across 3 files.
- Prisma validation/generation, production build and backend syntax passed. Frontend lint: 0 errors, 9 existing warnings.
- Full frontend run stalled before results and was stopped; full regression remains unverified locally.
- Desktop/mobile Playwright tests are committed but could not execute locally: bundled Chromium was absent and download returned HTTP 403; system Chromium then failed at launch with socket Operation not permitted. The existing browser CI workflow discovers these tests. Browser visual acceptance and real-institution acceptance remain unverified.
