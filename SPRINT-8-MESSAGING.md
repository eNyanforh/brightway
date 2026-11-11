# Sprint 8 — Messaging, Presence and Notifications

## Delivered behavior

- `/messages` opens the personal inbox. Network → connected person → Message pre-fills a new conversation. Both directions use one conversation.
- Only an accepted individual connection permits new direct messages. Following alone does not. Removing a connection disables new sends and typing; either-direction blocking hides the thread, files, presence, and actor notifications immediately. Old history remains readable after connection removal until blocked.
- Text, up to four images/PDF documents, and validated BrightWay profile/post/organization/opportunity/program references are supported. Shared references are rechecked for the recipient and when viewed; unpublished, withdrawn, suspended, or blocked content is unavailable.
- Messages start **Sent** after database commit. The recipient acknowledges **Delivered** after receiving the thread payload. **Read** additionally requires a visible, focused conversation. A sequence boundary excludes racing unseen messages. Receipts only advance; retries preserve the original client request key and cannot duplicate a message.
- Active now/Last active are off initially and controlled in the inbox. Typing has its own preference. Presence expires after 45 seconds without a visible-tab heartbeat. Typing uses replaceable six-second leases, with no text or permanent typing history.
- `/superadmin/official-messages` is available to active `support-agent` staff and Super Admins with a current separate management MFA session. Recipient search returns names/usernames only. Recipients see **BrightWay**, while each official send atomically records the actual management actor, message ID, reason and request key in `ManagementAction`. Management cannot open personal direct conversations.
- Organizations have an **Official inbox** at `/organization-workspace/:id/messages`. Only the current enabled primary administrator with verified email and organization MFA can read/reply. Organization staff cannot initiate unsolicited direct messages.
- Global notifications preserve exactly **All** and **Unread**. The earlier profile-view, opportunity-application and admission feeds are combined with connection, follow, public post interaction, verification, message and official-message notifications. Read/dismiss actions are owner-scoped, with deduplicated event keys. Organization profile views still produce no organization notification.

## Private attachments

Set `R2_MESSAGE_BUCKET` to a separate private R2 bucket, distinct from the photo, identity and application buckets. Reuse the existing server-side R2 credentials/jurisdiction as applicable. Grant the server access; do not enable public access or expose credentials in frontend variables.

Images are decoded/re-encoded as WebP. Documents are static readable PDFs; encrypted files, scripts, embedded files and forms are rejected by the existing isolated PDF validator. Each file is limited to 5 MiB; uploads are limited to six per minute, 50 files/50 MiB per account per 24 hours, and at most 12 current unused files per conversation. Downloads recheck current conversation authority after the storage read, use no-store/no-referrer/nosniff/sandbox headers, and expose no object keys or public object URLs. Draft files belong only to their uploader until attached to a sent message.

Removing a draft attachment makes it inaccessible first. A storage outage leaves a tombstone for retry. Run `node scripts/cleanup-message-files.js` from `backend` as regular server maintenance to purge discarded and unbound files older than 24 hours, in batches of 100. A file claimed by a sent message is excluded from cleanup. Failed deletes retain their tombstones for a later run.

## Realtime transport

Cookie-authenticated SSE uses `/api/v1/messaging/events`, or `/api/v1/management/official-messages/events` for staff. The database is authoritative across server instances; streams poll small change summaries every three seconds and recheck session, MFA, membership and block authority. Message bodies/files do not travel on the global channel. Clients recover saved state through normal authorized APIs after `sync`/reconnect. Presence and typing changes are separate from thread reloads. Four concurrent streams per identity per server are allowed, and each rotates after about 25 minutes. Configure the eventual reverse proxy to allow long-lived SSE responses and honor `X-Accel-Buffering: no`.

Named events: `message:new`, `message:delivered`, `message:read`, `conversation:read`, `presence:update`, `typing:start`, `typing:stop`, `notification:new`, `notification:read`. The transport also provides `sync` and `access:changed`. These are invalidation signals, not a replayable message history; reconnect always reloads current authorized state. Notifications synchronize on the background channel every 15 seconds. No Socket.IO/WebSocket service or process-local message cache is required.

## Database and rollout

Migration: `20261111150000_sprint8_messaging`. It adds conversations, immutable sent-message fields, a database sequence, scoped attachments, preferences, presence, expiring typing leases and generic platform notifications. Database checks enforce conversation shape, one sender realm, supported file size/type and receipt order. Existing content, authentication realms, review authority and Campus eligibility remain in their existing services.

When deployment resumes, apply migrations and regenerate Prisma using the established deployment process; configure the private message bucket and attachment maintenance before enabling file sharing. Production database/storage and reverse-proxy acceptance are separate from automated fixture tests. This sprint does not deploy the platform.

## Validation

- `npm run test --workspace backend`
- `npm run test --workspace frontend`
- `npm run lint --workspace frontend`
- `npm run build`
- `npm run test:database --workspace backend -- --migrate` against a separate test database
- `npm run test:browser --workspace frontend` for desktop/mobile browser acceptance

The messaging database suite covers follow-vs-connection, bilateral blocks, removed connections, retry idempotency, immutable message content, bounded read receipts, presence/typing privacy, file ownership and cross-conversation binding, published-reference validation, separate staff authority, organization revocation and atomic official audit rollback. The HTTP suite verifies origin enforcement, impersonation rejection, typed SSE updates and stream shutdown on authority loss. Frontend/browser tests cover failed-draft preservation, identical retry keys, visibility/focus receipts, notification tabs and official sender/reason UX.

## Local verification record — 11 November 2026

- Frontend regression: 379 passed across 38 files. The existing private-image cleanup test now waits for all three object URLs to be created and revoked, eliminating an observed assertion race.
- Backend regression: 417 passed, 48 database-only cases skipped in the ordinary unit command.
- Messaging HTTP/SSE checks: passed, including origin rejection and termination on authority loss.
- Separate migrated local database: nine focused integration cases passed across messaging, notifications, network, opportunities and admissions. All migrations applied from empty. File cleanup/budget and same-time sequence pagination are included in the messaging case.
- Full local database attempt: 44 of 49 cases passed using PGlite's socket emulation. Five existing migration/concurrency/registration cases failed or timed out. Three of those failures were reproduced on unchanged `main` code in the same emulator; this does not substitute for the real PostgreSQL CI job. No production database was used.
- Frontend production build and lint passed; four existing React-hook warnings remain outside this feature.
- Desktop/mobile Playwright cases are included. Local Chromium could not launch because its browser binary/socket requirements are unavailable in this execution environment. Browser and full PostgreSQL CI checks remain outstanding.
- Branch: `feature/sprint-8-messaging-presence`. Source is committed locally. The initial GitHub push was rejected by automatic approval review because publishing was not explicitly authorized. The user subsequently approved pushing the branch and opening a pull request. Deployment remains paused.
