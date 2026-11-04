# Management operations

This adds operational tools alongside the existing protected review workspaces.
It does not deploy the application, create real staff, migrate application data,
change real permissions, grant verification or activate/bill Campus.

## Tools and permissions

Super Admin receives all implemented permissions. Other internal identities need
explicit terminal grants:

| Tool | Permission | Scope |
| --- | --- | --- |
| Users | user-manager | Directory, suspend/restore, revoke personal sessions |
| Organization oversight | organization-manager | Approved directory, suspend/restore workspace access |
| Team access | staff-reader | Named staff and their assigned permissions; no password/MFA material |
| Support | support-agent | Support case assignment, replies, internal notes, status/priority |
| Reports | moderation-agent | Account/organization report investigations and disposition |
| Audit log | audit-reader | Metadata across new operations and existing review/authentication records |
| Operations | operations-reader | Database counts for review targets, webhook jobs and retention workloads |

Creation, root promotion, staff grants/revocation and disabling staff remain in
`backend/scripts/superadmin.js`. Example (from repository root):

```sh
node backend/scripts/superadmin.js staff staff_username support-agent grant --by root_username --reason "Assign named support responsibility."
```

That command prompts privately for the responsible root password and fresh MFA.
Use a separate fresh app code or unused backup for each terminal authentication.
No real grants are performed by installing this update.

## Safe update order

1. Back up the development database and stop the development servers. Pull the
   merged revision and run `npm ci` from the repository root.
2. In `backend`, run `npx --no-install prisma validate`,
   `npx --no-install prisma migrate deploy`, then
   `npx --no-install prisma generate`. This introduces migration
   `20261104170000_management_operations`: additive access versions, case/message
   tables and management action records. It preserves existing historical actors,
   review revisions/deadlines, evidence, accounts and organizations.
3. Apply and test migrations on the isolated test database using
   `npm run test:database --workspace backend -- --migrate`. Never point
   TEST_DATABASE_URL at the application destination. CI uses disposable PostgreSQL.
4. Restart both development servers and sign in separately at `/superadmin`.
   Do not expose the new tools publicly until the acceptance checks below pass.

There is no automatic data rollback: preserve case/action rows and use a forward
repair if an update fails. A generated client without the new migration is not a
working database update.

## Access actions

Suspension/restoration and session revocation require the current capability,
current session, fresh management MFA (five minutes), a reason, an expected access
version and an actor-scoped idempotency key. The confirmation dialog verifies the
management password and a fresh authenticator or unused backup before submitting.
Step-up never extends the eight-hour session expiry. Its persistent failure budget
and single-use proof checks match management login.

Account suspension/session revocation cancels existing sessions and pending MFA
and password-recovery challenges. A password login already being verified cannot
commit against an obsolete access version. A new deliberate sign-in is allowed
after session-only revocation. DEACTIVATED accounts are not reactivated here.
Organization suspension changes platform access and staff scope version; it keeps
memberships, approval history and issuer decisions. Neither tool overwrites identity,
education/experience or photo/name-review trust decisions.

Related-account declarations and known same-email accounts block acting on one's
own/related account, organization application or report. Undeclared alternate
identities remain an operational onboarding/conflict-disclosure responsibility.
All writes and their audit event commit together; failure rolls back the mutation.
Uncertain responses require checking saved state. Matching retries return the
original result; reused keys with different input fail.

## Casework

Signed-in individuals use `/help` and `/help/reports` (also in their account menu).
They can submit a support case or report a public account/organization username,
read only their own cases, and reply to open cases. Submission/message budgets
persist in the database. Government IDs and selfies stay in the separate identity
flow; support has no document-upload or evidence-download bypass.

Management staff claim cases before replying or changing status/priority. A current
Super Admin may release another staff member's open assignment for reassignment.
Case assignment/status/priority actions require fresh MFA and explicit reasons;
message writes require the current capability and MFA session. Closed cases accept
no messages; an assigned reviewer may explicitly reopen them with an audited reason.
Status-change reasons for requester-created cases are visible to that requester.
Internal notes never appear in owner APIs, including pagination. Internal cases
have no requester and accept internal notes only. Reports do not automatically
suspend their target: access restrictions use the separate access tool/permission.

The browser preserves entered messages on errors, disables uncertain writes until
explicit reload and does not automatically retry a submission. Lists, messages and
audits are paginated. Server authority is checked again independently of cached UI.

## Limits and operational acceptance

Operations reports saved workload, not email/R2/scheduler health or proof that a
cleanup ran. Continue using the existing maintenance scripts/hosted scheduler and
record actual cleanup/retry evidence. Billing controls depend on Campus registration
and an actual ledger/payment workflow; organization approval alone never bills Campus.
Content-post moderation will extend reports when those content models exist.
Case retention and staff-audit retention need an approved operational policy; no
unrequested destructive retention job is introduced here.

Record real application checks with synthetic users/organizations: root vs restricted
staff, revoked/stale sessions, wrong-realm cookies, Origin rejection, expired/fresh
MFA, duplicate/stale access changes, conflict denial, suspension/restoration,
requester/internal-message separation, case assignment, report disposition and
mobile/desktop interaction. Fixture CI and disposable PostgreSQL evidence do not
establish production readiness or real email/storage/payment acceptance.
