# Sprint 3 — issuer-scoped credential review

This slice connects existing organization staffing to education and experience review. It carries forward the owner's reported staffing/update checks; it does not declare G2/G3 or the complete production product accepted. Full production remains targeted for 26 January 2027. Deployment, including private staging, remains paused through the agreed acceptance gate.

## Implemented behavior

- When submitting a saved claim, the individual searches the approved active issuer directory and selects the correct organization, or explicitly declares that the issuer is unlisted and requests BrightWay review. Directory matches are choices, never automatic identity/name matching or verification. Similar names must be distinguished by the visible city/country and the issuer's actual identity.
- Education can route to approved Schools and organizations approved to offer education/training. Experience can route to an approved employer/organization, including paid work, internships, volunteering and self-employment claims. The saved claim and evidence still need actual review; selection alone confers no trust.
- The server resolves the submitted ID, checks issuer capability/status and stores its ID/name in both the review and immutable submission snapshots. Clients cannot inject reviewer IDs, statuses, ownership, MFA or trust flags. Existing reviews remain in their original BrightWay route; no migration matches old free-text names or changes old decisions.
- An issuer-bound review is available only through that organization's scoped reviewer API. A global BrightWay credential-reviewer role alone cannot read, assign, decide or download evidence for it. Unlisted and legacy reviews remain with authorized BrightWay credential reviewers. Ordinary organization membership, publishing permission, or an organization badge alone does not authorize review.
- Two distinct staffing permissions are now available: `organization.credentials.education.review` and `organization.credentials.experience.review`. Education is available only to education-capable organizations. A primary administrator has applicable core permissions but still needs current verified email and live MFA for reviewer operations. Delegated managers may grant only their own applicable permissions.
- Every privileged queue/detail/decision/download checks the current account, approved active organization, enabled membership, exact credential-kind permission and live MFA. Decisions and staff changes serialize through account/organization locks; profile/review revision checks prevent stale overwrites. Audits, claim/review/attempt changes and profile versions commit together.
- No self-review, including by a primary administrator or BrightWay reviewer. Queues omit the current person's claims. An authorized person must assign the review before downloading evidence or making a decision. Another organization cannot use a foreign review or queue cursor. Role changes never create identity verification, Campus access or billing.
- If an assigned reviewer loses their role/membership/kind permission, becomes inactive or disables MFA, another authorized reviewer for the same route can explicitly reassign that withdrawn review. A current authorized reviewer cannot have their assignment stolen. Recovery is versioned and audited; original snapshots and target/deadline stay intact.
- Evidence stays in the existing private credential storage. Downloads retain attachment/no-sniff/sandbox headers. Authorization is checked again after slow object storage I/O before bytes are returned. Focus rechecks clear private review data on denied access; stale notes remain visible but cannot be submitted until explicit reload. Account/organization changes discard stale private responses.
- Corrections require fresh evidence and preserve the first submission's target/deadline. The route remains fixed, including the original issuer name snapshot after an organization rename. A wrong initial issuer selection or permanently unavailable issuer needs a separately authorized routing-correction/support workflow; this slice deliberately supplies no automatic cross-issuer transfer or administrative bypass. That exceptional workflow remains a production backlog item.

## Local update and migration

Keep private .env values and the original MFA encryption key. Preserve local modifications; do not use a migration reset or force Git reset. Stop running Vite/test/backend processes before `npm ci`, especially on Windows where a native binding may be locked.

From the repository root:

```bash
git status
git pull --ff-only origin main
npm ci
npm run test:database --workspace backend -- --migrate
```

This guarded database command uses the separate direct TEST_DATABASE_URL. It needs application DATABASE_URL/DIRECT_URL only for destination comparison. Servers are not required. Ordinary skipped database tests do not count as an isolated integration pass.

After isolated checks pass, stop the application backend and migrate the intended application **development** database:

```bash
cd backend
npx prisma validate
npx prisma migrate deploy
npx prisma generate
cd ..
npm run dev:backend
```

Start the frontend in a separate terminal:

```bash
npm run dev:frontend
```

New additive migration: `20261028090000_add_credential_issuers`. Nullable issuer foreign keys keep legacy reviews unchanged, preserve history and restrict deletion of referenced organizations. This is a development database migration, not a cloud deployment.

## Application acceptance

Use consenting test accounts and actual approved test organizations. Record date, source SHA, applied migration and expected/observed outcome without documents, contact data, cookies or secrets.

1. Primary administrator: sign in with MFA → avatar → Switch account → approved school. Grant a separate member **Review education credentials**, have them accept the invitation if needed, and sign in with MFA. A publishing-only member must be denied reviewer APIs.
2. Applicant: save an education claim → Verification details → search/select that school → upload fresh private evidence → Submit. Confirm one saved review and the correct route/name. The school workspace shows it; another organization and the ordinary BrightWay review queue do not.
3. School reviewer: organization workspace → Credential review workspace → assign → download evidence → explicit decision/reason. Verify the owner sees feedback and the record's credential status changes without granting individual identity verification. Self-review and an unassigned evidence download must fail.
4. Revoke that reviewer's membership/kind permission with their review page still open. Direct API decisions/downloads must be denied; focus must clear private data. For an unfinished assigned review, a different authorized MFA reviewer can reassign it. A stale old decision cannot succeed. Repeat a concurrent decision/assignment: only one winner, one decision audit.
5. For an experience claim, select the approved employer. An education-only reviewer must not access it. A non-training company must not be selectable for education. For an unlisted issuer, explicitly choose BrightWay review and verify that only an authorized BrightWay MFA credential reviewer can act.
6. Request a correction, edit/save the claim, upload new evidence and resubmit to the same issuer. Confirm old/new snapshots, issuer binding and the original target/deadline. A forged attempt to switch to another issuer/BrightWay must conflict without consuming evidence or changing the profile version.
7. Check mobile layout/keyboard controls, failed directory/storage requests, retained files, MFA denial, foreign IDs/cursors and stale two-tab decisions. Existing accepted signup, recovery, profile, identity and organization flows carry forward; rerun affected paths only.

## Automated evidence and remaining acceptance

The focused service/HTTP suite covers scoped queues, exact kind, self-review, live MFA, unlisted fallback, immutable routing, private evidence, post-storage permission withdrawal, revoked-assignment recovery and audit rollback. The dedicated PostgreSQL case uses isolated synthetic accounts/organizations, actual concurrent transitions, real staffing revocation and failed-audit rollback. UI tests cover explicit issuer selection, scoped requests, denial, stale reasons and revoked access.

Check GitHub Actions for the exact published commit's actual SQL results. Local fixture/UI checks are separate from PostgreSQL execution and owner browser acceptance. No application database, live user documents, email or deployment is accessed by these implementation checks.

Implementation-workspace verification: 292 backend cases passed with 21 explicit database skips; 195 frontend cases across 19 files passed; Prisma validation/client generation, frontend lint and production build passed. Native Chromium at 1280px and 390px completed applicant issuer selection/upload/submission → issuer assignment/decision using the actual credential service with a fixture database and synthetic storage; no page runtime errors or horizontal overflow occurred. These browser checks do not demonstrate actual PostgreSQL/R2/email or deployed acceptance. Exact-commit CI supplies the dedicated PostgreSQL result separately.
