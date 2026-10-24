# BrightWay manual identity: private upload step

This implements BACKEND uploads only. It does not implement identity request submission, approval, reviewer access, the five-working-day deadline, or frontend upload controls. Persona remains paused. No uploaded file changes an identity trust flag.

## 1. Copy the files

Use your development project: `C:\Users\DELL\Downloads\brightway`.
Extract the archive outside the project, then copy its `backend` folder into the project's `backend` folder, merging directories. These are complete files, not diffs. Do not delete either backend folder. The profile eligibility files are included so the previously installed step is preserved.

The supplied `backend/prisma/schema.prisma` is the complete schema from the existing 16-migration queue implementation plus the new evidence tables. If your schema has additional local models, retain those models and merge the two Account relation fields and three new declarations described in SCHEMA-ADDITIONS.txt rather than replacing your entire schema. The route index adds three imports and mounts the evidence routes after sessions are created; preserve any additional local route registrations too.

## 2. Private storage configuration

Create a separate R2 bucket for identity evidence. Keep public access disabled: no public development URL and no public custom domain. Set:

```dotenv
R2_IDENTITY_BUCKET=brightway-private-identity
```

Use your actual bucket name. This value must differ from R2_BUCKET. Your server's existing R2 credentials must have read/write/delete access to this bucket. No new API key is provided in this package. Keep keys in backend/.env and out of Git. MANUAL-IDENTITY.env.example is supplemental; it does not replace backend/.env or backend/.env.example.

Image uploads fail closed if the separate bucket is not configured. Other existing features can start without configuring it. The application cannot inspect whether a bucket has been made publicly accessible: private access must also be configured in R2.

## 3. Validate and test the isolated database first

From the project root:

```bash
cd backend
npx prisma validate
cd ..
npm run test:database --workspace backend -- --migrate
```

The guarded command applies the migration to TEST_DATABASE_URL, generates the client and discovers the new database test automatically. It requires your separate test database, DATABASE_URL and DIRECT_URL settings. It should discover 13 database tests if you have the previous 12. Do not bypass the isolation guard.

## 4. Apply to the development application database

After the isolated tests pass, from the project root:

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
cd ..
npm run test --workspace backend
npm run build --workspace backend
```

The new migration is `20261024183000_add_manual_identity_evidence`. This updates your development database schema; it does not deploy BrightWay publicly. Restart your running backend after generating the client. Running servers are not required for the test commands.

## API (frontend integration comes next)

Base: `/api/v1/manual-identity/evidence`. Uses the existing login cookie. All responses are no-store.

- GET base: list up to six own, unexpired READY images. Does not expose storage keys.
- POST `/GOVERNMENT_ID` or `/SELFIE`: raw JPEG, PNG or WebP bytes, up to 5 MiB. Requires trusted Origin and `X-Identity-Consent: manual-identity-upload-v1`.
- GET `/:id/download`: own unexpired READY image, served as a private attachment through the server.
- DELETE `/:id`: trusted Origin required; makes an unsubmitted image inaccessible immediately and schedules storage cleanup.

Uploads require server-confirmed profile completion, at least one VERIFIED education and at least one VERIFIED experience record. Browser-supplied eligibility/ownership/approval is never used. Submission must recheck these conditions inside its later transaction.

The future upload screen must present this notice before setting the consent header:

> These images are for BrightWay's manual identity review. They are private and separate from your profile photo. Unsubmitted images expire after 24 hours. Remove an unused image at any time before submission. Uploading does not submit a request or verify your identity.

Images are decoded and converted to WebP, metadata removed, maximum dimensions 2400 × 2400 without enlargement. Invalid formats, animation, dimensions below 320 × 240 and oversized inputs are rejected. This validates file safety; reviewers must assess legibility and authenticity later.

The service allows two concurrent uploads per service instance, two active decodes per process, six live unsubmitted images per account and twenty reserved attempts per rolling one-hour window. Failed decoding/storage attempts consume budget. Database locking serializes account reservations across instances.

## Expiry and cleanup

From the project root:

```bash
node backend/scripts/cleanup-manual-identity-evidence.js
```

Run regularly (for example every ten minutes) while testing and schedule it before production use. No scheduler is installed by this package. Expired images become unreadable at the 24-hour boundary; physical deletion happens on cleanup after a ten-minute grace period. Failed deletes remain retriable; batches contain at most 100 rows. Attached evidence is excluded for the later request workflow. Submitted-evidence retention is not defined or implemented by this upload-only step. Do not represent this as complete five-working-day identity verification.

## Validation performed here

- Prisma schema validation: passed, without connecting to a database.
- Backend syntax build: passed.
- Backend regression suite: 173 passed, 0 failed, 13 database tests skipped.
- Nine new focused tests passed, including actual decoding, private HTTP access, suspension and a disconnected upload retaining its slot.
- New PostgreSQL integration test is supplied but NOT run here: no isolated database connection was available.
- Real R2 bucket configuration and browser upload acceptance have NOT been verified here.

After installing, send the isolated database results. The next implementation is submission with immutable identity evidence, a five-working-day review target and authorized MFA-protected BrightWay review decisions.
