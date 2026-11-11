# Sprint 5 — AI-assisted automatic publishing and continued Management oversight

## Publication policy

Only identity-verified individual members may submit personal achievements, questions and events (plus legacy POST records). Organizations retain their existing separate organization-posting permissions.

Every newly submitted or materially edited personal post goes through **two independent AI checks**:

1. **Safety**: \`omni-moderation-latest\` checks for unsafe content.
2. **BrightWay educational relevance**: \`gpt-4o-mini\` (configurable server-side) classifies whether the actual post content has a genuine educational, research, skills, professional achievement, mentoring, or career-development purpose. Tags alone cannot make irrelevant content relevant.

**Auto-publish** only when the safety endpoint returns \`CLEAR\` with no flagged categories **and** the structured relevance result is \`RELEVANT\`, classified into a real BrightWay topic category, with classifier confidence at least 0.90. Numerical confidence is an uncalibrated signal: human audit and periodic tuning remain necessary.

If either service is missing, times out, returns an invalid response, flags harmful content, or cannot establish educational relevance, the post stays private as **PENDING**. A clear safety result alone never publishes a post. We do not automatically reject uncertain or off-topic submissions; authorized Management decides. Legacy published posts remain published until reviewed.

Auto-published content appears immediately in public feeds, search, profiles and relevant interactions, subject to the existing author identity and block controls. Pending/removed posts never appear in public discovery, comments, shares, question answers or event registrations.

**Edits** are re-screened against the stored post type; passing revisions can be immediately republished. However, posts previously **REJECTED** by Management remain **PENDING** after edits, even when both AI checks pass. This prevents trivial edits from bypassing a human takedown.

## AI configuration

Backend \`.env\`:

\`\`\`dotenv
OPENAI_API_KEY="your-private-server-side-api-key"
OPENAI_RELEVANCE_MODEL="gpt-4o-mini"
\`\`\`

Never put keys in \`VITE_*\` variables or client requests. The safety moderation endpoint is currently free; relevance classification via Chat Completions consumes billable tokens and may be subject to rate limits. Check provider pricing and budget before enabling production traffic. With the key absent or either provider unavailable, posts still reach the human review queue.

Only post type, body, topic tags, question title/intent, and event title/venue are submitted to these classifiers. Private meeting URLs, personal contacts, application materials, identity evidence and other private records are not included. Requests are time-bounded and errors do not log private content or secrets. The relevance classifier uses strict structured JSON and treats post content as untrusted data.

## Management remains in control after publication

Open **BrightWay Management → Post review**, with the independent staff realm, \`moderation-agent\` capability and fresh MFA.

- **Pending**: Approve or decline posts waiting for human review (oldest first).
- **Published**: Inspect any active auto-published or manually approved post, including its safety and relevance signals. **Remove post** hides it immediately across feeds, search, public profiles and interactions.
- **Removed / declined**: Inspect rejected posts and **Restore post** when appropriate.

Every decision requires a reason (10–1,000 characters), management password plus fresh MFA via step-up, an idempotency key, and the current moderation revision. Every transition increments the moderation revision, so stale decisions cannot overwrite newer edits, takedowns or restorations. Management decisions write an immutable ManagementAction audit record atomically with the state transition. Moderators cannot review their own or declared related accounts' posts.

The author's **My posts** view displays Published, Pending or Declined/removed, with feedback for declines. A declined author can revise the content, but the revision stays pending until a human moderator approves. The author can withdraw a post at any time.

Existing reactive reports and content-report case handling remain available; proactive Management moderation complements rather than replaces them.

## Deployment

Merge into the repository's main branch only after Node 22/24 unit and integration tests, isolated PostgreSQL migrations, frontend regression/build/lint and desktop/mobile browser acceptance pass. This code change **does not deploy itself**.

Apply migrations **before** starting a backend using the updated schema:

\`\`\`sh
cd backend
npx prisma migrate deploy
npx prisma generate
\`\`\`

The additive migration \`20261111172000_member_post_relevance\` adds relevance metadata, keeping existing states unchanged. Restart the backend and deploy the updated frontend separately.

## Acceptance checks

1. Verified achievement, question and event with a clean safety response and a high-confidence relevant classification appear immediately; owner receives an accurate publication message.
2. Flagged, off-topic, uncertain, unconfigured, rejected and API-error submissions remain private and show up as pending.
3. A moderator sees approved and auto-published posts in the Published queue, removes one with MFA, and verifies it disappears from public feeds, direct reads, profile highlights, analytics and search.
4. A moderator restores the same post, and its public visibility returns.
5. A rejected author's edited post remains pending, even when both AI checks pass; stale moderator decisions fail with 409.
6. Check mobile Management review, tenant separation, self-review restrictions, idempotency replays, event registration and question-answer access.
7. Periodically review false positives and false negatives before raising automatic-publishing traffic or treating classifier confidence as sufficient evidence.

AI classifications are fallible. BrightWay Management must remain staffed to review flagged posts and respond to reports after publication.
