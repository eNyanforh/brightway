# Sprint 4 — personal connection foundation

Deployment is paused again by Emmanuel's decision on 4 November 2026, including
private staging. AWS provisioning, paid infrastructure, application database
access and cloud deployment are outside this development change. The complete
14-sprint release target remains 26 January 2027, subject to the agreed gates.
Existing BrightWay Management and organization workspaces are carried forward.
This slice does not certify Sprint 2/3 acceptance or all of Sprint 4 complete.

## Delivered behavior

`/network` now supports exact-username lookup, Connections, Received, Sent and
Blocked views. A signed-in individual can request a connection; only its recipient
can accept/decline, and only its sender can cancel it. Either connected person can
remove it. Crossing requests do not silently accept each other. Accepted
connections never create organization membership, reviewer authority or any trust
badge. A management identity/session cannot operate this personal API.

Blocking removes the request/connection in both directions and withholds public
and connections-only contact fields from the other signed-in account. The blocker
can unblock their own side; that never restores prior consent. Another person's
block remains independent. No notification announcing a block is created.
Anonymous readers cannot be recognized as a blocked person: fields deliberately
marked Public remain public to them. Blocking is an account interaction boundary,
not a mechanism for making public information secret.

Contact visibility now uses one database snapshot joining the owner, an active
viewer, the current exact accepted pair and each field's saved privacy choice.
Pending requests, organization memberships and client-supplied `connected` flags
never grant contact access. Only-me remains owner-only. Removing/blocking or
suspending the owner withdraws the applicable access on subsequent reads.
Neither network nor contact responses are reused as completed browser-cache
snapshots; concurrent network reads may share in-flight work only. Contacts are
cleared during revalidation and before mutations. Old account/query/contact
responses cannot overwrite a newer selection. Temporary background failures keep
safe names/status content visible but disable writes; confirmed session denial
clears private content. Uncertain writes require explicit saved-state reload and
are not automatically retried.

## Integrity and abuse controls

The additive `20261104220000_add_personal_network` migration creates one canonical
ordered pair per two accounts and a transactional event/idempotency record. SQL
constraints prohibit self-pairs, nonmember requesters, pending requests without a
sender, and connections that remain active despite a block. Existing accounts,
profiles, organization memberships, approvals and historical review actors are
unchanged. Empty relationship rows retain monotonic versions to prevent stale
requests from restoring an old state.

Mutations require a current personal session and trusted Origin, reject unknown
input and serialize through sorted Account row locks. Authorization is rechecked
inside the transaction. The pair and audit event commit together; an audit failure
rolls both back. Body-bound actor-scoped request keys return receipts on an exact
retry and reject a different body. A receipt never contains or restores old contact
visibility. Reads use no row locks or interactive transactions. The directory
returns only names, usernames and the caller's relationship, not account IDs,
private profiles, passwords or email/contact fields.

Initial anti-spam defaults: 30 new connection requests per account per rolling
24 hours, a 24-hour cooldown before requesting the same person again, and 200
network mutations per account per rolling hour. Budgets persist across sessions
and service restarts and serialize with the actor. A separate HTTP limiter limits
bursts. Pagination is keyset-based, bound to the current actor/view and always
applies the server's relationship scope; a cursor is not authorization. These
limits may be adjusted after measured usage without changing consent semantics.

## Safe local update after merge

Preserve local edits and private `.env`/encryption keys. Stop Vite/backend/test
processes before `npm ci` on Windows. From the repository root:

```bash
git status
git pull --ff-only origin main
npm ci
npm run test:database --workspace backend -- --migrate
```

That guarded command targets only the explicitly separate test database. App
servers are not needed. After isolated checks pass, stop the local backend and
apply migrations to the intended application **development** database:

```bash
cd backend
npx --no-install prisma validate
npx --no-install prisma migrate deploy
npx --no-install prisma generate
cd ..
npm run dev:backend
```

Start `npm run dev:frontend` in another terminal. No new secret or paid service is
needed. Do not reset migration history. Development migration is distinct from
cloud deployment, which remains paused.

## Acceptance to record

Use three consenting synthetic test individuals. Record SHA, migration, date and
expected/observed results without publishing contact data, cookies or secrets.

1. A finds B and requests a connection. A sees Sent; B sees Received. C sees
   neither. A cannot accept their own request. B explicitly accepts; both then see
   Connections. Test decline, sender cancellation and removal separately.
2. B chooses Phone = Connections, Email = Public, WhatsApp = Only me. A receives
   the phone only after acceptance; C and anonymous readers do not. B still sees
   all their own saved fields. Removal withdraws the phone; blocking withholds all
   B's fields from A's authenticated reads. Public fields remain public anonymously.
3. Block/confirm, then unblock: the connection must stay removed. With two stale
   tabs, accept/block or remove/accept cannot resurrect stale consent. Rapid
   duplicate submissions produce one event/effect. Unknown/foreign actors,
   malformed queries, expired/revoked sessions and wrong-realm cookies fail.
4. Navigate/focus at desktop/mobile widths; safe list content remains during a
   delayed read, no avoidable duplicate read burst occurs, and error/denial states
   disable writes. Sign out/switch individuals while reads are pending; previous
   contacts and names must not cross the identity boundary. Verify keyboard/modal
   behavior and existing signup/profile/organization/management regressions.

Automated service/HTTP tests, disposable PostgreSQL transactions and intercepted
browser fixtures are distinct evidence. No actual application DB, cloud storage,
email or deployment acceptance is asserted by this implementation.

## Remaining plan

Following people and organizations is implemented in the subsequent slice
documented in SPRINT-4-FOLLOWING.md; its real acceptance remains separate.
Profile-view notification privacy/consent and the notification delivery surface
remain later slices. This
change introduces neither fake notification counters nor a public profile-view
tracking policy. Preserve issuer-review/revocation acceptance work still pending
under SPRINT-3-ISSUER-REVIEWS.md; earlier owner-reported passes are not restarted.
Content/feed/Explore/search and downstream Opportunity/Campus/payment modules keep
their existing dependencies and gates. Exceptional credential issuer rerouting
remains separately authorized support work, not a management override here.
