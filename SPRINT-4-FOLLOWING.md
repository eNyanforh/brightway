# Sprint 4 — following people and organizations

Deployment, including private staging, remains paused by Emmanuel's decision.
This continues the merged connection/blocking slice in SPRINT-4-NETWORK.md.
It adds following; it does not certify whole-sprint or production acceptance.
The agreed full 14-sprint release target remains 26 January 2027, subject to gates.

## Behavior

A personal BrightWay account can follow/unfollow an active individual or an active,
approved organization by explicit target type and exact username. No acceptance
is needed for a follow. Following does not create a connection, grant contact
access, create organization membership or confer reviewer, Campus or billing
permissions. Accepting/removing a connection does not automatically change follows.
Organizations do not impersonate individuals or acquire an acting organization
social identity through this slice. Management-only sessions cannot use these APIs.

The Network page includes Following and Followers. Following includes the caller's
people and organizations; Followers lists only the individuals who follow the
caller. Lists are owner-only, paginated and omit private contacts/account IDs.
This slice creates no public follower graph, public counts, email notification or
profile-view tracking. A viewer selects People or Organizations explicitly when
looking up a username, and organization profiles open in a separate tab so unsaved
personal drafts remain in the existing application.

Personal blocking atomically ends both directional follows as well as the existing
connection/request. Follow records remain with incremented versions; unblocking
restores neither follows nor connections. A new explicit follow is needed.
Blocked relationships are also filtered on reads. Existing consenting follows to
suspended accounts/organizations remain visible to their follower as unavailable
so they can unfollow; unavailable targets cannot receive new follows. This does
not bypass workspace suspension or approval. All eligibility must still be checked
when future feed/content modules read follows.

## Integrity, privacy and abuse controls

The additive migration `20261105090000_add_network_following` adds NetworkFollow
and NetworkFollowEvent. There is one row for each follower/target pair, with real
account/organization foreign keys and SQL constraints for exactly one target,
no personal self-follow, and nonnegative versions. No old connection becomes a
follow during migration. No historical approval or membership is rewritten.

Commands require trusted Origin, current personal session, expected follow version,
actor-scoped request key and an identity reference from the target lookup. That
reference is a digest, not a secret or authorization token: it binds the selection
to the resolved ID and kind so a renamed/reused username cannot redirect a stale
write. The server still checks every current identity, block and target status.

Personal follow/block operations share sorted Account locks; organization follows
also lock the target organization after the follower. State and explicit follow
audit commit together, and block retirement commits with the existing NetworkEvent
BLOCK audit. Any audit failure rolls the complete operation back. An identical
request replay returns only its receipt; it never reactivates a follow that a later
block/unfollow retired. Reused keys with different bodies fail. Versions survive
unfollow/block to prevent stale refollows.

Initial persisted limits are 100 FOLLOW actions per rolling 24 hours and 500 follow
mutations per rolling hour before another FOLLOW is allowed. UNFOLLOW remains
available after these budgets are exhausted; HTTP burst protection still applies.
The per-actor locks serialize concurrent last-slot requests. These are abuse-control
defaults, not fees or trust requirements.

Reads acquire no row locks or interactive transactions. Following/Followers use
one bounded list statement plus two live session/MFA-version checks. Cursors are
actor/view scoped and never authorize data. Browser in-flight sharing, no completed
Network/contact cache, stable safe content, authoritative denial handling, stale
write errors and account-change clearing carry forward from the previous slice.

## Local update after merge

Preserve local changes and private `.env`/MFA keys. Stop development processes
before `npm ci` on Windows. From repository root:

```bash
git status
git pull --ff-only origin main
npm ci
npm run test:database --workspace backend -- --migrate
```

The guarded database command needs the existing isolated direct TEST_DATABASE_URL;
it does not need application servers and must never target the application DB.
After isolated checks pass, stop the local backend and migrate the intended
application **development** database:

```bash
cd backend
npx --no-install prisma validate
npx --no-install prisma migrate deploy
npx --no-install prisma generate
cd ..
```

Restart backend and frontend in separate terminals with `npm run dev:backend` and
`npm run dev:frontend`. No new package, secret, paid service or deployment is needed.
Do not reset migration history. Roll back application images only with compatible
schema; preserve follow/audit history and use a reviewed forward repair if needed.

## Actual application acceptance still required

Use consenting synthetic individuals A/B/C and an approved test organization.
Record date, SHA, migrations and expected/observed outcome without contacts/secrets.

1. A follows B. A sees B in Following; B sees A in Followers; C sees neither private
   list. No connection/request or connections-only contact access appears. Test
   unfollow separately while a connection exists: the connection stays intact.
2. Choose Organizations, find the approved organization, follow it and open its
   public profile. No staff, reviewer or Campus access is granted. Suspend it in
   the authorized management workflow: new follows fail; A can still unfollow.
3. Follow both directions between A and B. Block as either person, verify both
   directions retire and future reads/contacts stay protected. Unblock: no follow
   returns. Two-tab stale or duplicate requests cannot restore old state. A stale
   username reference after organization rename/reuse fails rather than following
   a different organization.
4. Check desktop/mobile and keyboard paths, failures and delayed focus reads,
   account switching/logout during reads, revoked sessions and wrong-realm cookies.
   Mutations require explicit reload after uncertain failures. Preserve existing
   individual, management, organization and issuer-review acceptance evidence.

SQL tests use disposable PostgreSQL; browser responses are intercepted synthetic
fixtures. Neither establishes real email/storage/provider or application-database
acceptance. No real accounts, grants, documents or application data are accessed
by development verification. Profile-view notifications/privacy consent and the
notification surface remain the next separate slice; no viewing telemetry or
notification policy is silently introduced here.
