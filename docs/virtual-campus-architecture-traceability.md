# Virtual Campus — Architecture → Implementation Traceability
Baseline: `BrightWay_COMPLETE_MASTER_ARCHITECTURE.docx` (October 2026), sections 17–21, 23–29, 32; later approved decision: **a dedicated Virtual Campus workspace**, distinct from the universal organization workspace.

Review date: 2026-11-17  
Branch: `feat/virtual-campus-module-alignment-20261117`  
Scope: route-level navigation alignment, role/engine visibility, and preserving existing academic engines and their APIs. This is **not** a declaration of production readiness.

## How statuses are used

- **Prior:** based on source, tests and migration inventory inspected; “present” does not mean production-verified.
- **Validation:** source trace / added Vitest / updated Playwright / existing database tests. Tests are **not claimed executed** until a linked CI run succeeds.
- **Final:** “pending CI” means implementation is present in this branch but unverified; “needs live acceptance” explicitly prevents claiming end-to-end completion.

| Architecture requirement | Existing implementation location | Previous implementation status | Changes made | Validation performed / evidence | Final status |
|---|---|---|---|---|---|
| Independent institutional workspace, shared account and membership | `CampusWorkspacePage.jsx`, `AppLayout.jsx`, `OrganizationNavigation.jsx`, `organization-staff.service.js` | Partial: distinct URL existed, but Academics still grouped everything in tabs | Module-level routes and Campus-only grouped navigation | Source trace; navigation unit and browser regressions added | Changed; CI pending |
| Permission-aware navigation and deep-link protection | `CampusNavigation.jsx`, `CampusSetupOverview.jsx`, campus/grade-school/TVET services | Partial: generic Academics link and internal tabs | New `campus-modules.js`, section authorization, engine-specific deep links | `campus-navigation.test.jsx`; direct unauthorized URL Playwright assertion | Changed; CI pending |
| Update effective Campus state after setup/activation/pause | `campus.service.js`, `CampusSetupOverview.jsx`, `CampusWorkspacePage.jsx` | Partial: backend state existed; navigation did not re-read effective grants | Propagate Campus status, engine, updated permissions to layout context | Source trace; existing `campus.spec.mjs` | Changed; CI pending |
| Liberia operation, organization approval, product availability | `campus.service.js`, `ProductAvailability`, `OrganizationOperatingLocation` | Present in backend | No business rule changes | `campus.database.test.js`, `campus.spec.mjs` exist; CI pending | Preserved; live acceptance needed |
| Campus lifecycle SETUP/ACTIVE/PAUSED/BLOCKED; explicit activation | `campus.routes.js`, `campus.service.js` | Present in backend | Navigation now gates academic modules on effective ACTIVE state | Existing lifecycle browser/database tests, not run locally | Preserved; CI pending |
| Builder Super Admin, delegated administrators, accepted staff, current MFA | `organization-staff.service.js`, `campus.service.js`, academic services | Present in backend; scoped staff grants | Display allowed modules by engine and current grant; no role promotion added | Existing `organization-staff.database.test.js`; new navigation test | Preserved; CI pending |
| Grade School subject names and passing marks | `GradeSchoolWorkspace.jsx`, `grade-school.service.js`, `GradeSchoolSubject` | Present in UI/API/schema | Exposed from Academic setup route | Existing `grade-school.database.test.js` | Preserved; CI pending |
| Class levels, sections, capacity; subject offerings and electives | Same; `GradeSchoolClass/Section/Offering/Elective` | Present | Exposed from Academic setup route | Existing Grade School integration tests | Preserved; CI pending |
| Academic years >4 months, terms/semesters, historical periods | `GradeSchoolWorkspace.jsx`, `grade-school.service.js`, `GradeSchoolYear/Period` | Present | Retained period selection, no destructive migration | Existing Grade School database tests | Preserved; CI pending |
| Period/section/subject teacher uniqueness; staff assignments | `SchoolTeaching.jsx`, `grade-school.service.js`, `GradeSchoolOffering` | Present | Teachers & schedules is its own route | Existing Grade School tests | Changed UI; CI pending |
| Official registrations: direct, accepted admission, returning; PRE_REGISTERED activation | `SchoolStudents.jsx`, `grade-school.routes.js`, `GradeSchoolRegistration` | Present | Dedicated Student registration route; direct teacher route denied | Browser registration route authorization test added; existing database tests | Changed UI; CI pending |
| Subject-specific schedules and conflict handling | `SchoolTeaching.jsx`, `grade-school.service.js`, `GradeSchoolSchedule` | Present | Teachers & schedules separate from attendance | Existing tests | Changed UI; CI pending |
| Subject-based attendance, DRAFT→FINAL lock, finalized guardian alert only | `SchoolTeaching.jsx`, `grade-school.service.js`, `GradeSchoolAttendance/Record` | Present but hidden under teaching tab | Dedicated Subject attendance view using existing API | `grade-school.spec.mjs` updated to visit route; DB tests | Changed UI; CI pending |
| Assessments, weights, scores, finalization, read-only student results | `SchoolTeaching.jsx`, `AcademicReport.jsx`, `grade-school.service.js` | Present but hidden under teaching tab | Separate Assessments & grades view; existing report pipeline retained | Existing Grade School frontend/database tests | Changed UI; CI pending |
| Official Grade School results/reporting | `SchoolStudents.jsx`, `AcademicReport.jsx`, `grade-school.routes.js` | Per-student reports existed inside registration management | Separate `reports` module lists period-scoped students, retrieves finalized private records from the existing report endpoint, excludes registration controls | Added dedicated Grade School reporting UI test; existing staff report and DB tests | Changed UI; CI pending |
| Student/guardian secure relationship and school report access | `SchoolStudents.jsx`, `MyCampus.jsx`, `grade-school.service.js`, `GradeSchoolGuardian` | Present | No data model changes; registration management remains linked | Existing learner/guardian database and browser coverage | Preserved; CI pending |
| No My Campus access for PRE_REGISTERED; teachers use staff context | `MyCampus.jsx`, `CampusWorkspacePage.jsx`, `grade-school.service.js` | Present | Kept learner and staff routes separated | Existing waiting-flow Playwright tests | Preserved; CI pending |
| TVET Program→Intake→Section→optional Module, institution fees separated | `TvetWorkspace.jsx`, `tvet.service.js`, `TvetProgram/Intake/Section/Module` | Present | Dedicated Programs & intakes route, no Grade School conversion | `tvet.spec.mjs` changed to test direct route; TVET DB tests | Changed UI; CI pending |
| Scoped TVET instructor assignment and timetable | `TvetWorkspace.jsx`, `TvetTraining.jsx`, `tvet.service.js` | Present but embedded in training tab | Dedicated Instructors & schedules route | Navigation tests and existing integration tests | Changed UI; CI pending |
| TVET direct/admission/returning learner enrolment and activation | `TvetLearners.jsx`, `tvet.service.js`, `TvetEnrolment` | Present | Dedicated Learners & completion route | Existing enrolment/database/browser tests | Changed UI; CI pending |
| TVET session attendance DRAFT→FINAL, scoped learners | `TvetTraining.jsx`, `tvet.service.js`, `TvetAttendance/Record` | Present but embedded in training tab | Dedicated Session attendance route | Playwright direct-route attendance test updated | Changed UI; CI pending |
| TVET score, practical and competency results; reassessments | `TvetTraining.jsx`, `tvet.service.js`, `TvetAssessment/Result` | Present but embedded in training tab | Dedicated Competency assessments route | Playwright retake direct-route test updated | Changed UI; CI pending |
| TVET completion and immutable/revocable certificates | `TvetLearners.jsx`, `TvetReport.jsx`, `tvet.service.js`, `TvetCertificate` | Present but combined with enrolments | New `tvet-certificates` module accesses real completion evidence, eligible completion actions, certificate issue/revoke; no duplicate model or billing | New dedicated certificate-module UI test; existing TVET DB, learner browser tests | Changed UI; CI pending |
| Supporters/guardians confirmed access only, revocation and private data | `TvetLearners.jsx`, `tvet.service.js`, `TvetSupporter` | Present | Preserved | Existing supporter browser and DB tests | Preserved; CI pending |
| Grade School US$1 per student/semester, TVET US$1 per learner/intake; not on admission acceptance | `billing.service.js`, `BillingAccount/Charge/LedgerEntry`, `CampusBilling.jsx` | Present in backend/UI | Platform billing remains a distinct module | Existing billing DB/browser tests; no migration added | Preserved; CI pending |
| Audit trail, tenant isolation, authorization, sensitive actions | `VirtualCampusAudit`, `grade-school.service.js`, `tvet.service.js`, `billing.service.js` | Present in backend | No authorization bypass; frontend cannot replace service checks | Existing database negative tests, requires CI | Preserved; live security review needed |
| Mobile responsiveness, readable navigation, states | `campus-navigation.css`, `campus-workspace.css`, engine CSS | Partial | Grouped module list and horizontally scrollable mobile links | Existing viewport browser checks; manual accessibility audit outstanding | Changed; manual acceptance pending |
| Prisma validation, migrations, backend/front tests, E2E | `.github/workflows/ci.yml`, `frontend/e2e/*`, `backend/test/*` | CI jobs already configured | Added Vitest and updated Playwright scenarios; no schema edits/migration needed | GitHub Actions PR run required; no local DB/runtime available in this environment | **Open: CI evidence required** |

