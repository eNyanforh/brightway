# BrightWay personal posts — immediate publishing with human Management moderation

## Publication policy (updated November 11, 2026)

- Identity-verified individual members can publish achievements, questions and events immediately. Existing legacy POST records remain supported. Organization posting permissions are unchanged.
- There is **no AI safety check, relevance classifier, OpenAI API request, or AI-based publication delay** in the member post creation or editing path.
- Keep existing server-side identity checks, post type and payload validation, topic requirements, 20 posts per 15-minute limit, idempotent retries, visibility and blocking rules, and private meeting-link protections.
- New posts are stored as `PUBLISHED` and appear in Explore, search and profiles without a staff approval step.
- Ordinary edits to published posts remain published. An edit to an older pending submission can publish it. A post removed by Management cannot be republished by an author edit: its revision is `PENDING` until a human approves it.
- Existing pending submissions remain pending until edited by the author or reviewed by Management. They are not bulk-published automatically.

## Human moderation after publication

BrightWay Management → Post review opens on **Published**, showing newest first. Authorized moderators can review any active post and remove it. They can inspect pending posts and removed posts, approve, decline or restore as appropriate. Existing user reports remain an escalation path.

All Management decisions require the existing `moderation-agent` capability, fresh MFA, a documented reason, current moderation revision and idempotency key. Decisions are atomically audited. Self-review and related-account conflicts remain prohibited. Stale version decisions fail safely. Removal hides a post from public feeds, search, profiles and interactions.

Authors can always withdraw their own posts. A removed post displays Management's reason privately; revising a removed post retains the private approval requirement. Legacy pending posts get a neutral manual-review notice, not an AI result.

## API and database compatibility

- No `OPENAI_API_KEY` or `OPENAI_RELEVANCE_MODEL` is needed for posts.
- Historical AI screening columns can remain nullable in the database for compatibility. The member post pipeline does not populate them and the Management screen no longer displays those AI verdicts.
- Existing additive database migrations remain part of the history; do not roll them back in a production environment.
- Deploy the updated backend and frontend together. Run regression tests against a separate, migrated test database before deploying.

## Acceptance tests

1. Identity-verified member publishes achievement, question and event instantly; other members can read them, and they appear in the Published Management queue.
2. Unverified member cannot publish. Invalid topics/payloads, repeat keys with changed content and rate limits remain enforced.
3. Edits to normal published posts remain published without any AI service or API key.
4. Management can remove a published post with MFA; it disappears from discovery and direct reads, and the author sees a human decision reason.
5. A removed post edited by its author remains private pending Management review; stale decisions fail, authorized restoration succeeds.
6. Previously pending posts remain private and have a neutral author notice until human review or author revision.
7. Validate feeds, public profiles, comments, reports, event registrations and question answers, plus desktop/mobile moderation UI.

**Operational consideration:** Removing automated pre-publication screening increases exposure to spam and harmful content. Management must monitor published posts and promptly handle reports and removals.
