# Virtual Campus: database and domain foundation

This stage extends the retained Prisma/PostgreSQL implementation. Production remains hard-disabled by the Stage 1 rollout guard. It does not restore the Campus UI, academic HTTP routes, learner access, announcements HTTP routes or billing scheduler.

## Existing entities retained

`VirtualCampus.organizationId` remains its primary key and organization foreign key: an organization can own at most one Campus, created once when it opts in. Existing Grade School, TVET, membership, announcement, admissions, billing and audit tables remain in place. No historical rows are deleted or deduplicated.

Only two tables are added: `CampusEngineConfiguration` (one row per enabled engine) and `CampusPermissionGrant` (references an existing organization membership). Core and engine configuration use NOT_CONFIGURED, CONFIGURING, READY and REVIEW_REQUIRED. The legacy scalar engine is immutable and retained for historical compatibility; enabledEngines is authoritative and append-only. Deferred constraints require its engine configuration rows to match at transaction commit.

Grade School and TVET root entities reference their respective engine configuration. Existing composite Campus foreign keys scope their descendants. Discover program/admission cycle links now use organization-composite foreign keys; enrollment admission links check both institution and learner. Campus, academic tenant and learner account identities cannot be reassigned. Existing restrictive deletion rules remain, and Campus audit records are immutable. New lifecycle events carry a unique Campus version; legacy audit records are preserved without invented events or versions.

## Domain operations

The allowlisted non-production lifecycle API retains its existing `/organization-workspace/:organizationId/campus` API prefix (this is not a frontend workspace tab). It adds:

| Method and suffix | Behavior |
| --- | --- |
| POST /engines | Primary administrator adds an engine using expectedVersion; does not replace the Campus or create charges/enrollments. |
| PATCH /engines/:engine/configuration | Scoped academic manager changes configuration using expectedVersion and expectedEngineVersion. READY requires academic structure with an authorized teaching assignment. |
| GET /permissions | Primary administrator or Campus manager reads grants. |
| PUT /permissions/:membershipId | Primary administrator changes a scoped grant using expectedVersion and expectedGrantVersion (0 for a new grant). Revocations retain the grant row. |
| GET /history | Primary administrator or Campus manager reads paginated lifecycle events and the retained first activation timestamp. |

Writes reuse existing verified email, complete organization profile, current MFA, active membership and organization locking. Campus changes and their audit events commit together. Stale concurrent writes return 409. New engine addition is a no-op when already enabled at the current version.

Campus scope supports administration, announcements and shared platform billing administration. Academic management and teaching permissions are distinct per engine. Existing broad academic grants apply only to the original engine; adding an engine never silently expands staff authority. Explicit scoped revocation suppresses a legacy grant. Disabled organization memberships cannot access either engine. Primary administrators retain both engine capabilities.

Retained academic domain services now recognize either enabled engine and enforce scoped permissions. Shared billing retains its existing separate Grade School semester and TVET Program/Intake charging rules, US$1 units and ledger. Reconciliation requires an explicit engine on dual-engine Campuses. These services remain inaccessible through production Campus routes.

## Migration and release considerations

Apply `20261119230000_campus_enabled_engines` first, then `20261120090000_campus_domain_foundation`, and regenerate Prisma Client. Deploy the new domain code with the migration: older writers cannot create a Campus without engine configuration rows. Keep preview disabled during migration and code rollout.

The new migration runs atomically. It refuses duplicate Campus identities, orphan organizations, cross-organization program links, mismatched admission ownership and academic records whose engine is not enabled. It never chooses a duplicate winner or silently enables an engine. Investigate and explicitly reconcile inconsistent records before retrying; do not delete history to make the migration pass. A failed Prisma migration also requires the normal migration-resolution procedure after rollback and approved remediation.

Legacy engine configurations start REVIEW_REQUIRED. Core configurations with empty display names or missing activation timestamps for active/paused records are marked REVIEW_REQUIRED. Existing status, activation timestamps, versions, learner records and financial history are retained. Missing historical events are not reconstructed.

New constraints and indexes acquire PostgreSQL locks. Before an authorized deployment, rehearse on a representative non-production copy, inspect review-required records, and measure lock duration. No production database or real institution has been used for this stage. Synthetic test cleanup deliberately uses privileged, transaction-local trigger bypass only in the isolated test runner; application services expose no such operation.

## Acceptance evidence

Automated coverage includes concurrent setup/activation and engine addition; uniqueness; stale versions; MFA and permission revocation; cross-tenant grants and academic links; immutable audit/identity; atomic audit failure rollback; dual-engine academic setup and billing; full migration replay; legacy academic/financial/history preservation; and migration refusal/rollback on inconsistent data. Test execution results are reported in the pull request.

Dedicated workspace UI and real-institution acceptance remain later stages. This data foundation does not establish production readiness for the complete Virtual Campus system.