## Dependency order and evidence gate

1. **Core/context:** independent workspace, eligibility and active-Campus checks, authorization. Existing backend retained; this PR updates frontend context and navigation.
2. **Grade School:** setup → period/sections/offerings → registrations and staff assignments → schedule → subject attendance → assessments/grades → results/reporting. Existing server transactions stay authoritative.
3. **TVET:** program/intake/section/module → instructor scope → enrolment → schedules/sessions → attendance/competencies → completion/certificate. The TVET data model is unchanged.
4. **Billing and audits:** separate platform ledger, registration/enrolment-generated charges, immutable audit histories. No migration or pricing rule changes in this PR.
5. **Verification:** schema validation, clean migration replay, backend + database tests, frontend Vitest/lint/build, Playwright on desktop/mobile, negative role/tenant scenarios and a real approved institution pilot.

**Do not treat a route, visible form, or passing mocked browser test alone as “done”.** Production readiness requires successful PR CI, PostgreSQL tests, browser-level UI→API→database checks and institution acceptance. Staging/production migration, approval, merge and deployment remain separate founder-controlled steps.

## Existing evidence inventory

- `backend/test/campus.database.test.js`, `grade-school.database.test.js`, `tvet.database.test.js`, `billing.database.test.js`
- `frontend/e2e/campus.spec.mjs`, `grade-school.spec.mjs`, `tvet.spec.mjs`, `billing.spec.mjs`
- `frontend/src/test/campus-navigation.test.jsx` (new), `grade-school-flow.test.jsx`, `tvet-flow.test.jsx`
- Migrations `20261111190000_sprint9_virtual_campus_core`, `20261111200000_sprint10_grade_school`, `20261111210000_sprint11_tvet`, `20261112110000_sprint12_billing`
- `.github/workflows/ci.yml` runs Prisma validate/generate, backend/frontend regressions, lint/build, fresh isolated PostgreSQL migration replay and database integration tests. Playwright browser tests are separately configured; **confirm they ran for this PR**.

