# Sprint 2 — organization requests and verification

This is the first complete organization-onboarding vertical slice. It implements private requests, Agent assignment/investigation, separate authorized approval, verified public presence and the initial primary-administrator membership. It does not declare all of Sprint 2 accepted. G2 remains due 8 November 2026; the full agreed production target remains 26 January 2027, subject to acceptance gates.

**Deployment is paused until after Sprint 2 acceptance, including private staging.** The earlier provider-neutral staging package is parked. No host, paid service, DNS or cloud environment is created by this change.

## Rules implemented

- An authenticated individual representative can request a School, NGO or Company globally. A Verified Individual badge is not a prerequisite. Organization verification never grants individual identity or credential verification.
- The form asks organization name/type, structured operating location and representative role. It does not ask for extra representative name/contact fields or require requester/Agent document uploads.
- Schools offer education by definition. Other types must explicitly answer “Can this organization offer training/education also?” Yes or No.
- Requests remain private until approval. The organization verification target is 72 elapsed hours from submission; exceeding it never automatically approves anything. This is separate from individual identity's five-working-day target.
- An authorized BrightWay approver assigns an authorized Agent. The Agent records existence, operating location, representative authority, organization type and operational-status checks, private findings, setup assistance and a recommendation.
- The applicant cannot investigate or decide their own request. The assigned Agent cannot make the final decision, even if that account also has approver permission. Final approval requires all five positive checks and a positive Agent recommendation.
- Agent/approver capabilities are separate from credential and identity reviewer permissions. Active accounts, verified email, current MFA and a valid session are enforced on the server for privileged operations. The bootstrap CLI preserves other roles.
- Approval atomically creates one active organization, its verified operating location, one enabled PRIMARY_ADMIN membership for the representative and an audit record. Pending/rejected/suspended organizations do not have a public active presence. Applicant identity, private findings and account contacts are absent from the public projection.
- Body-bound idempotency, persisted submission limits, version checks, live role/session checks and transactional audits protect retries, races and revocation. Owners never receive private Agent notes. Private endpoints use no-store; mutations require a trusted Origin.
- Core organization creation is global. No Campus activation, billing, school academic tools or issuer-review rights are granted. Broader membership/invitations, granular permissions and personal/organization context switching remain Sprint 3 work. This slice records setup assistance; it is not the later ongoing staff/setup-management product.

## Update an existing local project

Keep private `.env` values and the existing MFA encryption key. Do not reset migration history or delete the old project. From the repository root:

```bash
git status
git pull --ff-only origin main
npm ci
npm run test:database --workspace backend -- --migrate
```

Resolve any local modifications before pulling; do not discard them blindly. The guarded database command requires the existing separate direct TEST_DATABASE_URL and the application DATABASE_URL/DIRECT_URL for destination comparison. It applies migrations only to the isolated test destination and runs the dedicated PostgreSQL suite. App servers are not needed for that command. Missing configuration or skipped ordinary tests are not an integration pass.

After the isolated checks pass, stop the local backend and apply the new migration to the intended **application development database**:

```bash
cd backend
npx prisma validate
npx prisma migrate deploy
npx prisma generate
cd ..
npm run test --workspace backend
npm run test --workspace frontend
npm run lint --workspace frontend
npm run build
```

Organization migrations: `20261027090000_add_organization_onboarding` and `20261027120000_add_organization_finding_history`. This adds organization tables/constraints without rewriting earlier migrations. Check the migration target privately before applying. An application development migration is not a cloud deployment.

Restart the usual local servers in separate terminals:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

## Bootstrap consenting test operators

Use **three distinct accounts**: the applicant, the investigating Agent and the final approver. Agent and approver need verified email and enabled MFA; the applicant can remain an ordinary individual account. Register missing accounts using consenting test addresses, not another person's address.

The following usernames are placeholders; substitute the exact existing usernames. Run from the repository root on the trusted development machine after migration:

