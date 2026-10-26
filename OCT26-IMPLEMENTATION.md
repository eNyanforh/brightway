# BrightWay implementation — 26 October 2026

This consolidated update supersedes the previous photo-review ZIP. It includes that entire feature plus the first-approval/upload concurrency fix, an expanded real PostgreSQL regression case, a read-only GitHub Actions check workflow and an honest Sprint 1 acceptance record. It does not implement organization onboarding or publish/deploy anything.

## Install when you return

1. Stop the backend and frontend. Extract this package into `C:\Users\DELL\Downloads\brightway`, merging folders and replacing the supplied files. Include `.github/workflows/ci.yml`. Preserve existing files outside the package and all local `.env` settings. No existing migration is replaced; the new migration directory is `20261025200000_add_verified_photo_reviews`.
2. From Git Bash, validate/generate and check the isolated database first:

   ```bash
   cd ~/Downloads/brightway/backend
   npx prisma validate && npx prisma generate
   cd ..
   npm run test:database --workspace backend -- --migrate
   ```

   This discovers 15 database integration files on this checkout. All must pass without skips. The existing destination guard remains enabled. Never set `TEST_DATABASE_URL` to the application database. Servers need not run during these commands. Do not continue to application migration after a failed test.

3. After that passes, migrate the application database:

   ```bash
   cd ~/Downloads/brightway/backend
   npx prisma migrate deploy && npx prisma generate
   ```

   Confirm the new migration applied. Client generation alone does not apply it.

4. Check the copied checkout, then start servers in separate terminals:

   ```bash
   cd ~/Downloads/brightway
   npm run test --workspace backend
   npm run test --workspace frontend
   npm run lint --workspace frontend
   npm run build
   ```

   ```bash
   npm run dev --workspace backend
   ```

   ```bash
   npm run dev --workspace frontend
   ```

5. Use `/profile` as the verified applicant and `/admin/profile-photos` in a separate authorized MFA reviewer session. Follow the browser checklist in `SPRINT-1-ACCEPTANCE.md`. Existing profile-photo R2 credentials are reused; the separate identity bucket remains unchanged.

## GitHub checks

The included workflow runs on pushes and PRs to `main`, or manually through Actions once committed. It does not deploy. It validates on Node 22.23.3 and 24.22.1. Every job receives an ephemeral PostgreSQL 16 test database, never your Neon URLs or R2/email/Persona keys. The application URL placeholders name a separate, unused database so the test-destination guard still applies.

Regular backend tests deliberately run without a test URL and report database skips. The following dedicated database step applies every migration to the clean disposable database and runs all integration cases without those skips. Migration deployment is then repeated to check replay. Workflow shell pipelines use `pipefail`, so test failures cannot be hidden by log collection. Logs include the exact tested commit and Node version and are retained as Actions artifacts for 14 days. Actions results are not claimed until the workflow actually executes.

No dependencies or environment values were added to the application. This package contains full replacement files and SHA-256 manifest entries. Never copy `.env` into a commit. Review the actual changed paths before committing; there is no history rewrite, reset, force push or automatic GitHub write in this update.

## What remains open

The current workspace checks passed, but the new PostgreSQL case, application migration and real storage/browser acceptance still need execution. The authorized name-correction workflow is a separately identified Sprint 1 gap. Production cleanup scheduling remains deferred until hosted deployment. G1 remains 1 November; deployment remains paused until acceptance.
