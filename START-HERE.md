# Start here — BrightWay recovery snapshot

For current organization onboarding, use SPRINT-2-ORGANIZATIONS.md. This file retains the earlier recovery procedure. Deployment is now paused until after Sprint 2 acceptance, including private staging.

## Preserve the current project

Stop both servers and keep your existing brightway folder intact as a backup. Extract this project into a separate folder. Do not delete your original .git directory, .env, unpushed commits or private recovery configuration. This ZIP has no Git history. Use it first as a separate working copy; reconcile it into your original repository after checking the restored behavior. No git reset, clean or force-push is required.

Copy your existing backend/.env into this project's backend folder locally. Do not send it in chat or commit it. Keep the same DATABASE_URL, DIRECT_URL, R2 bucket/credentials and original MFA_ENCRYPTION_KEY so the restored code can use your existing data, uploads and enrolled authenticators. The ZIP does not contain those data/services. Its .env.example contains empty placeholders only. If keys were previously exposed, rotate the affected provider credential separately; preserve access to the MFA encryption key or follow a deliberate recovery/rotation process.

## Install and prepare

From this extracted project's root:

```bash
npm ci
cd backend
npx prisma validate
npx prisma migrate deploy
npx prisma generate
cd ..
```

Populate backend/.env before these database commands. Existing migrations are included plus the MFA migration 20261020040000_add_authenticator_mfa. Keep migration history; do not run migrate reset. Resolve any database migration history/checksum error against your actual database before proceeding. No database was changed while assembling this ZIP.

## Check

```bash
npm run test --workspace backend
npm run test --workspace frontend
npm run lint --workspace frontend
npm run build
npm run test:database --workspace backend -- --migrate
```

The database command is separate: TEST_DATABASE_URL must point to a DIFFERENT database/Neon branch, using its direct unpooled connection, and DATABASE_URL/DIRECT_URL identify your application destination for comparison. Do not substitute the application URL. Skipped database tests are not a successful database integration run.

## Run

In one terminal at the project root:

```bash
npm run dev:backend
```

In another terminal at the project root:

```bash
npm run dev:frontend
```

Open http://localhost:5173. The Vite proxy forwards /api to http://localhost:5000. No frontend secrets or extra frontend environment file are needed for this local configuration.

## Browser acceptance

Recheck six-step signup/email delivery/photo storage; ordinary login and logout; existing profile/drafts/history/contacts; credential upload/submission/correction feedback; /security enrollment and single-use backups; second-step login; old-code rejection after regeneration; reset retaining MFA; and authorized reviewer APIs rejecting sessions without MFA. Existing individual accounts are allowed to remain unenrolled. Setting up MFA does not grant reviewer permissions or individual Verified status.

Continue the agreed plan only after recovery checks pass. No public deployment is performed or authorized by this package; deployment remains paused until after Sprint 2 acceptance.

## Provenance

The package uses the pinned GitHub source/UI and restored MFA integration from our working project. RECOVERY-CHANGES.json lists restored/adjusted paths relative to that GitHub head. FILE-MANIFEST.sha256 lists the deliverable source files. VALIDATION.md records the actual local checks and their limits.