## Remaining manual release blockers

- Confirm each approved institution operating-location verification and active Campus eligibility on real records.
- Run Grade School and TVET journeys against real PostgreSQL/API data (not fixtures) from accounts representing each role.
- Review historical records, auditable transitions, permission revocations, cross-tenant access, billing reconciliation and financial independence.
- Verify mobile 375px/keyboard/screen-reader flow, staff setup and semester/intake closeout on real institutional data.
- Obtain founder approval for any production migration, merge or deployment.

## November 17 follow-up implementation notes

- Mobile organization navigation now links directly to eligible institutions' independent Campus workspaces.
- A Campus workspace view never displays the previous account's institutional content while the active account changes.
- Grade School has a dedicated read-only results/reporting module backed by the existing official student report endpoint; registration actions remain in registration management.
- TVET has a dedicated completion/certificates module backed by the existing learner-report, completion, certificate issue and revoke endpoints. It does not load admissions or show enrolment setup controls.
- Existing browser tests were updated to use the mobile Campus navigation and the explicit learner certificate tab/back-navigation flows. A regression test for Job draft creation now supplies newly required employment and compensation fields. These changes are test/UX alignment; do not infer production readiness without completed CI.

## Final alignment follow-up — role contexts and module boundaries

- Student account-switching now deep-links to the selected institution under `/learning?view=campus&campus=<institution-id>`; pre-registered students see the institutional waiting dialog and Come Later without academic reads.
- The Grade School Teachers & schedules module permits assignment/timetabling only; Subject attendance and Assessments & grades own their separate forms and finalized records. The legacy academic view still supports older internal navigation.
- TVET Instructors & schedules is separated from Session attendance and Competency assessments; record mutation uses the existing role-scoped endpoints.
- On 401/403/404 from a student registration/report or TVET learner/report, cached sensitive rows are removed and the institutional workspace is invalidated. Personal/guardian report and guardian-decision errors also clear cached access context.
- The new automated tests check route uniqueness, dedicated results/certificate views, schedule-only boundaries, permission revocation, school-specific selection and browser denial of copied privileged Campus links.
- CI jobs may be superseded by subsequent commits; only successful checks for the final PR HEAD satisfy the evidence gate. Browser tests use synthetic route fixtures; live institution UAT and a browser-to-real-database end-to-end test remain separate release blockers.

## Branch integration with main — November 17, 2026

- Original Campus implementation at `0d0c58695f0f5aff90d9b35e3ba940a4a65e3434` passed GitHub Actions: [browser acceptance (228 cases, 218 passed, 10 skipped)](https://github.com/eNyanforh/brightway/actions/runs/44073984264), [Node 22/24 regressions, PostgreSQL, lint/build](https://github.com/eNyanforh/brightway/actions/runs/44073984356), and [private staging packaging](https://github.com/eNyanforh/brightway/actions/runs/44073984273).
- Since those checks, `main` gained approved opportunity editor changes (through PR #173) that conflicted with old browser test selectors. This integration brings all main production changes into the Campus feature branch. Latest main versions of opportunity-facing tests are retained; the Campus and TVET navigation tests retain PR #167's engine-specific selectors and permission coverage.
- **Evidence gate:** CI for the new merged branch head must pass independently before the founder reviews the PR. Production data-flow pilot and access-revocation tests remain mandatory release gates. This branch merge does not deploy or merge into `main`.
