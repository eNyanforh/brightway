# BrightWay backend

## Local setup

From the repository root, install dependencies with `npm ci`. Configure
`backend/.env` using `.env.example`, then run:

```sh
npm exec --workspace backend -- prisma generate
npm exec --workspace backend -- prisma migrate status
npm run dev:backend
```

Apply pending development migrations deliberately with `prisma migrate dev`.
Generating the client does not apply migrations.

## Account registration

`POST /api/v1/auth/register` accepts JSON:

```json
{
  "firstName": "Emmanuel",
  "lastName": "Nyanforh",
  "username": "enyanforh",
  "email": "emmanuel@example.com",
  "password": "Replace this with your own passphrase"
}
```

`middleName` is optional. Names are trimmed and limited to 100 characters.
Usernames are normalized to lowercase and accept 3–30 ASCII letters, digits,
or underscores. Emails are trimmed and normalized to lowercase. Passwords
are 15–128 characters and are preserved without trimming or truncation.
Unknown properties are rejected, including client-supplied roles and status.
Profile completion (birth date and phone) is a subsequent step.

Responses:

- `201`: account created; `data.account` contains the public account and person.
- `400`: invalid input; `errors` contains field names and messages, not submitted values.
- `409`: a username or email conflicts with an existing account.
- `429`: registration attempt limit reached.
- `503`: password hashing capacity is busy; retry later.

Passwords use Node's asynchronous scrypt with random 16-byte salts and
`N=131072, r=8, p=1`, following the
[OWASP scrypt guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt).
The encoded hash contains the algorithm, parameters, salt, and derived key.
At most two hashes run concurrently per process to bound memory consumption.
The database nested write creates Person and Account atomically, and the
response uses an explicit selection that excludes credentials.

Registration creates an account only: it does not establish a session, verify
email, grant organization membership, or change frontend route access.
The existing schema's default status is ACTIVE; `emailVerifiedAt` remains null.
Verified-email requirements must be enforced when implementing authorization.

The initial attempt limit is 10 per IP per hour using a process-local store.
Before multi-instance hosting, configure a shared store and the actual trusted
proxy topology; do not blindly enable trust for forwarded IP headers.

## Checks

From the repository root:

```sh
npm test
npm run build
npm run lint --workspace frontend
```

The backend build checks JavaScript syntax; the frontend build bundles Vite.
Prisma generation is a separate setup/deployment step.

Database tests skip unless `TEST_DATABASE_URL` points to a **separate** database
with the existing migrations applied. They create unique test records, check
username/email constraints and rollback, and remove their records afterward.
Never use the production database for these tests.

Login, sessions, email verification, frontend forms, and membership permissions
will be implemented in subsequent steps.
