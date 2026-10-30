# Organization Dashboard analytics

The organization Dashboard reports real, authorized data. Navigation stays in the sidebar. There are no tool cards, fabricated activity, student/admission/revenue totals, approval targets or automatic Campus activation.

## Metrics and scope

| Metric | Definition |
| --- | --- |
| Enabled members | Current enabled organization memberships, including administrators. This does not measure login activity. |
| Pending invitations | Current PENDING invitations with expiry strictly later than the snapshot time. Expired invitations are excluded even if a cleanup job has not changed their stored state. |
| Open reviews | Current SUBMITTED plus IN_REVIEW claims in the viewer's authorized issuer/kind scope. |
| Completed claims | Distinct claims with a VERIFIED, UNABLE_TO_VERIFY or FALSE_CREDENTIAL final decision in the selected period. Each claim contributes only its latest final decision in that period; a later correction can reopen it. This is historical decision activity, not current verification eligibility. |
| New claims | First submission of a distinct claim in the selected period. Resubmissions/corrections do not increment it. |
| Current workload | Current SUBMITTED, IN_REVIEW and ACTION_REQUIRED states, across all time. Applicant corrections are separate from the reviewer's pending work. |
| Review outcomes | Latest final decision per distinct claim in the selected period, grouped by decision. Requesting corrections is not a final decision. |
| Median time | Median elapsed hours from original submission to the selected final decision. Includes applicant correction/waiting time; this is not a reviewer performance target. |
| Needs attention | Unassigned SUBMITTED claims; SUBMITTED/IN_REVIEW claims at or beyond the existing seven-day target; unexpired invitations expiring within two days. Categories can overlap. |

7, 30 and 90 days are calendar-day windows ending at the snapshot time, including today. Boundaries and chart labels use UTC; the beginning is inclusive. 90-day charts use seven-day buckets anchored at the window start, with a shorter final bucket. Other charts use daily buckets. Future timestamps are excluded. Empty intervals are zero-filled only after a successful authorized query. New submissions and decisions can belong to different cohorts and must not be treated as a conversion rate.

Team statistics require current staff-management permission, verified account email and a live MFA session. Credential statistics require the applicable education/experience issuer-review permissions with the same assurance. A reviewer without team-management permission never queries staffing totals. Ordinary members can open the Dashboard without enabling MFA; unavailable scopes contain an access reason and no totals. Counts exclude the viewer's own credentials and foreign/unlisted issuer claims, consistent with the issuer queue. Names, applicants, evidence, notes, document keys and individual records are not returned by analytics.

## API and implementation

`GET /api/v1/organization-workspace/:orgId/dashboard?days=7|30|90` defaults to 30. Requires an authenticated session, current enabled membership, active approved organization and completed organization setup. Other query keys and unsupported periods are rejected. Responses are private and `Cache-Control: no-store`. Authenticated refreshes are rate-limited to 30 per minute per account.

The service uses the existing account → organization transaction lock order and rechecks membership and current MFA/session state before returning aggregates. Database-side aggregate queries return bounded series rather than loading all members, reviews, attempts or evidence into application memory. The additive `20261030110000_add_dashboard_decision_index` migration indexes issuer/decision-time/review lookups. UTC conversion is explicit and independent of the PostgreSQL session timezone.

Attention links use the existing issuer queue with `filter=unassigned` or `filter=past_target`. Supported status filters are the six submitted/review/decision states. Scope, self-review exclusion, current permissions, MFA and cursor validation still apply. A filtered cursor cannot escape its filtered queue. Invitation attention opens Staff; it does not resend invitations or grant access.

The frontend aborts replaced requests and binds responses to organization, reporting period and parent access revision. Organization/period changes and refresh failures clear the old statistics rather than relabeling old counts or showing zero. Restricted, MFA-locked, empty, loading and failed states are distinct. Charts have text labels, distinct line/point patterns and an expandable exact-data table. Layout adapts to mobile without adding chart dependencies. The Dashboard uses the already-implemented sidebar tools and does not advertise future analytics as a planned tool.

## Apply locally

Stop the development backend, then from the project root:

```bash
git pull --ff-only origin main
cd backend
npx --no-install prisma validate
npx --no-install prisma migrate deploy
npx --no-install prisma generate
cd ..
npm run dev:backend
```

Run `npm run dev:frontend` in another terminal. Apply migrations to the isolated test database with `npm run test:database --workspace backend -- --migrate`. Preserve existing migrations/environment values and keep the test destination separate from the application database. Deployment remains paused through Sprint 2 acceptance.

## Verification and application acceptance

Automated coverage includes authenticated/private HTTP behavior, strict queries, missing MFA/email, permission/kind/tenant/self isolation, failure redaction, revoked membership/session, period replacement races, accessible table values and filtered queue links. The real PostgreSQL suite tests unique-claim decision deduplication, historical versus current counts, exact/future/expired boundaries, empty buckets, 90-day totals, non-UTC database sessions and permission revocation. Fixture browser checks are not acceptance of the application database.

On the application, compare an administrator's counts against known memberships, invitations and credential states. Test 7/30/90 days and an empty organization; repeat with an education-only reviewer and a staff member without analytics scopes. Check missing MFA, membership/permission revocation, reload failures, mobile layout, chart-data access and attention links. Verify a claim with corrections contributes once to new claims and at most once to final decisions in a period. Record the application commit and observed results. No assertion that students, admissions, payments or other future modules are production-ready follows from these analytics.
