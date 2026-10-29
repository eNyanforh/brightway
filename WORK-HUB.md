# My Workspace and organization interests

My Workspace appears immediately after Learning in the personal sidebar once the authenticated account has submitted any organization interest or holds an enabled organization membership or incoming active invitation. The server derives that flag; browser storage and account URLs grant no rights. It remains available after rejection or withdrawal, so history is not lost. On mobile, My Workspace is reachable from the avatar menu; the existing five bottom destinations are unchanged.

## User journey

- Before first submission, the existing sidebar invitation opens only the interest form (`/organizations/new`). Its supporting text stays in place.
- After a successful submission, the form is replaced by: **Your interest to register “Organization name” is submitted for review in 72 hours.** The page explains that 72 hours is a review target, not automatic approval.
- **View Progress** opens the relevant card in `/work`. **Create another organization** opens a blank interest form with a new idempotency key. Repeated ambiguous create requests retry the same immutable body/key, never silently create another request.
- After first use, the initial sidebar invitation is removed and **My Workspace** appears after Learning. The workspace header has a labelled **Create an organization** action that opens a blank organization interest form.
- The separate Work heading and two-tab strip are not used. My Workspace has one header, the create action, organization search and Approved/Pending/Invitations categories.
- Search filters the full selected category on the server by organization name, with owner/recipient-bound counts and pagination. Empty results can be cleared.
- My Workspace separates active approved memberships (including staff memberships), pending owner requests and incoming invitations. Rejected/aborted requests remain under Request history. Each category uses cursor-bound pagination, and approved membership cards never duplicate owner approval history.
- Cards show the organization name, role and an initials image placeholder. Actual organization logo storage/upload has not been implemented; these placeholders are labelled and are not fabricated logos or identity evidence. No new upload input/provider dependency is introduced.
- Pending cards show a semantic progress bar, Edit and Abort. Progress comes from review stages: submitted 25, assigned Agent 50, recommendation awaiting separate decision 75; passing time never approves a request. The original deadline and overdue state remain visible. Agent notes are never returned to the applicant.
- Approved memberships show the current role and Manage, opening the existing permission-scoped private organization workspace. An approved request without a current active membership/organization offers no Manage action. Existing server permissions and privileged MFA remain authoritative.
- Rejected and aborted requests remain in private Request history and have no operational organization or Edit/Abort actions.

## Safe pending changes

Owner-only, strict, trusted-Origin-protected APIs:

- `GET /api/v1/work/access` returns only `{hasWork}` for the authenticated account.
- `PATCH /api/v1/organization-requests/:id` accepts the full editable interest fields plus `expectedVersion`; rejects ownership, trust, assignment, deadline, idempotency and approval injection.
- `POST /api/v1/organization-requests/:id/abort` accepts only `expectedVersion`.

Only SUBMITTED, ASSIGNED or RECOMMENDED requests can change. Foreign IDs return 404; stale or terminal versions return 409. Mutations have the existing authenticated-account rate limit, account/session/MFA-state rechecks and transactional audits.

An edit stores an immutable private pre-edit input snapshot, archives any exact prior Agent finding, removes the current assignment/finding, increments the version and returns the request to SUBMITTED for fresh investigation. The original target date stays unchanged. Past investigators remain excluded from final approval. Original create inputHash/idempotencyKey remain immutable, so a delayed original submission retry cannot undo an edit. The active duplicate-fingerprint check and database partial unique index still apply.

Abort requires an explicit confirmation dialog. It records ABORTED and an audit; it does not delete history or approve/create an organization. An aborted fingerprint can be used in a new interest, subject to the existing daily limits. Edit/Abort/approval races cannot silently overwrite each other: owner locks, request CAS and atomic audits preserve one winning transition. Storage failures roll back snapshots, finding retirement and mutations. The client blocks double submissions and requires a fresh read after uncertain or stale edits/withdrawals. Authorization failures and account changes clear private UI state.

## Update on your machine

Stop the running backend/frontend. Preserve backend/.env and its original MFA encryption key. From the repository root:

```bash
git pull --ff-only origin main
cd backend
npx --no-install prisma validate
npx --no-install prisma migrate deploy
npx --no-install prisma generate
cd ..
npm run test --workspace backend
npm run test --workspace frontend
npm run lint --workspace frontend
npm run build
npm run test:database --workspace backend -- --migrate
```

The new migration is `20261028150000_add_organization_request_changes`: adds ABORTED, updates the assignment constraint and creates private input revision snapshots. It does not rewrite old migrations or delete application data. Database integration uses the existing guarded, isolated TEST_DATABASE_URL; never point it at the application database. Prisma generation is required after pull even if dependencies were already installed. No dependency versions changed.

Restart the existing servers in separate terminals using `npm run dev:backend` and `npm run dev:frontend`. This updates a local application database; it does not deploy hosting. Deployment remains paused.

