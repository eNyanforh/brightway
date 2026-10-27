# Private staging preparation

**Parked by owner decision: deployment, including private staging, stays paused until after Sprint 2 acceptance.** Keep this package for later review; do not provision resources or run host deployment commands during the pause.

This is a reviewed configuration package, not a deployed environment. No host, DNS record, paid service, staging database, bucket, scheduler or alert destination has been provisioned. The owner reported the final retention check PASS on 26 October; see SPRINT-1-ACCEPTANCE.md. Public launch remains targeted for 26 January 2027, subject to the agreed production gates.

## Architecture and access boundary

The provider-neutral Compose package builds the React app and API from one reviewed revision. Nginx serves the production frontend and proxies `/api/` to the internal Express container. A separate Linux Node worker runs identity/name/evidence cleanup every 15 minutes. The API has no published host port. The only published HTTPS port binds **127.0.0.1:8443**, so default host networking does not expose it publicly. This is a network boundary; `noindex` is not access control.

On a remote Linux host, keep this binding and use an SSH port forward or a private VPN. For example, `ssh -L 8443:127.0.0.1:8443 <operator>@<private-host>` lets an authorized operator use `https://localhost:8443`. Configure CLIENT_URL to the exact browser HTTPS origin. Do not open a public listener or replace it with `0.0.0.0` as a shortcut. A shared public staging URL needs an authenticated access gateway and a reviewed TLS/proxy configuration first.

There is one API replica in this package. Existing in-memory request limits and shared-proxy client-address behavior have not been approved for horizontally scaled/public production. Do not expose a direct API port or blindly enable trust-proxy. TLS terminates in the web container; the browser's same-origin API calls retain Secure host-only production cookies and trusted Origin checks.

## Prepare isolated resources before starting

1. Select the hosting environment. No provider purchase or deployment is authorized by this file.
2. Create a dedicated **staging** database/branch. Do not point staging to the development database, integration-test database or eventual live database. Start with synthetic/consenting test accounts; do not copy real identity documents or production data.
3. Create private staging photo and identity buckets and a token limited to those buckets. Keep identity separate from photos; disable public bucket access. Existing development credentials can stay untouched.
4. Configure a verified staging email sender and test recipients. Preserve each environment's MFA encryption key across deploys; never rotate an existing enrolled account's key casually. With fresh staging accounts use separate stage secrets. Persona stays paused and its credentials must be absent.
5. Provide a trusted TLS certificate/key matching the browser host. The non-root Nginx container must be able to read the mounted files. Protect the parent directory on the host and set file ownership/modes appropriately for its nginx UID; do not commit certificates or keys. CI generates its own ephemeral certificate and disables verification only within CI. Operators should install/trust their private CA or use a trusted certificate, not disable browser verification.

Copy `deploy/staging/.env.example` to the ignored `.env.staging` alongside it. Fill private values only on the host, restrict file access and avoid command output containing them. `STAGING_DATABASE_ACK` is an operator acknowledgement, not automatic proof of database isolation: verify the actual endpoint/database separately. Set private stage buckets/sender before running cleanup. Do not run `docker compose config` into public logs: it can expand secrets.

Export the immutable reviewed source SHA as `BRIGHTWAY_REVISION`, and absolute existing certificate paths as `STAGING_TLS_CERT` and `STAGING_TLS_KEY`. These are Compose interpolation values; service secrets come from `.env.staging`. Pull/build the exact reviewed commit rather than a moving unrecorded working tree.

## Host commands after resource approval

From the repository root, with Docker Engine/Compose installed on the selected Linux host:

```bash
docker compose -f deploy/staging/compose.yaml build api web
docker compose -f deploy/staging/compose.yaml run --rm --no-deps api node backend/scripts/check-staging-env.js
```

Preflight checks HTTPS/origin, production cookie mode, secret shapes, direct migration/lock connection, separate identity bucket, 30-day retention, holiday dates and paused Persona. It prints only missing/invalid setting names. It does not prove credentials work, buckets are private, email is delivered or the chosen endpoint is isolated.

