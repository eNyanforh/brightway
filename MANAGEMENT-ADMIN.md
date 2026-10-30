# BrightWay Management: /superadmin

BrightWay Management is part of BrightWay. `/superadmin` is its canonical entrance; signed-out users go to `/superadmin/login`. `/management` redirects to it. The dedicated dark control-room UI shares the existing password, recovery, HttpOnly session-cookie and MFA backend. There is no public administrator signup and no web endpoint for granting staff permissions.

## Apply the code and development schema

From the repository root:

```bash
git pull --ff-only origin main
cd backend
npx --no-install prisma validate
npx --no-install prisma migrate deploy
npx --no-install prisma generate
cd ..
```

Restart the backend and frontend in separate terminals. This applies the configured development database schema; hosting deployment remains paused.

The additive `20261030200000_superadmin_terminal_control` migration distinguishes Super Admins from management staff and attributes terminal actions. Existing enabled management memberships were previously granted only by the trusted server operator and remain Super Admins. Disabled memberships are not reactivated. Existing audit history is retained. Existing reviewer/Agent/Approver permissions are not converted to Super Admin authority.

## Prepare named accounts

Use existing named BrightWay accounts, or prepare them through normal email-verified registration first. Enable authenticator MFA in Account security and save backup codes privately. The terminal commands **provision staff roles on those accounts**; they do not create passwords, mark an email verified or bypass signup/MFA. A completed public profile or identity badge is not a staff prerequisite.

Never use a shared admin password. The target account must be active, email verified and MFA enrolled. A fresh MFA sign-in after a permission change is required before management access.

## First Super Admin: trusted terminal bootstrap

Only if no Super Admin has ever been established, run from the repository root:

```bash
node backend/scripts/superadmin.js bootstrap founder_username --reason "Establish the founding BrightWay Super Admin."
```

Replace `founder_username` with the actual named account. The terminal privately prompts for **that account's password and fresh authenticator/unused backup code**. Nothing is echoed or accepted through password/code command arguments or environment variables. Use an interactive terminal; if a Git Bash session does not provide a TTY, run the command in Windows Terminal/PowerShell instead.

The command binds the bootstrap to the authenticated account. A global transaction-level advisory lock prevents two concurrent first-root commands from winning. A historical successful Super Admin audit permanently closes bootstrap, including after later suspension/revocation. Retrying `bootstrap` after success is refused; subsequent operations must be authenticated as an existing Super Admin.

If you already activated a management administrator before this update, the migration preserves that trusted grant as Super Admin. Use `staff` with `--by` below; do not bootstrap again.

## All later staff permissions: authenticated Super Admin terminal

Example Agent:

```bash
node backend/scripts/superadmin.js staff agent_username organization-agent grant --by founder_username --reason "Assign organization investigations to this staff member."
```

The terminal prompts for the password and fresh MFA code of **the Super Admin named in `--by`**, not the target Agent's credentials. The target must already satisfy the account prerequisites. Merely naming a Super Admin in the arguments grants no authority.

Supported capabilities:

| Capability | What it grants |
| --- | --- |
| `superadmin` | Authority to provision staff through this terminal command; management hub access. No automatic reviewer/approver power. |
| `credential-reviewer` | Existing BrightWay review capability for claims from unlisted issuers. |
| `identity-reviewer` | Existing identity, protected photo and name-correction review capability. |
| `organization-agent` | Organization investigation capability. It does not grant approval authority. |
| `organization-approver` | Existing assignment/approval capability; investigation/approval separation remains enforced. |

Use the same command with `revoke` to remove a specific capability. Existing unrelated capabilities remain intact. Grants also establish a non-Super-Admin management membership for staff. Revoking the final assigned capability removes that staff member's portal access; a Super Admin retains the hub without acquiring review powers.

Establish a separately secured backup Super Admin through the same authenticated operation:

```bash
node backend/scripts/superadmin.js staff backup_username superadmin grant --by founder_username --reason "Establish a separately secured recovery administrator."
```

The command refuses to revoke the last **eligible Super Admin**. Ordinary management staff, suspended/unverified accounts and accounts without MFA do not count. Role changes are serialized and account locks use a consistent order. Password/MFA/session state and current Super Admin authority are rechecked inside the permission transaction. MFA proof must be no older than five minutes and must postdate the actor's management grant. Target permission changes and attributable management/domain audit writes commit together; audit failures roll everything back. Repeating an already applied grant is idempotent.

Each command signs in afresh, using the existing MFA replay protection, attempt budget and single-use backup codes. Wait for a new authenticator code if the current one was just used. CLI-created sessions expire within five minutes and are deleted on normal completion/failure; pending challenges are cancelled. No bearer token is printed or stored in a file.

The older `set-management-admin.js`, `set-credential-reviewer.js`, `set-identity-reviewer.js` and `set-organization-operator.js` grant entry points are retired and fail closed without database writes. Use `superadmin.js`.

## Open the management workspace

Sign out, then sign in at `http://localhost:5173/superadmin` using password and fresh MFA. The avatar's BrightWay Management entry also opens it. An ordinary account or an old/pre-grant MFA session is denied. Already signed-in users can explicitly continue from the management login; server permission checks still run.

Nested authorized routes keep the dark shell: `/superadmin/credentials`, `/superadmin/identity`, `/superadmin/photos`, `/superadmin/names` and `/superadmin/organizations`. The hub/sidebar shows only assigned operational links; a direct unassigned child route is denied before its review component mounts. The domain APIs independently enforce their current permissions, MFA, owner/issuer scope and no-self-review rules. A Super Admin cannot approve their own claim or bypass the Agent/Approver separation.

The dark styling is scoped to management. Public and organization workspaces retain their existing theme. Team access administration in the browser, Support, Billing and Moderation remain planned; their roles/actions are not invented or granted by this update. Staff provisioning remains terminal-only.

## Operational boundary and acceptance

A person with unrestricted application-database/server access remains a trusted infrastructure operator and can modify database data outside the application. CLI checks do not replace server access controls, protected secrets, backups and hosting audit logs. Bootstrap is not an emergency MFA bypass. Keep the backup administrator, encryption keys and private recovery codes safe. MFA disablement/suspension can make a root unusable independently of role revocation; loss of every eligible root requires a documented owner-controlled recovery, not reopening public bootstrap.

Run the normal frontend/backend tests, lint/build and isolated PostgreSQL suite:

```bash
npm run test --workspace backend
npm run test --workspace frontend
npm run lint --workspace frontend
npm run build
npm run test:database --workspace backend -- --migrate
```

Record real application acceptance separately: correct migration applied; initial bootstrap (or preserved grant) opens management only after fresh MFA; password/code input is hidden; ordinary user denied; an Agent gets only investigation tools; the Agent cannot run staff grants; authenticated Super Admin delegation records its actor; old sessions/revoked permissions are refused; final-root revocation is blocked; logout returns to management login. Synthetic browser fixtures and CI test accounts are not evidence that an application account has been promoted or that hosting has been deployed.