## Focused acceptance

1. First-time representative: initial invitation opens only the interest form. Submit once, confirm the named 72-hour acknowledgement and both next actions, and verify My Workspace appears directly after Learning without a hard reload. Refresh/sign in again and confirm it persists.
2. Create a second distinct organization. Both pending cards appear with the correct roles/progress. An approved organization appears once with Manage under Approved and a separate staff member's organizations are included. Unknown/revoked membership cannot manage via direct URLs.
3. Edit a pending request: confirm the saved input changes, status returns to submitted, old Agent assignment/findings cannot authorize approval and the original target is unchanged. A stale second tab retains entered fields and receives a conflict rather than overwriting.
4. Cancel Abort: no write occurs. Confirm Abort: card becomes withdrawn, no progress/Edit/Abort remains and stale Agent/approver mutations fail. An approved organization cannot be aborted through this API.
5. Check another account cannot read/edit/abort the owner's request or use a foreign pagination cursor. Missing/foreign Origin and malformed/injected mutation fields fail. Reviewers without current authorization/MFA remain denied.
6. Check desktop/mobile, keyboard confirmation focus/Escape, role labels, no horizontal overflow, context switching and unsaved personal profile draft preservation.

Implementation verification uses synthetic fixture services/UI tests and native Chromium at 1280px/390px against a production Vite preview. Actual PostgreSQL migration replay/race checks run in the commit's GitHub Actions isolated database, independently of those fixture/browser checks. No owner database, email, uploaded identity document or deployment service is accessed by implementation tests. Owner application acceptance must be recorded separately.

## Workspace categories — 29 October 2026

My Workspace now uses a company-building sidebar icon, a labelled **Create an organization** button and three category controls beneath search: **Approved**, **Pending**, **Invitations**. Approved is the default; View Progress opens Pending. The redundant page-footer switch-account/staff-invitation link is removed. Organization navigation returns to My Workspace, while Return to Personal remains available.

- Approved lists current enabled memberships in active, approved organizations. Each organization appears once with its role and permission-scoped Manage entry. Approval history alone never provides operational access.
- Pending lists only SUBMITTED, ASSIGNED and RECOMMENDED owner requests, with existing Edit/Abort and stage-based progress. Rejected/ABORTED owner requests remain behind **Request history**; they are not pending.
- Invitations lists only the recipient's unexpired pending invitations for active, approved organizations. It shows proposed access and explicit Accept/Decline. Acceptance uses the existing versioned, audited consent API, rechecks inviter authority and creates membership only after success. The UI opens Approved after acceptance. Sending invitations remains in authorized organization staff management.
- An incoming active invitation also makes My Workspace discoverable before the recipient has any membership or request.
- `GET /api/v1/my-workspace?tab=approved|pending|invitations|history&search=...&cursor=...` performs authenticated, owner/recipient-bound database search and counts, with 20-row pages. Search covers the full selected scope rather than only loaded cards. Cursor anchors must still match the current account/category/search; a changed or foreign anchor requires reload. Private fields, Agent findings and contact details are excluded. No-store responses and existing live session/MFA-state checks apply.
- Category/search navigation is URL-addressable, search is debounced and old requests are aborted. Delayed responses cannot replace a newer category/account. Mutation failures retain the view and require explicit reload; no invitation response or Abort is automatically replayed. No new migration, dependency or storage credential is required.

Acceptance: verify default Approved, Pending after submission, invitation Accept/Decline, labelled create action, full-scope search/pagination, private history, expired/foreign/revoked access denial, stale mutation handling and desktop/mobile keyboard layout. Existing onboarding/review decisions and privileged MFA remain unchanged. Deployment remains paused.

## Workspace interface refresh — 29 October 2026

The My Workspace directory and its create/edit interest journey use the scoped `frontend/src/pages/my-workspace.css` stylesheet. Shared organization-tool styles remain in `organizations.css`; obsolete directory overrides have been removed from that shared file. The public header and Personal/organization authorization models remain intact.

The refreshed interface provides a compact page header and labelled create action, one search/category surface, readable organization type/role/status cards, stage-based review progress, explicit proposed invitation permissions and expiry, private decision feedback, purpose-built empty/loading/error states, a clear Abort confirmation and responsive touch/keyboard controls. Initials remain labelled placeholders; this update does not introduce logo uploads, invented statistics or new trust states. Reduced-motion preferences are respected. A failed background refresh retains the visible list but blocks mutations until a successful reload.

Acceptance should cover Approved/Pending/Invitations and history, live search and pagination, loading/empty/error recovery, invitation consent, Edit/Abort confirmation, create/edit fields, and scoped Manage on desktop and narrow mobile. The underlying request/consent APIs and business rules are unchanged. There is no migration or dependency change, and deployment remains paused.
