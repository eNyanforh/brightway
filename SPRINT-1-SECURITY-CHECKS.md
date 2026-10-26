# Remaining Sprint 1 security checks

The database, photo-review and name-correction journeys have been reported passing. The checks below complete the remaining acceptance evidence without rebuilding those features. Use consenting test accounts and synthetic document images.

## 1. Reviewer permission revocation

Keep the reviewer workspace open in its own browser session. From the project root, revoke the dedicated identity permission:

```bash
node backend/scripts/set-identity-reviewer.js nyeswa001 revoke
```

Return to the workspace and refresh/reload a private image or attempt a pending decision. Expected: the server denies access, private data clears when access is rechecked, and no decision is saved. A previously downloaded image cannot be recalled from the viewer's memory; judge new requests and the app's recheck behavior.

Restore the test permission afterward:

```bash
node backend/scripts/set-identity-reviewer.js nyeswa001 grant
```

Credential-review permission is independent and is preserved by these commands. Granting permission does not bypass MFA. Do not revoke the only operator's unrelated access or paste passwords/cookies into logs.

## 2. Private evidence and stale decisions

- Copy a synthetic evidence request URL. Request it without a session, then as an unrelated account. Expect denial and no image bytes. An unassigned identity reviewer must not receive private feedback or documents.
- Open the same assigned request in two reviewer tabs. Save a decision in the first. Attempt the old version from the second. Expect a conflict, no second decision and no overwritten feedback. Reload to see the committed result.
- Repeat a submitted owner request only with its original idempotency key/body after a lost response. Expect the same request; changing the body under the same key must conflict. Automated integration coverage already exists; do not weaken the version or destination guards to make a manual test easier.

## 3. Retention regression and safe cleanup

Run the targeted service/HTTP regressions from the project root (servers are not required):

```bash
node --test backend/test/manual-identity-review.test.js backend/test/identity-name-change.test.js backend/test/profile-photo-review.test.js
npm run test:database --workspace backend -- --migrate
```

The dedicated database command must have zero failed and zero skipped cases; keep TEST_DATABASE_URL separate from application URLs. It discovers all 16 integration files and uses synthetic data. Do not overwrite the test destination with the application URL.

The normal application cleanup command is:

```bash
node backend/scripts/cleanup-manual-identity-reviews.js
```

It changes due records and deletes due objects in the configured application environment. Run it only when intentionally exercising the agreed retention policy. New deletion-queue entries have a ten-minute safety grace; zero immediate object deletions is expected within that grace. No due rows means a no-op, not proof that expiry/retry works. Do not alter real review timestamps to accelerate a test. Hosted scheduling/monitoring remains a deployment task.

## Record

For each case keep: date, `git rev-parse --short HEAD`, migration status, applicant/reviewer labels, expected result, observed HTTP/UI result and pass/fail. Exclude private documents, tokens, codes, passwords and full connection URLs. These results complete security acceptance; the deployment pause remains until G1 is explicitly accepted.