Before the **first** staging migration, record the reviewed SHA and take an isolated staging snapshot/backup. Check the migration target in the operator's private configuration. Apply migrations as a separate one-shot step, never on every app startup:

```bash
docker compose -f deploy/staging/compose.yaml run --rm --no-deps -w /app/backend api npx --no-install prisma migrate deploy
docker compose -f deploy/staging/compose.yaml up -d --wait api web cleanup
```

No destructive reset command is provided. The image already contains its generated client. Record database migration status and image IDs/digests. Node's version matches CI; the Nginx stable-channel build resolves a moving base, so pin the **tested digest** and retain the built application images before promotion/reproducible recovery. Staging image dependencies include Prisma CLI intentionally for the explicit migration step; this is not a final hardened production-image certificate.

## Cleanup and monitoring

The Linux worker reuses the existing review/name/evidence services. It uses a dedicated DIRECT_URL PostgreSQL session advisory lock, not a lock held in a transaction across R2 work. A competing worker skips; unsuccessful runs do not impersonate a successful heartbeat. Existing per-row CAS and deletion grace/retry still apply. Keep DIRECT_URL unpooled; session advisory locks must not be used through a transaction pooler.

Structured stdout reports stage-neutral counts/status without names, documents, connection strings or credentials. `/state/identity-cleanup.json` persists the latest result in a Docker volume. Its health check fails on unsuccessful status or no successful heartbeat within 35 minutes. Polling begins immediately, then every 15 minutes. The container continues retrying after failures; graceful shutdown finishes its current pass. Do not use an external force kill as a normal stop procedure.

Docker health status is **not an alert delivery system** and unhealthy status alone does not restart a container. Before calling hosted cleanup operational, configure the selected host's monitor to alert the operator on:

- web/API health failure or repeated restart;
- database readiness failure (`/api/v1/health/database`) independently of process liveness;
- unhealthy cleanup, `failed`/`retry_pending`, stale heartbeat or missing worker;
- private review queue past its target and persistent deletion backlog;
- expiring TLS certificate, storage/email failures and backup/restore failure.

No alert is sent by this package. Connect a real destination and trigger a controlled alert/recovery drill before accepting monitoring. A current heartbeat only proves the cleanup pass completed, not that every queue is empty: services process bounded batches and existing younger-than-grace entries are intentionally deferred.

## Staging acceptance before further exposure

- Prove the host port is not publicly reachable; establish authorized private access and trusted TLS.
- Check frontend, direct SPA links, API process health and database readiness separately. Never accept only the liveness response as database proof.
- Register/verify email, log in/out, reset password and prove old password/session rejection plus MFA after reset. Inspect Secure/HttpOnly/host-only cookies and trusted Origin denial.
- Repeat one consenting applicant/reviewer identity/photo/name journey; confirm private images, role/MFA revocation and correct badges on this deployed revision. Preserve local acceptance rather than treating it as proof of deployed routing/secrets.
- Confirm actual stage-bucket privacy, cleanup heartbeat, due synthetic cleanup and a delivered failure/recovery alert. The retention probe uses TEST_DATABASE_URL: do not relabel the stage application database as TEST just to run it.
- Demonstrate restoration into a **different isolated destination**, then verify migrated schema and a synthetic critical journey. Record application image rollback and database forward-repair steps; rolling back code does not reverse a migration.

Record SHA/image digest, environment, UTC date, migration IDs, observed results and defects without private data. Until these are recorded, private staging is prepared, not accepted or production-ready. The public deployment/announcement pause remains in force.

## Validation scope

The new unit checks validate fail-closed environment checks, dedicated lock acquisition/release/skip/failure paths and composition with existing retention behavior. A separate GitHub workflow builds both container targets and probes local HTTPS/SPA/API routing with synthetic configuration, without starting cleanup or calling cloud databases/email/storage. Its actual result must be checked for the implementing commit. CI does not provision hosting or prove a deployed environment, certificate trust, external alert delivery, restore or live payment readiness.
