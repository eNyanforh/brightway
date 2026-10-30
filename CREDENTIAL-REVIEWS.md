# BrightWay credential submission and minimum reviewer workspace

This package builds on the installed six-step registration, profile/history/privacy, email verification and county-completion update. Copy all included files into the existing BrightWay root, preserving paths and replacing matching files together. It is application source, not a new standalone project.

## What is included

- Submit a saved education or experience record with one to three private supporting images or PDFs.
- Each file is at most 5 MiB. Images use real JPEG/PNG/WebP decoding and metadata removal. PDFs are parsed in a bounded worker: at most 100 pages, no password encryption, forms, embedded files or scripts/actions. PDF validation is not an antivirus service. Evidence is downloaded as an attachment with nosniff and sandbox headers, never embedded in the application.
- Private evidence stays in the existing private R2 bucket, under opaque server-generated keys. Original filenames are not sent or stored. Server responses never include storage keys, signed links or credentials.
- A persistent per-person limit permits 20 upload attempts per hour. The API also has request limits and two bounded concurrent uploads per process. Disconnecting an upload does not release its capacity until its work finishes.
- Submissions atomically claim fresh evidence for the owner's saved record/revision. Foreign, expired, wrong-revision and already-used evidence is rejected. Submission changes the profile version, preventing another tab from overwriting it.
- Owners can see submission history and reviewer feedback at /credentials, including false-credential decisions whose claims are removed from profile display.
- Restricted reviewers must enable authenticator 2FA in /security before using /admin/credentials. See AUTHENTICATOR-MFA.md for the current setup and login requirements. Restricted reviewers use /admin/credentials. Assignment changes Submitted to In Review. Only the assigned reviewer can decide or download supporting evidence. Reviewers cannot review their own credentials.
- Decisions are Verified credential, Action Required, Unable to Verify, or False Credential. Each decision needs an explanatory reason shown to the owner. Actor, revision, transition, reason and time are recorded transactionally.
- Action Required and Unable to Verify records may be edited and resubmitted with fresh evidence. Earlier snapshots, evidence and decisions remain in review history. Submitted, In Review, Verified and False Credential claims cannot be edited through normal history saves. Reviewed records cannot be deleted through collection replacement.
- The seven-day target and fourteen-day deadline start at the first submission and never reset after corrections. False credentials are excluded from the owner profile display, while their audit history remains accessible privately. The server's publicCredential projection evaluates the exact deadline at read time; public profile routes, when introduced, must call it and enforce the separate profile/individual visibility policy. This package does not introduce a public profile endpoint.
- Credential approval does not grant individual Verified status, publishing permission, or a verified identity badge. Completion still reports individual review as unavailable. That separate workflow is the next development slice.
- Draft profile edits in other sections survive credential submission; unsaved edits in the credential's history collection must be saved or discarded explicitly before submission. A record loaded from a newer profile version blocks submission; loading the latest profile requires explicit discard confirmation when local edits exist.

## 1. Install dependencies

From the project root, after copying all files:

```bash
npm install
```

The package adds pdf-lib to the backend and includes the root package-lock.json. Do not copy any credentials into source files.

## 2. Apply the new migration

Stop the backend first. Keep all previous migrations, including the registration gender migration. From the project root:

```bash
cd backend
npx prisma validate
npx prisma migrate deploy
npx prisma generate
cd ..
```

New migration: 20261018223000_add_credential_reviews. It adds the default MEMBER platform role and credential review/evidence/audit tables. Existing accounts stay members and existing education/experience drafts are not automatically submitted or verified. Do not use migrate reset.

## 3. Run checks

```bash
npm test
npm run test --workspace frontend -- --pool=threads --maxWorkers=1 --testTimeout=15000
npm run lint --workspace frontend
npm run build
npm run test:database --workspace backend -- --migrate
```

