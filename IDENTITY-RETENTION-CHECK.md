# Attached identity evidence: isolated database and real R2 check

The owner has confirmed the original identity correction/resubmission journey. This command addresses the remaining Sprint 1 retention evidence gap. It does not accept the gate automatically or deploy BrightWay.

## Run from the project root

Pull the current source safely, preserving local changes if Git refuses the fast-forward. Existing `backend/.env` must contain the distinct direct `TEST_DATABASE_URL`, the application URLs for destination comparison, and the already working private identity R2 credentials/bucket. No new bucket, key or migration is required. Servers may stay stopped.

```bash
git pull --ff-only origin main
npm ci
npm run test:database --workspace backend -- --migrate
node backend/scripts/check-identity-retention.js --run
```

The database suite now discovers **17** integration files. Keep the destination guard: never set the test URL to the application database. The last command fails closed before database/storage work if URLs are missing or match an application destination. It connects its Prisma client directly to the validated test URL, independent of application database configuration.

## What happens

- Creates two synthetic fixture accounts with unusable password hashes, a complete synthetic applicant profile and test reviewer role/MFA session only in the isolated database. These fixtures do not assert a real person's identity.
- Generates a plain synthetic PNG locally. The normal image-processing/upload services sanitize it to WebP, store two generated private identity objects and attach them through the normal submission/assignment/decision services.
- Uses exact service-generated random keys; checks for collisions before writing, never lists a bucket and refuses foreign-key reads/deletes. The durable database key matches the actual storage key, including on partial failures.
- Checks private owner readback and a valid fixture approval. Advances only an injected clock on this runner's service instances to the 30-day boundary. It does not change the computer/server clock or existing users' timestamps.
- Limits cleanup candidate queries to the fixture attempt/account, including transaction clients. Verifies expired private access, snapshot/feedback purge, retained decision audit and preserved valid verification.
- Exercises the ten-minute deletion grace without waiting in real time, by setting only its generated fixture rows' retry timestamp consistently with the injected clock.
- Injects one deletion failure **before** the provider call, verifies one object remains queued and present, then retries real storage deletion. This proves retry handling with real stored objects; it does not simulate a Cloudflare outage.
- Uses authenticated `HeadObject` checks to prove both objects are absent, verifies DELETED rows and an idempotent repeat. Finally removes only its own objects and fixture database rows.

The profile-photo fixture is database-only; the profile-photo bucket is not accessed. The test uses the configured identity bucket, which may also hold application documents, but accesses only exact generated keys tracked by this invocation. Its sweeps cannot select existing review attempts or evidence belonging to another account.

## Expected result

After the two stage PASS lines, the final line is:

```text
PASS: {"attached":2,"snapshotsPurged":1,"objectsDeleted":2,"deletionConfirmed":true,"retryVerified":true,"identityPreserved":true}
```

A successful exit means the run's synthetic database/R2 acceptance passed. Save that summary with the current short Git SHA (`git rev-parse --short HEAD`). Do not paste credentials, private documents or connection URLs.

If it fails, the command prints a sanitized failing stage and exits nonzero. It attempts disposal of all generated objects, including ambiguous puts. It confirms object absence before removing fixture DB ownership records. If deletion cannot be confirmed, it retains those records and prints the synthetic run ID for investigation; do not run an unscoped bucket deletion or erase the ownership records. A hard process kill may leave fixtures for the normal retention policy; do not assume the finally-style disposal ran. Existing review documents must never be deleted to make the test pass.

## Validation boundaries

Unit tests cover the application-destination guard, scoped candidate sweeps, collision/foreign-key rejection, ambiguous-write cleanup and failed deletion reporting. The new PostgreSQL integration file runs this scenario with real SQL/image processing and Map storage; its result must be checked in the new commit's CI. No credentials are supplied to CI and it does not call R2. The live command must be run in Emmanuel's configured environment; this workspace has no database or R2 credentials.

The production hosted cleanup schedule, monitoring and restore readiness remain deployment tasks. A successful acceptance probe does not install them or authorize deployment.
