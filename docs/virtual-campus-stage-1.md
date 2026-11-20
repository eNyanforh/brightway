# Virtual Campus — Stage 1: controlled foundation

Date: November 19, 2026. Base: `b77f2447a1982a85e1c87cd8b6fe08f1e0fc4522` (main after Campus retirement, PR #179).

This is an incremental backend foundation, **not a complete Campus system or production release**. The October 2026 `BrightWay_COMPLETE_MASTER_ARCHITECTURE.docx` was read, including sections 4, 8–9, 17–21, 23–29 and 32. The user's November 19 engineering instructions supersede the older single-engine/classification assumptions: one Campus per eligible verified organization; Grade School, TVET, or both; an independent workspace; Liberia-only; development behind a flag.

> Historical Stage 1 audit. The user subsequently selected database/domain architecture as Step 2; see [Stage 2](virtual-campus-stage-2.md) for implemented engine extension, scoped permissions and integrity changes. Workspace UI remains a later stage.

## Findings and scope

Retirement removed the mounted Campus/academic/billing APIs, navigation, Campus permission catalog and billing scheduler activity. The underlying services, academic tables, audit records, learner records, billing ledger and tests remain. Reuse these assets; do not revert the retirement wholesale.

The retained `VirtualCampus.organizationId` primary key already enforces one Campus per organization. The old `engine` scalar and classification-specific eligibility do not satisfy the newly approved dual-engine rules. Stage 1 corrects the configuration boundary and introduces a controlled lifecycle API preview. No academic UI or operational route is re-enabled.

### Implemented

- `enabledEngines` stores one or both engines in canonical order. An additive migration backfills the previous single engine for every existing Campus. No Campus identity, organization membership, academic table, payment record or historical migration is deleted or replaced.
- Database checks forbid empty, duplicate, null or inconsistent engine configurations. The legacy scalar remains for dormant consumers; it must belong to `enabledEngines`. It is **not** the authoritative engine list for future work.
- Any verified active school or organization with its existing education/training capability (`offersTraining`) may configure either engine or both. Organization approval, a verified Liberia operation and the LR product availability record are still required. An international headquarters does not exclude a verified Liberia operation.
- Setup uses the existing transaction, organization/account locking, expected-version conflict checks, primary-administrator authorization, verified account email, completed organization profile, fresh MFA and audit trail. A successful concurrent first setup creates one Campus; stale retries return 409.
- Activation, pause and resume retain the same identity. Activation and resume check every configured engine. Active or paused Campus configuration cannot be replaced through setup. An audited workflow to add an engine to an already activated Campus is deferred; do not alter historical records to work around this.
- The actual API composition mounts only lifecycle preview routes, guarded before authentication or database access. Authentication, tenant membership and service authorization still apply after the rollout gate.
- All production requests remain blocked even if preview environment variables are accidentally set.

### Preview contract

Both values are required, and `NODE_ENV` must be `development` or `test`:

```dotenv
VIRTUAL_CAMPUS_PREVIEW_ENABLED=false
VIRTUAL_CAMPUS_PREVIEW_ORGANIZATION_IDS=
```

An explicitly enabled isolated test environment must supply `true` and a comma-separated list of organization UUIDs. There is no wildcard or implicit all-organizations mode. Empty/invalid lists fail closed; unknown flag values fail startup validation. These are server configuration values, never client inputs. Restart to apply changes; removing an organization from the list disables its preview access without deleting records. No configuration has been changed on a deployed environment by this work.

Paths are relative to `/api/v1/organization-workspace/:organizationId/campus`:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | base | Current eligibility and Campus configuration |
| PUT | `/setup` | Persist essential Campus identity and selected engines |
| POST | `/activate` | Transition SETUP to ACTIVE |
| POST | `/pause` | Transition ACTIVE to PAUSED |
| POST | `/resume` | Transition PAUSED to ACTIVE after rechecking eligibility |
| PATCH | `/settings` | Update Campus display name/contact with version checking |

New setup payload:

```json
{
  "enabledEngines": ["GRADE_SCHOOL", "TVET"],
  "expectedVersion": 0,
  "displayName": "Institution Campus",
  "contactEmail": null
}
```

Historical payloads containing only `engine` remain accepted and are normalized to a one-element list. Supplying both input forms is rejected. Responses expose `enabledEngines`; the older `engine` field remains for compatibility. Do not infer operational academic availability from legacy permission fields returned by the core service: the global staff catalog and all academic routes remain retired in this stage.

## Requirement audit and next stages

“Retained” means source, schema and tests exist; it does not mean the feature is active or fully validated for the new dual-engine architecture.

| Requirement | Evidence / current state | Status after Stage 1 |
| --- | --- | --- |
| Verified eligible education/training providers, regardless of classification | `campus.schema.js`, eligibility and database tests | Implemented at core API boundary; organization capability UX remains existing behavior |
| Verified Liberia operation and LR product availability | `assessEligibility`, including international organization case | Preserved and tested |
| Exactly one Campus per organization | Existing `organizationId` primary key; concurrent setup test | Preserved and tested |
| Grade School, TVET, or both in one Campus | `enabledEngines`, migration, setup and lifecycle tests | Configuration implemented; dual-engine academic operations incomplete |
| Shared identity, memberships and top-level administration | Existing organization membership and account/session authorization | Reused; Campus staff catalog restoration pending |
| Short essential setup, then full workspace | Core identity/engine setup and activation persist; retained `CampusSetupWizard.jsx` still uses one engine and a long academic wizard | API foundation only; UX pending Stage 2 |
| Independent Campus workspace | Retained `CampusWorkspacePage.jsx`/navigation; active routes currently redirect to Organization | UI restoration and responsive/browser acceptance pending Stage 2 |
| Departments, academic configuration and permissions inside Campus | Existing engine-specific configuration; no completed department-management workflow established in this audit | Incomplete; model/workflow design and implementation required |
| Multiple institutional roles on one BrightWay identity | Existing organization memberships; legacy Campus grants are dormant | Core reused; engine-scoped permission model and role combinations pending |
| Separate academic records and engine boundaries | Separate Grade School and TVET models with composite tenant relations; dormant services still branch on scalar `engine` | Retained; **do not mount** until authorization, selectors and tests use the new engine list |
| Grade School subjects/pass marks, classes/sections/capacity | Retained `grade-school.service.js`, models, UI and SQL tests | Dormant; Stage 3 functional acceptance required |
| Years >4 months, terms/semesters, history and electives | Retained schemas/services and database tests | Dormant; Stage 3 |
| One teacher per period/class/section/subject, schedules | Retained offerings/assignments, scope checks and tests | Dormant; Stage 3 |
| Admissions versus official/returning registration, PRE_REGISTERED/ACTIVE | Retained Grade School registration workflow; acceptance alone does not charge | Dormant; Stage 3 and billing integration |
| Subject attendance drafts/finalization and final-only absence alerts | Retained Grade School service and guardian relationship tests | Dormant; Stage 3 |
| Assessments, grades, reports and authorized guardians | Retained engine services, report components and tests | Dormant; Stage 3 plus privacy acceptance |
| TVET programs, intakes, sections, modules and institutional fees | Retained `tvet.service.js` and separate models | Dormant; Stage 4 |
| TVET instructors, sessions, attendance, score/practical/competency assessment | Retained service, result schemas and tests | Dormant; Stage 4 |
| TVET completion, certificates/achievements and supporters | Retained service/models/UI and tests | Dormant; Stage 4 |
| Learner My Campus through personal identity; staff through institutional context | Retained learner/staff components; active entry points retired | Restoration, multiple-engine institution selection and revocation checks pending |
| PRE_REGISTERED waiting message and Come Later | Retained `MyCampus.jsx` waiting behavior | Dormant; UI→API→database acceptance pending |
| Campus announcements and notifications | Retained core/learner code still branches on legacy scalar engine | Unmounted; adapt both-engine recipients, deduplication and audience scoping before restoring |
| US$1/student/semester, US$1/unique learner/program-intake; no module/admission charge | Retained billing core, ledger, immutable financial evidence and tests | Rates unchanged; operational billing remains disabled |
| 30-day school fee window, at least seven-day notice, bulk settlement and allocations | Retained billing service; scheduler remains no-op | Stage 5; real reconciliation/notice acceptance required |
| Institution fees separate from BrightWay fees | Existing separate fields and ledger | Preserved; dual-engine billing screens and selectors pending |
| Backend authorization, audit and cross-tenant isolation | Existing service checks reused; Stage 1 negative/MFA/race tests | Core tested; independent engine permissions and comprehensive security review pending |
| Native BrightWay flows, no external meeting/LMS platform | No external user-facing service introduced | Preserved; online lesson delivery remains out of scope |
| Default-off controlled rollout, no production activation | New rollout policy and actual router composition tests | Implemented; production hard-blocked |
| Existing Explore, Opportunities, Network, Learning, Organizations and authentication | No frontend changes; backend/frontend regressions and builds | Regression checks recorded below |

### Incremental sequence

1. **This PR:** audit, default-off non-production rollout, one-Campus/dual-engine configuration, additive migration and core tests.
2. Dedicated workspace, short setup, engine-aware navigation/bootstrap, shared membership with scoped role configuration, and authorized access paths. Restore only APIs that have passed the new engine-boundary tests.
3. Grade School academic management through real UI/API/database workflows, including learner/guardian access and permission revocation.
4. TVET management through real UI/API/database workflows, dual-engine coexistence and independent scoped permissions.
5. Billing, announcements and notifications adapted to both engines; separate institution fees, idempotency, allocations, enforcement and reconciliation.
6. Accessibility/mobile acceptance, real institution pilot, dependency security, backup/restore, performance, migration rehearsal and release review.

Do not silently proceed to another stage, merge, deploy, enable production or modify production data. A completed stage is not a completed system.

## Migration and release considerations

Migration: `20261119230000_campus_enabled_engines`. Apply to an isolated test/staging database before using the preview and regenerate Prisma Client. It performs a one-time backfill and validates a check constraint, so rehearse its lock duration against representative volume. Keep a backup and preserve the additive column on code rollback; no down migration or data purge is provided.

The migration does not change `ProductAvailability`, activation status, billing rules, historical versions, organization identity or any learner records. The preexisting LR product row can be enabled while the server rollout gate is disabled; product eligibility alone never enables these preview routes.

The Grade School, TVET, learner, guardian, announcement and billing HTTP routes, frontend redirects, global Campus permission catalog, management billing tool and scheduled billing entry point remain retired. The retained academic/billing services still need dual-engine adaptation; enabling them before that work would be incorrect.

## Validation evidence

Results are recorded for this stage only; repository CI and real institution sign-off remain separate gates.

- Core rollout/input tests: 8 passed.
- Backend regression: 448 passed, 53 skipped (database/external-environment suites); zero failures. Database tests are run separately below.
- Frontend regression: 54 files, 475 tests passed; zero failures.
- Frontend lint: zero errors, nine existing warnings.
- Backend syntax, frontend production build, Prisma schema validation and Prisma Client generation: passed.
- Isolated PostgreSQL 18.7: all 78 integration tests passed, zero skipped/failures, including legacy-record backfill, concurrent dual-engine setup, MFA, tenant isolation and billing regressions. All 79 migrations applied to a fresh synthetic database; a subsequent replay reported no pending migrations. No production database was contacted. CI also exercises PostgreSQL 16; its result is separate.
- Full dependency audit: **blocked**, three high-severity findings through `effect` → `@prisma/config` → `prisma` (`GHSA-7589-6fvf-x4pw`). No dependencies or audit gates changed. Do not apply the suggested breaking Prisma downgrade as part of this stage.
- Runtime-only dependency audit: also blocked by the same Prisma/effect advisory. A clean runtime audit is not claimed.
- UI browser acceptance and real institutional testing: not executed in this stage. No UI was restored; no claim of complete Campus production readiness.
