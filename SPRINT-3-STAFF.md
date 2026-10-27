# Sprint 3 — organization staff and account contexts

This update implements the first Sprint 3 vertical slice: active organization memberships, username-bound invitations and consent, granular core permissions, revocation, primary-administrator protection, audit records and Personal/Organization switching. Issuer-scoped education/experience review integration is still subsequent Sprint 3 work. This does not mark all of Sprint 3 accepted or enable Campus.

Deployment remains paused. No host, paid resource, DNS, email delivery service or cloud deployment is changed. The complete agreed 14-sprint production target remains 26 January 2027; G3 remains due 15 November 2026, subject to recorded acceptance.

## Behavior and boundaries

- One individual login can hold memberships in multiple approved active organizations. Schools, NGOs and Companies use the same staffing system. No duplicate organization login/password is created.
- The existing avatar menu now has Switch account. The chooser shows the signed-in person's active organizations and pending invitations. A selected organization opens its URL-scoped workspace; Personal account returns to the individual application. Reloading the organization URL rechecks membership on the server. Separate tabs can use different contexts without changing one global cookie or profile owner.
- Every protected organization request binds the URL organization to the current authenticated account, membership, organization approval/status and required permission. A route or browser label is not authorization. Personal profile APIs continue to operate only on the signed-in individual; profile drafts remain in the existing AppLayout during app-context navigation. Public organization links in the workspace open separately so they do not discard that draft.
- Existing approval-created PRIMARY_ADMIN memberships remain valid. Their effective core permissions are calculated on the server. Ordinary staffing APIs cannot create, remove, demote or transfer that primary administrator. Ownership recovery/transfer requires a separately authorized future process; it is not a normal staff checkbox.
- Staff management requires current verified email, server-verified MFA and organization.members.manage. Workspace discovery/accepting a personal invitation does not force MFA enrollment on ordinary individuals; a person granted staff-management permission must enable MFA before using it.
- Staff invitations target an exact registered BrightWay username. They are private in-app records bound to the recipient account, expire after seven days and grant no membership until explicit acceptance. No new email sender configuration or external invitation token is introduced. Recipient identity comes from the authenticated session, never a body field.
- Managers select explicit permissions. A delegated manager can grant only permissions they currently hold and cannot manage a member whose effective authority exceeds theirs. The invitation sender's current account/membership/permission authority is checked again at acceptance. Revocation or scope withdrawal cannot leave a usable pending invitation to regain that authority.
- Core catalog: Manage staff; Publish posts; Manage opportunities; Manage programs; Review admission applications. Education-related permissions are unavailable to organizations without training capability. These grants prepare the later product modules; publishing/opportunity/program/admission features themselves are not created by this update. Campus, billing, internal BrightWay reviewer and credential issuer permissions are not grantable here.
- Revocation prevents subsequent workspace/staff access even while a cookie remains. Role/permission changes and organization suspension are rechecked on every request. Focus checks clear private staff if access is withdrawn; stale edits require explicit reload. A response belonging to an older account/page cannot replace the newer account's data.
- Invitations use a body-bound idempotency key; ambiguous delivery retries send the identical body/key. Responses and member edits are versioned. Consent, membership creation/reactivation, version changes and audit writes share one transaction. Concurrent acceptance has one winner; audit failure rolls everything back. No last-primary-administrator removal is possible through staff controls.
- Staff and invitation lists have tenant-bound pagination. Only usernames, explicit permissions, role/state/version and relevant dates are returned; email addresses, private profile contacts and verification evidence are absent. Mutations require trusted Origin, no-store responses and rate limits. The per-organization invitation delivery budget is stored in the database.

## Update locally

Preserve .env values, the original MFA encryption key and local modifications. From the repository root:

```bash
git status
git pull --ff-only origin main
npm ci
npm run test:database --workspace backend -- --migrate
```

The first database command requires the existing isolated direct TEST_DATABASE_URL and application DATABASE_URL/DIRECT_URL for destination comparison. It applies migrations only to the isolated destination and runs the dedicated PostgreSQL suite without needing application servers. Skipped ordinary database cases do not count as an integration pass.

After the isolated checks pass, stop the backend and migrate the intended application development database:

```bash
cd backend
npx prisma validate
npx prisma migrate deploy
npx prisma generate
cd ..
```

New additive migration: 20261027220000_add_organization_staff. It adds STAFF, membership permissions/versioning, a staffing revision, invitations and staff audits. It keeps existing memberships, organizations and previous migrations intact. No migration reset is needed. Regenerate the client after migration, then restart the local backend/frontend normally.

## Real application acceptance

Use consenting test accounts. Record date, SHA, migration status, actor labels and expected/observed result; keep passwords, contact information and tokens private.

1. As the primary administrator of an already approved organization, complete MFA, open avatar → Switch account → that organization. Confirm the workspace/header identifies it. Open Personal account and confirm the individual profile and any unsaved personal edits remain separate. Reopen/reload the organization URL and check it again.
2. Invite another registered username with only Publish posts. Confirm it has no membership access before consent. As the recipient, open Switch account and accept. Confirm one STAFF membership and only that permission; staff management must be denied. Invitations can also be declined or cancelled, and expired/cancelled/foreign invitations cannot be accepted.
3. As the primary administrator, edit the member's permissions and verify the new scope after reload. Revoke membership; a previously open member tab must lose access after recheck and direct API calls must be denied immediately. Do not merely hide controls.
4. Test a different organization ID, a foreign invitation/member ID, duplicate acceptance, concurrent stale permission edits, and an invitation whose delegated sender lost authority before acceptance. No cross-organization access, duplicate membership or silent overwrite is allowed.
5. Confirm a non-MFA manager is denied staff operations. No one can grant Campus/internal reviewer/unknown permissions or promote themselves to PRIMARY_ADMIN. A primary-administrator removal request must fail.
6. Check mobile controls, keyboard access, pending operations and private-data clearing after logout/account change. Check enough records for pagination when available. Existing individual verification, credential review and organization verification browser passes carry forward; rerun them only if affected behavior changes.

No real application-database/browser acceptance of this new staffing flow is claimed until the owner reports it. GitHub CI PostgreSQL uses isolated synthetic records. Service/UI tests use fixtures. Prior Sprint 2 browser passes remain owner reports, not independently observed HTTP traces. The latest setup-assistance and primary-administrator handoff instructions were followed by requests to proceed, not explicit per-check pass transcripts; do not silently mark those formal acceptance items complete.

## Evidence and next integration

The source includes service/HTTP tests for permissions, ownership, MFA, consent, expiry/cancellation, revocation, idempotent retries, scoped pagination and audit rollback; a dedicated real-PostgreSQL test covers acceptance/edit races, audit rollback, permission withdrawal and primary protection. Frontend tests cover cookie-bound requests, explicit consent, stale edits, immutable retries, revoked/foreign access, account races and preservation of personal drafts during context switching. Read the exact commit's GitHub Actions results for execution evidence; test source alone is not a passing run.

Next Sprint 3 integration: bind participating schools/employers to issuer-scoped education/experience review, retaining authorized BrightWay review for unlisted issuers, no self-review and live MFA. This staffing release grants none of those review rights yet. Broad internal Admin/Agent/Support/Billing/Moderation/Super Admin workspaces remain later scope; Campus staffing extensions remain unavailable until active eligible Campus exists.
