# Organization Staff management

The Staff page is an operational directory. It uses a searchable member roster, All staff / Enabled / Revoked / Invitations categories, scoped permission summaries, and focused invitation/member/cancellation dialogs. Primary administrators are labelled and protected. Members and pending invitees display their saved full name (including a middle name when present) and current profile photo. A neutral person icon replaces missing/unavailable photos; initials and usernames are not used as the displayed name. Username entry/search remains available to identify the correct BrightWay account. No Campus staff roles or internal BrightWay roles are created here.

## Directory behavior

`GET /api/v1/organization-workspace/:orgId/staff` accepts optional `search`, `memberStatus=all|enabled|revoked`, `memberCursor` and `inviteCursor`. Search is normalized case-insensitively, accepts an optional leading @, and searches all relevant usernames in the organization. SQL pattern characters are literal; search is not restricted to the first page. Counts are for the complete search result, not loaded rows. Member and invitation pages remain bounded to 20 rows and cursors must belong to the current tenant and filter. Changing filters resets paging. Pending invitations exclude expired records even before cleanup updates their stored state.

Responses include current effective `permissions`, applicable saved `assignedPermissions`, `canManage`, `isSelf`, `fullName`, a scoped `photoPath`, membership creation time and result counts. Revoked memberships have no effective access but retain their saved choices for an authorized restore. Counts describe enabled membership flags, not presence or recent login activity. No account emails, personal contact values, identity evidence or storage keys are returned.

All directory reads and writes require current enabled membership, staff-management permission, a verified account email and a live MFA session. Existing setup/approved-organization and transactional version/audit checks remain. A delegated manager cannot change a member with saved permissions outside their own authority, including a revoked member. The server enforces this independently of read-only/disabled UI controls. The primary administrator cannot be changed or revoked through Staff.

## Staff photo privacy

`GET /api/v1/organization-workspace/:orgId/staff/people/:accountId/photo/:photoId` serves only a current published profile photo to a currently authorized Staff manager with verified email and MFA. The target must be a member of that organization (including a revoked membership) or a recipient of a live pending invitation. Expired/cancelled invitations do not authorize a nonmember photo read. Storage reads occur outside database transactions; access, membership/invitation and current photo are checked again afterward. Responses are rate limited, uncached WebP bytes with nosniff. No public bucket, signed storage URL, government ID, selfie evidence or unapproved replacement is exposed. The existing owner-only photo endpoint is unchanged. Real application checks should cover a manager, unauthorized member, anonymous caller, photo replacement and revoked MFA; a failed image shows the neutral fallback.

## Actions and drafts

- Invite an existing active BrightWay username with explicit permissions. Membership starts only after recipient acceptance. The seven-day invitation lifetime and existing rate limits remain unchanged.
- Available permission choices are limited to the manager's current authority. Upcoming capabilities are labelled and collapsed; assigning them does not activate future tools.
- Edit a member in a native modal. Revocation and removing one's own management access require an explicit acknowledgement. Restoring access uses the saved applicable permission choices, which can be edited within the manager's authority.
- Cancelling an invitation has its own explicit confirmation. It does not remove an existing membership or delete an account.
- Pending writes prevent duplicate submission, editing and modal dismissal. An ambiguous invitation response keeps the original body/idempotency key and offers Retry same invitation. It never silently sends a new invitation.
- Known invalid-recipient errors keep an editable draft. Stale versions or uncertain membership writes preserve the edits but require explicit reload/reconciliation. Temporary focus-read failures retain an open draft and disable writes. Revoked membership/permission or invalid MFA clears private rows and dialogs.
- Closing a dirty editor or reloading requires explicit discard. A document-close guard covers unsaved member/invitation edits and pending writes. In-app navigation is not a general persistent draft store; finish or discard staff edits before leaving the page.

Native dialogs contain their errors, constrain keyboard focus in supported browsers, prevent Escape/close while work is pending and restore focus to the invoking row or Staff heading. Categories support arrow/Home/End keys. The mobile roster becomes cards while preserving table headers for assistive technology.

## Apply and verify

No new database migration or dependency is introduced by this Staff update. Pull from the project root and restart the backend and frontend. Any earlier pending migration, including the Dashboard decision index, still needs the normal migration deployment.

```bash
git pull --ff-only origin main
npm run dev:backend
```

Run `npm run dev:frontend` in another terminal. Deployment remains paused through Sprint 2 acceptance.

Automated coverage extends the existing staffing SQL integration case with literal username search, scoped counts, revoked permission projection, filtered cursor rejection, expiry and restore. Service/HTTP tests retain authentication, MFA, Origin, tenant, version, replay and audit protections. Frontend tests exercise explicit invitation/member dialogs, server search, revocation/restoration, ambiguous retries, rejected recipients, cancellation confirmation, focus failures and pending-write dismissal protection. Browser fixture QA is separate from acceptance on the application database.

On the application, compare the directory counts against known staff and invitations; search for a username outside the first page; test each category and paging. Invite a separate account, accept there and confirm membership. Change only the intended permissions, revoke and restore, and verify the other account's direct API/workspace access follows the change. Test a delegated manager against a higher-scope member, including a revoked one, and check the protected primary administrator. Verify cancellation/expiry, stale edits, failed retries, MFA/permission revocation, keyboard dialogs and the mobile roster. Record the observed results and application commit. No existing account, organization or staff data is deleted by this UI update.