```bash
node backend/scripts/superadmin.js staff agent_username organization-agent grant --by superadmin_username --reason "Assign organization investigation duties."
node backend/scripts/superadmin.js staff approver_username organization-approver grant --by superadmin_username --reason "Assign organization approval duties."
```

This narrow server-operator command does not create a general Super Admin, bypass MFA or grant credential/identity review. Revoke the same capability by replacing `grant` with `revoke`. Permission changes are audited. Do not grant your applicant all roles to bypass separation of duties.

## Browser acceptance on the application database

Record date, source SHA, migration status, actor labels, expected/observed results and defects. Never publish passwords, personal data or tokens.

1. Applicant: use the existing sidebar **Create an organization** block, or the mobile account-menu block beneath Logout. Submit at `/organizations/new`. Confirm an owner-only SUBMITTED request and a 72-hour target. Confirm no public organization exists yet, no uploads are requested and another ordinary account cannot read it.
2. Agent/approver: open **Organization review workspace** from the requests page; route `/admin/organizations`. Without organization permission or current MFA, direct API actions must be denied. Existing identity/credential reviewer permission alone must not authorize this workspace.
3. Approver: select the request and assign the distinct Agent's exact username. Applicant/self-assignment must fail; stale assignment must return conflict.
4. Agent: sign in with MFA, open the assigned request, record the five real checks, private findings and recommendation. Incomplete checks must prevent positive approval. There is no Agent final-approval control or evidence-upload requirement.
5. Separate approver: reload, read the recorded findings, choose an explicit final decision and provide requester-facing feedback. A stale or repeated decision cannot produce another organization. An investigator trying the final decision directly must be denied.
6. Applicant: reload history. On approval, follow **View organization** to `/organizations/:id`; confirm the verified organization/location, one primary-administrator membership in the database, and absence of private notes/account email. Rejection must create no organization and show only the intended decision feedback to the owner.
7. Security/regression: test a foreign applicant, revoked Agent/approver, a stale two-tab decision, duplicate submission and mobile keyboard/navigation. Confirm earlier individual/profile/draft/credential/identity features remain intact. Do not manufacture a pass by editing trust flags.

No whole-flow acceptance on Emmanuel's actual application database or provider services is claimed until these checks are reported. Automated simulated-browser coverage is separate evidence.

## Evidence and limitations

Local checks on this implementation: 265 backend cases passed; 19 database cases were explicitly skipped without TEST_DATABASE_URL. The new organization module has 12 service/HTTP cases and one dedicated real-PostgreSQL case; the latter must pass in CI or the isolated test database. All 176 frontend regression cases across 17 files passed, including owner requests, immutable retries, private-data clearing on account/permission changes, Agent/final-approver separation and public visibility. Lint and production build are checked separately.

Native Chromium checks at desktop 1280px and mobile 390px exercise request → assignment → Agent recommendation → separate final approval → public page, using synthetic accounts and the actual organization service with a memory database behind intercepted API calls. They check runtime errors and horizontal overflow. This is not real PostgreSQL, R2, email or deployed-environment acceptance.

GitHub Actions executes the full regression on the repository's supported Node versions, clean migration replay and dedicated PostgreSQL integration suite. Consult the exact commit's run for the actual result; reading test source is not a successful test execution. Any failed gate must be corrected and the forecast updated. Do not infer complete Sprint 2 or production readiness from code presence or dates.

## Owner-reported organization browser acceptance — 27 October 2026

Emmanuel reported that the following checks worked in the real local application: submission → assignment → Agent recommendation → separate approval; applicant reviewer access denied with “Organization verification permission is required”; approved public presence in an unsigned-in browser without private notes; rejection and owner-facing feedback; stale two-tab decisions; active duplicate requests; Agent permission withdrawal before findings and private-data denial; Agent/final-approver separation; mobile layout; and Agent permission without MFA remaining denied. These are owner reports, not independently captured HTTP/database/browser transcripts. The precise local SHA was not supplied. Preserve these passes; do not ask for wholesale repetition.

