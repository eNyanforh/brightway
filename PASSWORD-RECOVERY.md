# BrightWay Sprint 1 — password recovery

This is a Sprint 1 update for the existing BrightWay project. It uses the working registration/profile/authentication and initial credential-review baseline. It does not include the held organization-routing package, organization accounts, context switching, Super Admin dashboard, Persona integration or 2FA. Sprint 1 remains unfinished.

The ZIP includes the earlier Sprint 1 credential-review source files together with the recovery files, so related route and schema replacements stay consistent. Preserve other project files and all previously applied migrations. Do not apply this package over an already migrated organization-routing version; reconcile that version first rather than removing its database tables.

## Installation

1. Make a local checkpoint of your current working project. Extract the ZIP into your existing BrightWay root, replacing matching files. Do not replace backend/.env.
2. Keep the existing EMAIL_VERIFICATION_SECRET, RESEND_API_KEY and EMAIL_FROM in backend/.env. Recovery reuses this server configuration with a separate HMAC purpose and separate email template/idempotency keys. The secret must be at least 32 characters. No new credentials or dependencies are required for recovery. The included earlier credential workspace uses pdf-lib, already declared in backend/package.json.
3. Stop the backend. From the project root:

```bash
npm install
cd backend
npx prisma validate
npx prisma migrate deploy
npx prisma generate
cd ..
```

The new recovery migration is 20261019120000_add_password_recovery. Keep 20261018223000_add_credential_reviews and every earlier migration. Never use migrate reset against your working database. No remote migration, live email, GitHub push, role grant or deployment was performed while preparing these files.

4. Run checks:

```bash
npm test
npm run test --workspace frontend -- --pool=threads --maxWorkers=1 --testTimeout=15000
npm run lint --workspace frontend
npm run build
npm run test:database --workspace backend -- --migrate
```

The last command requires the separate direct TEST_DATABASE_URL already configured in backend/.env. It must not point to your development/application database.

5. Start backend and frontend in separate terminals:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

## Behavior

- Login has a Forgot password? link to /forgot-password.
- Enter the account email. The acknowledgement is identical for unknown emails, suspended/deactivated accounts and throttled recipients.
- Email delivery runs after the acknowledgement so provider latency and delivery failures do not disclose account existence. Only an ACTIVE existing account receives a code. Email lookup follows the existing lowercase/trim normalization.
- The six-digit cryptographically generated reset code is valid for ten minutes, with five confirmation attempts. Invalid-attempt counts commit even when validation fails.
- Request limits persist in PostgreSQL: one issue per email per minute and at most five per one-hour window. Request and confirm endpoints also share a 30-request/15-minute per-process IP limit. This is not a distributed IP limiter; a deployed multi-instance setup should enforce shared ingress limits.
- Resending replaces the prior challenge, including after exhausted guesses. An old delivery cannot enable a new challenge. Throttled requests return the same acknowledgement without sending another message.
- Enter the code and a new password twice. The server accepts only email, code and password. Confirmation is client-only. Password rules match registration: 15–128 characters, preserving whitespace and case. Passwords/codes are not stored in browser persistence or URLs.
- HMACs bind each reset proof to its purpose, email and random challenge nonce. Stored challenge rows contain no plaintext code or email address. They do contain an internal account reference and fingerprint of the password hash at issuance. Reset codes cannot substitute for signup/email-verification proofs.
- The existing bounded scrypt password hashing runs outside the reset transaction. Final consumption rechecks expiry, account state, unchanged credentials and the challenge nonce. Password change, proof consumption, session revocation and recovery audit commit together.
- Every existing session for that account is deleted after reset. A login that verified the old password cannot create a new session after the password change because the existing login transaction rechecks the password hash under the account lock.
- A successful reset clears the browser session cookie and requires a fresh login; it does not automatically sign in. A best-effort confirmation email contains neither the password nor the code.
- Legacy accounts can recover through their mailbox even when emailVerifiedAt is still empty. Recovery deliberately does not set that flag or grant individual/credential verification. They still follow the existing email-verification requirement for profile completion.
- Temporary mail failure leaves the challenge unusable. The response does not reveal delivery success. The user can resend after the cooldown. Delivery and completion notifications are best effort in the current long-running Node backend, not a durable queue: a process restart can interrupt them. A failed notification cannot undo a completed password reset.
- This resets the password only. It is not MFA recovery, identity verification or a support process for someone who has lost access to their mailbox. Those remain separate Sprint 1 work.

## Maintenance

From backend, run as needed:

```bash
node scripts/cleanup-password-recovery.js
```

It deletes expired challenge rows whose last request was more than 24 hours ago. It retains PasswordRecoveryAudit. Configure scheduling when deployment operations are addressed; this package does not deploy or schedule jobs.

## Browser acceptance

1. On Login, select Forgot password? Enter an existing account email you can receive mail at. Your provider's existing sender/recipient restrictions still apply.
2. Enter a wrong code and confirm the password is not changed. Enter the received code with matching new passwords and confirm success.
3. Log in with the new password. The old password and prior sessions on other devices must fail. Reset should not grant Verified status.
4. Attempt to reuse the code; it must fail. Request another code after the cooldown; the previous code must fail.
5. Try an unknown email: the acknowledgement should have the same wording and no account details. There should be no account creation.
6. Check failure messages and input preservation with an invalid/expired code and a temporary unavailable API. Change email and confirm previous password/code inputs are cleared.
7. Check keyboard navigation, input labels, focus after each step and a narrow mobile screen.
8. Run the separate database suite. The new integration test checks concurrent reset consumption and the old-password login race using real PostgreSQL transactions.

## Validation performed

- Backend: 114 passed, 0 failed, 10 database tests skipped without TEST_DATABASE_URL.
- Frontend: 94 passed across 10 test files, including four recovery interaction tests.
- Frontend lint, production build, backend syntax checks and Prisma schema validation passed.
- Recovery unit/HTTP cases cover input allowlists, private response/cookie behavior, expiry, replay, quotas across service recreation, invalid-attempt persistence, atomic rollback, concurrent confirmations, delayed delivery, failed notifications and legacy accounts.
- The PostgreSQL migration/integration suite, actual Resend delivery and real desktop/mobile browser acceptance were not run here. Automated fixture tests do not replace those checks.

Reference used for recovery design: OWASP Forgot Password Cheat Sheet, https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html (consulted 19 October 2026).
