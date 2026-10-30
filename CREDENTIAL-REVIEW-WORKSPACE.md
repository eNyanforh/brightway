# Credential Review workspace

The organization Credential Review page and BrightWay reviewer workspace now share a responsive queue/detail layout. The applicant's existing credential submission pages and their private history are unchanged. This update changes presentation and client interaction; it does not change the credential state machine, issuer routing, review deadlines, permissions, evidence processing or database schema.

## Working through a queue

- Organization reviewers can use All reviews, Unassigned, In review, Past target and the status selector. These use the existing server filters, including Dashboard attention links. BrightWay's internal reviewer queue retains its existing server capabilities rather than displaying unsupported filters.
- The search explicitly applies to the loaded page. The summary strip describes that page, not organization-wide totals. Past-target counts include open Submitted/In review records only. Previous/next paging preserves the server filter; the queue remains ordered by initial submission date.
- Select an applicant to see human-readable saved claim fields, the reviewing issuer, revision, target, supporting document cards, assignment state and reviewer feedback. The current submission is prominent; previous submissions and review activity are in a disclosure. Dates use UTC and month/year fields use readable month names. Missing values are stated rather than invented.
- Assign or recover a withdrawn assignment only when the server permits it. Downloads remain authenticated attachment requests through the existing API. There are no public evidence URLs or embedded PDF viewers. Download controls are disabled until the selected review belongs to the current reviewer and access is current.
- The four existing decisions remain: Action required, Verified credential, Unable to verify and False credential. Feedback is required and visible to the applicant. A False credential decision additionally requires explicit acknowledgement of its supported finding and display consequence. A verified credential does not grant individual identity verification.

## Draft and failure behavior

Pending requests block duplicate writes, changing the selection and editing the decision form. Switching reviews, changing filters, paging, closing a dirty review or refreshing asks before discarding its unfinished decision. A document-close guard covers dirty decisions and pending writes. This is a page-local draft, not a persistent cross-navigation draft store: browser history changes and leaving the workspace can unmount it.

Focus refreshes retain unfinished feedback. A version conflict, temporary read failure or uncertain mutation result keeps the draft and disables assigning/deciding/downloading until an explicit reload reconciles server state. A later background success does not silently unlock it. An uncertain response never automatically retries a decision. Loss of session, permission or review scope clears private rows, selected details and feedback. A late response from an unmounted account/organization/filter view is ignored. Applicant names remain attached to the selected detail after a successful decision removes that row from the active filter.

On narrow screens, selection opens the detail in place of the queue; Close selected review returns to the queue. Focus moves to the selected heading and returns to the queue heading. Controls use visible keyboard focus, semantic labels and readable error/status feedback. The review module is loaded on demand so unrelated routes do not download it immediately.

## Apply and accept

No dependency or database migration is added. Pull from the project root and restart the frontend; restarting both development servers is also safe. Deployment remains paused.

Browser QA uses synthetic fixture responses and the built application. It verifies presentation/interaction, not the application database, live R2, email or actual reviewer acceptance. On the real application:

1. Sign in as an authorized MFA reviewer and compare the organization queue, status filters, Dashboard attention links and paging against known claims. Search should clearly affect only the loaded page.
2. Open an unassigned claim; verify documents/decision controls remain unavailable until assignment. Check a real private attachment after assignment. Confirm another organization or unauthorized reviewer cannot access it through the API.
3. Check education and each agreed experience type, saved month/year dates, current records, corrections, issuer attribution and history. Do not use test decisions on real claims.
4. Use disposable claims to test each decision, False credential acknowledgement, feedback visibility and removal of false credentials from profile display. Individual identity status must remain separate.
5. Test stale edits, permission/MFA revocation, temporary read failure and uncertain save responses. Verify feedback is kept where appropriate, no duplicate decision occurs, and reconciliation requires explicit reload.
6. Check narrow mobile, keyboard navigation, selection/close focus and the full protected applicant-to-reviewer journey. Record the application commit and observed results.