The proposed requirement for a 100% complete individual profile before requesting an organization was paused by the owner. The separate Agent and approver workflow was explicitly retained. Neither decision requires changing the existing applicant prerequisites or removing investigation.

## Recovery after an investigating Agent is revoked

The follow-up adds a private `OrganizationFindingArchive` table. A currently authorized MFA approver can replace the Agent on a RECOMMENDED request, including when the prior Agent is permanently revoked or suspended. The replacement must be a different active authorized Agent. Reassignment preserves the exact old findings, their author/time and the version they supported; increments the request version; removes those findings from the current decision input; records an audit; and returns the request to ASSIGNED. The 72-hour target is unchanged. If any write/audit fails, retirement and reassignment roll back together.

A new Agent must submit fresh checks and findings before a final decision. Neither current nor former investigating Agents can become the final approver of that request, even if later granted approver permission. Prior findings are shown only to currently authorized approvers, never in owner/public projections or to a replacement Agent. The UI shows the latest ten archived investigations; the server checks the entire history for separation of duties. Previous migrations, existing approvals and other verification trust remain intact.

### Next application-browser check after updating

1. Pull the reviewed update. First run the isolated database suite with `--migrate`. Then stop the application backend, apply pending development-database migrations and regenerate Prisma using the earlier commands. Restart both local servers. This is not a cloud deployment.
2. Use a disposable pending organization request with an Agent recommendation already submitted. Keep a stale final-decision tab open as the approver.
3. Revoke that Agent's permission using the existing CLI. Reload the approver's other tab: it should require reassignment and withhold final-decision controls.
4. Assign a distinct replacement Agent who has verified email, enabled MFA and Agent permission. Four distinct account roles are needed for this case: applicant, original Agent, replacement Agent and final approver. An existing test account can be configured as the replacement; do not restore the revoked permission to bypass recovery.
5. Confirm status ASSIGNED, the original target unchanged and earlier findings preserved under Previous investigations for the approver. Owner/public views and the replacement Agent must not receive that private history. No public organization should exist yet.
6. Submit fresh replacement findings, then approve as the separate approver. The stale old decision must fail. Confirm one organization and one primary administrator, while the original Agent remains revoked. A past investigator with approver permission must still be denied a final decision.

This new recovery journey still needs owner-reported acceptance after migration. Local service/HTTP regression covers 269 passing cases with 19 explicit database skips; the focused organization module covers 16 cases. The dedicated PostgreSQL case additionally covers permanent Agent withdrawal, reassignment races, audit-failure rollback, private exact history, stale findings/decisions and former-investigator exclusion. Frontend regression adds three focused recovery cases. Consult the exact commit's GitHub Actions results for actual SQL execution. Deployment remains paused through Sprint 2 acceptance; this fix does not declare G2 passed.

## Subsequent reported browser checks and Sprint 3 handoff

After the recovery fix was supplied, Emmanuel reported that it worked as expected. He subsequently confirmed an NGO outside Liberia with training enabled, and a Company with training disabled, both worked as expected. Treat these as owner reports, not independently observed browser/network/database traces. Preserve them alongside the earlier organization checks.

The primary-administrator handoff and setup-assistance privacy instructions were followed by requests to proceed, without a separate explicit per-check outcome or local SHA. Do not silently turn those instructions into acceptance evidence. The owner requested proceeding with Sprint 3; see SPRINT-3-STAFF.md for the first staffing/context slice and its distinct acceptance checks. G2 and G3 are not automatically passed by this handoff. Deployment remains paused unless the owner deliberately resumes it after the agreed gate.

Staff grants now require a named Super Admin, password and fresh MFA through the terminal. See [MANAGEMENT-ADMIN.md](MANAGEMENT-ADMIN.md) for initial bootstrap, target prerequisites and audit controls.
