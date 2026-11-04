# Independent BrightWay Management

Management staff sign in at `/superadmin/login`. They have their own identities,
passwords, verified email, authenticator factors, backup codes, sessions and
recovery proofs. No ordinary Account or Person profile is required or created.
Organization staff continue to sign in personally; issuer authority comes from
current organization membership, the relevant permission and MFA.

## Update order — operator-run, never automatic promotion

1. Keep application hosting deployment paused. Back up the development database
   before an owner-approved schema update. Stop old backend workers during the
   cutover: old binaries still accept personal reviewer roles.
2. Install locked dependencies with `npm ci`. In `backend`, run
   `npx --no-install prisma validate`, `npx --no-install prisma migrate deploy`,
   then `npx --no-install prisma generate` against the intended development DB.
   Run integration checks separately using an isolated `TEST_DATABASE_URL`.
3. Configure two **new, independent** server secrets in untracked `backend/.env`:
   `MANAGEMENT_MFA_ENCRYPTION_KEY` (64 hex characters) and
   `MANAGEMENT_EMAIL_SECRET` (at least 32 unpredictable characters). Generate
   locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
   Keep both out of Git, screenshots and chat. Do not reuse personal MFA/email
   secrets. Back up the encryption key securely: losing it disables TOTP access.
4. Configure the existing verified Resend sender using `RESEND_API_KEY` and
   `EMAIL_FROM`. Enrollment and management recovery use distinct email purposes.
   Start the updated backend and frontend together.
5. Bootstrap and enroll the independent founding Super Admin, then provision
   named staff. Inventory/release unfinished legacy assignments explicitly.
   Record acceptance on the exact revision before normal administrative work.

Migration `20261031130000_management_authentication_realm` adds independent staff,
proof/session/audit tables. `ReviewPrincipal` preserves exact historical actor IDs
and moves existing actor foreign keys without rewriting reviews, evidence,
revisions or deadlines. Account insert triggers support new personal applicants;
staff insert triggers support new internal actors. Legacy grants remain historical
records but no longer authorize management APIs. No passwords, TOTP secrets or
existing users are copied/promoted. Historical final approvals remain valid.
This is a forward schema migration; do not run an old backend against it as a
rollback. Restore/release recovery must be rehearsed separately before hosting.

## First Super Admin

From the repository root, in an interactive terminal:

```bash
node backend/scripts/superadmin.js bootstrap founder_management --reason "Establish the independent founding management identity."
```

Enter full name, management email and a new password (12–128 characters) at the
hidden prompts. The identity starts **PENDING**, with no workspace access. Sign
in at `/superadmin/login`, verify the email code, add the separately labelled
management authenticator secret, confirm its TOTP, and save the one-time backup
codes. Never reuse a personal authenticator entry. Bootstrap is permanently closed
after the first successful staff creation, even if that staff is later disabled.
Concurrent bootstrap attempts have one winner.

## Subsequent staff and permissions

```bash
node backend/scripts/superadmin.js create named_agent --by founder_management --reason "Provision a named organization investigator."
node backend/scripts/superadmin.js staff named_agent organization-agent grant --by founder_management --reason "Authorize organization investigations only."
node backend/scripts/superadmin.js staff named_agent organization-agent revoke --by founder_management --reason "Withdraw investigation access after role change."
```

The responsible active Super Admin enters their management password and a fresh
management app/unused backup code privately. Creation also prompts for the new
staff details/password. No secrets are accepted in arguments, environment values,
logs or committed files. Each operation is audited and its temporary terminal
session is removed even after failure. New staff complete their own email/MFA
enrollment in the browser.

Supported capabilities: `credential-reviewer`, `identity-reviewer`,
`organization-agent`, `organization-approver`, and `superadmin`.
Super Admin implicitly receives **every implemented** management permission.
`access revoke` disables an internal identity. Permission changes increment the
staff version and invalidate its sessions and outstanding challenges. The last
active enrolled Super Admin cannot be removed. Disabled staff cannot be casually
reactivated with `access grant` or recovery.

Root authority still requires current MFA, attributable audits, no self-review,
separate Agent/Approver people on the same request, and issuer boundaries. It
cannot impersonate school staff or override a participating issuer decision.

## Conflicts across independent identities

Same-email personal accounts are excluded automatically. In management Security,
declare every other owned/related personal username before review. Declarations
are additive and audited; they confer no personal login authority. Organization
review checks also compare current and historical investigators for shared-person
conflicts. Separate credentials do not remove a conflict of interest.

The software cannot discover undisclosed alternate identities from credentials
alone. Staff onboarding and supervision must record these declarations; this
implementation does not claim universal human-identity matching.

## Unfinished legacy reviews

```bash
node backend/scripts/management-transition.js inventory --by founder_management
node backend/scripts/management-transition.js release credentials REQUEST_UUID VERSION --by founder_management --reason "Transfer an unfinished obsolete personal assignment to management."
```

Inventory reports counts of legacy grants and up to 200 unfinished assignments per
category. Categories for release are `credentials`, `identities`, `photos`, `names`.
For identities, use the **requestId** and its returned request.version, not the
attempt ID. Release returns the item to its submitted/pending queue with a new
version; a management reviewer explicitly claims it through the normal flow.
Original evidence/snapshots, revisions and first deadlines remain. The transition
audit records the previous actor and version. Final decisions, current management
assignments and participating-issuer claims cannot be released this way. Repeat
inventory after each batch when the limit is reached.

Organization requests use the existing versioned Agent replacement process: an
authorized independent Agent must investigate and record new findings, and a
different authorized Approver decides. Old findings remain attributed/history.
Never relabel an old review as if a new management staff member performed it.

Old personal grant scripts cannot authorize management after this cutover. Review
applicant history/submission and organization issuer review remain personal flows.
Copied evidence URLs still require the appropriate realm, current permission,
assignment and conflict checks, including rechecks after storage access.

## Recovery, retention and operational acceptance

Management password recovery sends only to registered active management email;
email code **and existing management MFA** are required. Personal recovery cannot
reset management credentials. Password changes revoke management sessions while
preserving MFA enforcement. Backup regeneration needs password plus a fresh
management factor or the existing recent-MFA window, and displays new codes once.
Password-only retries do not extend that window.

Maintain at least two separately enrolled Super Admins and offline backup codes.
If all root factors and backups are lost, there is deliberately no public/email-only
MFA bypass or bootstrap reopening. A documented, identity-checked offline recovery
procedure must be approved/rehearsed before production; it is not performed by this
update. Never copy a personal password/factor to recover management access.

The existing hosted identity cleanup now also deletes expired/consumed management
challenges and expired sessions, retaining active factors and audits. Schedule and
monitor the hosted job at deployment; a one-off local run is not scheduling proof.

Acceptance requires isolated PostgreSQL migrations/concurrency, wrong-realm
cookie/MFA/recovery denial, two named operators, issuer boundaries, current
revocation, evidence access, historical preservation and desktop/mobile browser
journeys. Fixture tests alone do not establish application or production readiness.
