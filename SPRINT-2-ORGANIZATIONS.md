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

New migration: `20261027090000_add_organization_onboarding`. This adds organization tables/constraints without rewriting earlier migrations. Check the migration target privately before applying. An application development migration is not a cloud deployment.

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
node backend/scripts/set-organization-operator.js agent_username agent grant
node backend/scripts/set-organization-operator.js approver_username approver grant
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
