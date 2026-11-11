# Sprint 5 — Post moderation and review

## Publication policy

Only members whose identity is currently verified may submit an Achievement, Question, Event, or legacy personal Post. New personal posts are stored as **PENDING** and do not appear in Explore (including Following and Saved), public profiles, search, reposts, share permalinks, comments, question answers, event registration, or public activity. Authors can view, edit, or delete their own pending or rejected submissions in **My posts**. Editing an approved post creates a new **PENDING** revision and withdraws it from public discovery until it is reviewed again; deleting permanently withdraws the post.

Existing posts published before this migration remain **PUBLISHED**, avoiding retrospective removal.

## Automated screening (optional)

If you configure the backend-only \`OPENAI_API_KEY\`, the backend sends the submitted post text, tags, and relevant event/question title and venue to \`POST https://api.openai.com/v1/moderations\`, using \`omni-moderation-latest\`. Meeting URLs, private user contact details, application forms, and enrollment evidence are excluded. The request uses a four-second timeout.

Only a small safety result is persisted: \`CLEAR\`, \`FLAGGED\`, \`UNAVAILABLE\`, or \`NOT_CONFIGURED\`, plus flagged category names. No model-generated content or confidence threshold automatically authorizes publication. Provider failures do **not** bypass review or prevent a legitimate user from submitting for human review. The provider is not a substitute for BrightWay's educational and professional posting guidelines.

The service never exposes the provider credential or raw moderation response to browsers. If the key is absent, moderation still operates using the management review workflow. Do not configure the key in a frontend environment variable.

## BrightWay Management workflow

1. Sign in to the separate Management realm with authorized staff credentials and MFA. The staff member must have the \`moderation-agent\` capability; Super Admin receives all implemented capabilities.
2. Open **Management → Post review**. The queue shows the oldest pending items, including post type, content, tags, relevant event/question details, optional AI safety categories, and the current revision.
3. Select a submission and **Approve** or **Decline**. Each action requires a reason (10–1,000 characters), the management password, and a fresh MFA code. Decisions include an idempotency key and the reviewed revision; stale decisions return **409**.
4. An approval moves the exact pending revision to **PUBLISHED**, subject to existing identity/account visibility gates. A decline retains the post as private and displays the moderator's explanation in the owner's **My posts** view.
5. A subsequent author edit returns the post to **PENDING** and increments its revision. A new review is required.

Management permissions are checked during queue reading and inside the decision transaction. Moderators cannot approve their own or a declared related account's post. Decisions are recorded in the management audit log atomically with the post state.

## Deployment

Apply the database migration before serving the updated backend or frontend:

\`\`\`sh
cd backend
npx prisma migrate deploy
npx prisma generate
\`\`\`

This includes \`20261111150000_member_post_moderation\`. It adds moderation state and metadata to existing \`MemberPost\` records, with existing records preserved as published and future defaults pending. Deploying the code without the migration will fail. Deployment is separate from merging this source branch.

## Acceptance and operations

- Verify a new achievement, question, and event are private and appear in My posts as pending. Their direct permalink should return unavailable.
- Check that a personal post is absent from Explore, saved/reposted feeds, search, and the public member activity feed until approved.
- Verify the reviewer must use the independent management realm, MFA, and permission, and cannot review a related account.
- Verify decline feedback, editing a published/declined post, and stale decision 409 behavior.
- Repeat with an absent and a failing AI provider, confirming both leave content pending.
- Keep queue processing capacity and review times under observation. This implementation is **human-approved**; a clear safety result by itself does not evaluate whether a post is relevant to learning or career growth.