The database command must use the already configured separate TEST_DATABASE_URL in backend/.env. Its new credential integration case tests duplicate-submission and assignment races, snapshot preservation, correction/resubmission, evidence replay rejection and role revocation. Remote database checks and real-browser acceptance were not run by this package's author. Nine database tests are skipped in ordinary npm test when TEST_DATABASE_URL is not present in the process environment.

## 4. Give a real account reviewer access

Use a separate ordinary BrightWay account with a verified email. Self-review is rejected, so the reviewer and credential owner must be different accounts. Reviewer access is granted only by a trusted server operator; signup and profile APIs cannot assign it.

Replace reviewer_username with the existing lowercase username. From the project root:

```bash
cd backend
node scripts/superadmin.js staff reviewer_username credential-reviewer grant --by superadmin_username --reason "Assign authorized credential review duties."
cd ..
```

Log out and back in to show the reviewer link on the profile. Alternatively visit /admin/credentials after login. The server checks current role, active status and verified email on every privileged request; a stale browser cannot retain revoked permissions.

To revoke access:

```bash
cd backend
node scripts/superadmin.js staff reviewer_username credential-reviewer revoke --by superadmin_username --reason "Remove credential review responsibility."
cd ..
```

Role changes are recorded in ReviewerRoleAudit with the SERVER_OPERATOR_CLI actor. This is a server maintenance operation, not an impersonated user action. Do not put a reviewer access key in frontend configuration.

Reviewer reassignment and appeals are not part of this minimum workspace. A revoked reviewer's in-progress cases require an operational reassignment workflow in a later increment; revocation itself takes effect immediately.

## 5. Start the application

Use separate terminals from the project root:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

## 6. Browser acceptance

1. As the owner, save an education/experience record on Profile. Open Verification details.
2. Upload a valid supporting image or static PDF and submit. The record must show Submitted, while the account remains an ordinary individual.
3. In another browser session, log in as the reviewer and open /admin/credentials. Select the claim and assign it to yourself. The status becomes In Review and evidence downloads become available.
4. Choose Action Required and enter a clear reason. As the owner, open My credential reviews, read the feedback, edit the record on Profile and save it. Upload fresh evidence and resubmit.
5. Confirm the earlier submission and feedback remain in history. Assign and decide the revised claim. Verify credential approval does not grant individual identity verification.
6. Try another ordinary user's session, self-review, a stale page and a repeated submission. They must not read private evidence or overwrite a winning review decision.
7. Confirm other unsaved profile edits remain after credential submission. Test on desktop and a narrow mobile viewport.
8. In test data, confirm a False Credential decision removes the claim from profile display but keeps its private feedback/history accessible through My credential reviews.

## Evidence cleanup and retention

Unattached uploads expire after 24 hours; failed storage writes retain a retriable cleanup state. From backend, run the maintenance job as needed, and schedule it when deployment operations are configured:

```bash
node scripts/cleanup-credential-evidence.js
```

Each run processes up to 100 unclaimed objects. It never deletes evidence attached to a submission. Previous submission evidence and audit history are deliberately retained, including after corrections or a false-credential decision; they are not temporary uploads. There is no automatic attached-evidence retention/deletion job in this increment.

No remote migration, GitHub push, deployment, or live reviewer grant was performed. Homepage and header files are not included.

## Issuer routing update — 28 October 2026

The Sprint 3 integration adds explicit verified-organization issuer selection, per-kind organization reviewer permissions and scoped review/evidence authorization. Existing and unlisted reviews retain authorized BrightWay review. Consult [SPRINT-3-ISSUER-REVIEWS.md](SPRINT-3-ISSUER-REVIEWS.md) for current routing, migration, limitations and application acceptance; earlier implementation evidence above is historical. No automatic name matching or cross-issuer transfer is performed.

Staff grants now require a named Super Admin, password and fresh MFA through the terminal. See [MANAGEMENT-ADMIN.md](MANAGEMENT-ADMIN.md) for initial bootstrap, target prerequisites and audit controls.
