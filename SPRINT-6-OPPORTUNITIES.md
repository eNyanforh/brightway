# Sprint 6: Opportunities and applications

BrightWay now supports organization Jobs, Scholarships, Challenges and Events. Each type has a fixed gradient identity and uses an internal Apply, Participate or Register action. Personal feed events remain a separate domain.

## Organization workflow

After organization approval and profile setup, open **Organization workspace → Opportunities**. Staff need `organization.opportunities.manage`; primary administrators receive the current permission catalog automatically. Create a draft, add questions, save, and publish. Listings support Draft, Published, Paused, Closed, Cancelled and Removed. Pause before editing; the type and questions are locked after first publication. Closing, cancellation and removal preserve application history and are final. Paused listings may be republished with a future deadline.

**Applications** requires the separate `organization.applications.review` permission. Existing opportunity publishers do not automatically receive access to applications; a primary administrator grants it through Staff. Current membership, organization approval/readiness, verified email and MFA are enforced on every organization request and rechecked inside transactions. Members cannot decide their own applications.

## Applicant workflow

Open **Opportunities**, choose a type or search, then open a listing. Questions support short/long answers, yes/no, single/multiple choice and file upload. Save a private draft, upload requested documents, consent to sharing a professional profile snapshot, and submit. Submission requires backend-confirmed profile completion and a verified email. Private contact details and credential evidence are excluded from the snapshot. Required questions and document ownership are checked server-side.

**My applications** retains drafts and submitted history. Submitted answers, attachments, profile data and the application form are immutable. Applicants see Submitted, Under review, Shortlisted, Selected, Not selected and Withdrawn statuses, organization feedback and a timeline. Applicants can withdraw, including after a decision; withdrawn applications cannot be reviewed again or resubmitted. No external application URL or application method field exists.

Decisions create applicant-owned Notifications in **All** and **Unread**. Status notifications can be marked read or dismissed without deleting the immutable application timeline.

Published, unexpired listings from active verified organizations appear in Opportunities, Search (including All results), and Explore. Explore's Following view limits opportunity suggestions to organizations the member currently follows. Browse ranking prioritizes exact titles, title prefixes, then text matches, with deterministic pagination. Expired, paused, draft, removed, or suspended-organization listings are excluded from discovery; applicants retain access to their application history.

## Development database and file storage

Before running the new API against a development database:

```sh
cd backend
npx prisma migrate deploy
npx prisma generate
```

The additive migration is `20261111090000_sprint6_opportunities`. It adds opportunity, application, file, event, and upload-budget tables; it does not alter existing member data.

Set `R2_APPLICATION_BUCKET` to a **separate private bucket**, distinct from `R2_BUCKET` and `R2_IDENTITY_BUCKET`, using the existing R2 credentials and jurisdiction settings. Do not attach a public domain or public read policy. If unconfigured, file uploads and downloads fail closed; other opportunity functions work. No credentials belong in this repository.

Files accept validated PDFs or normalized JPEG/PNG/WebP images up to 5 MiB, at most five file questions per listing and 30 attempted uploads per member per UTC day. File routes authenticate the owner or currently authorized reviewer, always download as attachments, and never return object keys or public storage URLs. Storage reads occur outside database locks and recheck access before releasing bytes. Replacement and failed uploads attempt immediate object cleanup. If a storage deletion fails, an inaccessible orphan can remain; object lifecycle/retention monitoring remains an operational task.

## Concurrency and validation

Application uniqueness is enforced by `(opportunityId, applicantId)`. Mutations lock the human actor, organization and opportunity in the same order as relevant existing authorization paths, and require expected versions. Stale submissions/decisions return 409; the UI retains draft answers and feedback until explicitly reloaded. Opportunity creation uses a scoped idempotency key. Status transitions and audit/timeline events commit atomically.

Run:

```sh
npm run test --workspace backend
npm run test --workspace frontend
npm run lint --workspace frontend
npm run build
npm run test:database --workspace backend -- --migrate
npm run test:browser --workspace frontend
```

Database checks require the existing isolated `TEST_DATABASE_URL` guard. Database tests exercise tenant/permission/MFA isolation, draft privacy, attachment ownership, snapshots and private contacts, concurrent submissions and decisions, deadline/status gates, revocation and notifications. Browser journeys cover publishing and applying at desktop/mobile sizes; unit tests cover errors and retained input. Deployment remains paused.
