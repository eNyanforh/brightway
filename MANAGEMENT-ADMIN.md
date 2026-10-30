# BrightWay management administrator

This update establishes named internal management access and a protected `/management` hub. Management uses an ordinary BrightWay login, verified email and authenticator MFA. Its dedicated database permission is independent of personal identity verification, organization membership and the existing credential/identity/Agent/Approver permissions.

The hub uses its own management sidebar and mobile navigation after server authorization. It shows your own access history and the implemented operational workspaces. A workspace opens only when that account separately holds its existing reviewer/operator permission. Team access management, Support, Billing and Moderation remain planned areas. Their browser administration is not implemented by this foundation. Existing no-self-review, issuer scope and investigation/approval separation stay enforced by the domain services.

## 1. Apply the update to the development application database

From the project root:

```bash
git pull --ff-only origin main
cd backend
npx --no-install prisma validate
npx --no-install prisma migrate deploy
npx --no-install prisma generate
cd ..
```

The additive migration is `20261030180000_add_management_administrators`. It creates management permission and audit tables; it does not grant access to any account. Migration deployment here applies schema to your configured development database; hosting deployment remains paused. Preserve the existing database, MFA encryption and provider configuration.

Restart the development servers in separate terminals:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

## 2. Prepare your named staff account

Use a dedicated named staff account with an email address you control. Register through the existing normal signup, verify the email, sign in and open Account security. Enable authenticator MFA and store its one-time backup codes privately. An existing named staff account that already meets these prerequisites can also be used.

Management does not require a completed public profile, verified education/experience or a blue identity badge. Those are separate product states. The CLI does not create a login, set a password, verify an email or enroll an authenticator.

## 3. Grant management access through the trusted server command

From the project root, replace `YOUR_USERNAME` with the account's actual username without @:

```bash
node backend/scripts/set-management-admin.js YOUR_USERNAME grant --reason "Establish founding BrightWay management administrator."
```

The CLI loads `backend/.env` independently of the working directory. It needs the existing application database credentials; the frontend/backend servers are not required for this command itself. Only trusted server operators with database access should run it. The reason must be a single line of 10–500 characters and should describe the operational change without passwords, codes or other secrets.

The account must be active, email verified and have MFA enabled. Grant/revoke operations serialize through a transaction-level advisory lock, lock affected accounts in sorted order, preserve other roles, use version checks and write an audit record in the same transaction. Audit failure rolls the permission change back. Repeating an already applied grant is idempotent and does not extend its grant time or create duplicate audit rows.

## 4. Sign in again and open management

Sign out, then sign in with the password and a fresh authenticator/backup code. A session whose MFA proof predates the management grant cannot open the hub. Then use the avatar menu → BrightWay Management or open `http://localhost:5173/management` directly.

The management entry is discovered only when the account menu is opened. Ordinary accounts receive no management entry. The page/API recheck the current account, enabled management permission, verified email, session expiry, current MFA factor version and proof timestamp. Revocation takes effect for the next management request even if a browser cookie remains. A read failure clears the page's private management context; late responses cannot cross account boundaries.

Review/operator permissions are assigned separately with the existing trusted commands when authorized. Their existing prerequisites, MFA requirements and audit rules still apply. Management permission alone does not open private submissions or provide review/approval powers.

## Revoke and recover

```bash
node backend/scripts/set-management-admin.js YOUR_USERNAME revoke --reason "Remove management access after staff responsibility change."
```

The command refuses to remove the last eligible management administrator. Establish another active, email-verified MFA account first. Disabled, unverified or non-MFA accounts do not count as eligible replacements. Concurrent revocations must leave an eligible administrator. Regranting later requires a new MFA sign-in after the new grant time.

This safeguard covers role changes through this command. Suspending an account, losing authentication factors or disabling MFA can independently make an administrator unable to act. Keep a separately secured backup administrator and protected backup codes. A trusted server operator can grant another properly verified, MFA-enrolled named account; management has no public bootstrap or password/MFA bypass. Server/hosting access logs should identify the human operator behind CLI actions; the application audit records the server operation, target, version and operational reason.

## Verification and production boundary

Run the normal checks and the isolated database command against a dedicated test database:

```bash
npm run test --workspace backend
npm run test --workspace frontend
npm run lint --workspace frontend
npm run build
npm run test:database --workspace backend -- --migrate
```

The new PostgreSQL suite checks concurrent first-grant retries, audit rollback, pre-grant session rejection, scoped context, last-eligible-admin protection, concurrent revocations and regrant session invalidation. No application account is created or promoted by CI. Unit/HTTP/frontend checks also cover role injection, strict CLI arguments, current MFA, own-account binding, private responses, denied access and late-response handling.

On your actual development application, record the exact commit and verify: an ordinary account cannot open management; your staff account must meet prerequisites; the grant is audited; the old session is refused; a new MFA sign-in opens management; unassigned review tools remain unavailable; separate grants enable only their intended domain capabilities; revoked/stale MFA or management access clears the hub. Use a second eligible administrator to test revocation. Browser fixtures and isolated SQL tests are separate from this real-account acceptance and from eventual production readiness.
