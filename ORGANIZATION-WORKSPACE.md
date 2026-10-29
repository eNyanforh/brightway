# Organization workspace

The approved organization's primary administrator enters its private workspace rather than using its public profile as an administration page. One person retains one login and can switch between Personal and multiple organization memberships. Pending requests remain private and cannot operate an organization.

## Entry and navigation

- After the first organization interest, **My Workspace** appears after Learning and lists pending requests and current organization memberships. Approved organizations expose **Manage**, opening the private organization workspace. See [WORK-HUB.md](WORK-HUB.md) for the current submission/edit/withdrawal journey. The existing public organization profile remains available from inside the workspace.
- Returning members use My Workspace → Approved → Manage (also accessible through avatar → My Workspace). No duplicate login or new organization request is needed.
- `/organization-workspace/:id` is the Dashboard. It identifies the organization and current role, shows available tools and separates the remaining agreed production modules by delivery status.
- `/organization-workspace/:id/staff` contains invitations, membership permissions, revocation and primary-administrator protection.
- `/organization-workspace/:id/credentials` contains issuer-scoped credential review. Both privileged destinations retain existing server-enforced current permission and MFA checks.
- Organization sidebar/mobile navigation replaces Personal destinations while acting for an organization. Overview, staff, reviews and switching remain reachable on mobile according to the current membership. The existing header, avatar and personal navigation stay intact outside organization context.
- The workspace metadata is built from authenticated organization membership and effective permissions on the backend. URL labels or navigation alone grant nothing. Foreign/revoked/suspended memberships cannot acquire tools; focus rechecks remove withdrawn permissions and private rows. Personal profile drafts stay in the existing parent layout during switches.
- **Manage** always opens the selected organization's private context. The sidebar, mobile navigation and overview are derived from that member's effective permissions. A copied direct URL for a tool outside the member's scope shows no private controls or rows, while the API independently rejects unauthorized access.

## Agreed functionality and delivery boundaries

The saved master architecture (organization membership/permissions and frontend architecture) and product specification §22.3 define organization profile/content, staff, opportunities/applications, programs/admissions where applicable, analytics, and eligible active Campus operations/billing.

| Area | Current workspace behavior |
| --- | --- |
| Organization profile | Opens an internal profile-style page using approved public organization/location data. A separate View public profile action remains available. Profile/content editing is not included. |
| Staff and permissions | Working scoped staff/invitation management; sensitive operations require MFA. |
| Credential reviews | Working issuer-scoped review, evidence, decisions and permission-withdrawal recovery. |
| Posts/content | Displayed as planned Sprint 5 work only for authorized publishing scope. |
| Opportunities/applications | Planned Sprint 6; no fake publishing or application actions. |
| Programs/admissions | Planned Sprint 7; only education-capable organizations with the relevant scope see these planned tools. |
| Analytics | Planned with the corresponding product modules; no fabricated counts/reports. |
| Virtual Campus/billing | Not activated by organization approval. Campus is a later module requiring a qualifying verified Liberia operation and actual activation; Grade School/TVET stay separate. There are no operational Campus/billing actions in this release. Build Campus is an informational setup overview, explicitly marked Coming soon. |

Planned cards have no action links or forms. This is the workspace entry/navigation foundation, not a claim that later sprint backends have been delivered. Existing core grants prepare those modules without making them operational. Full agreed production scope and the 26 January 2027 target remain unchanged and subject to acceptance. Deployment remains paused.

## Updating and acceptance

No new dependency or database migration is introduced by this workspace update. If the preceding issuer-review update has not yet been applied, first follow SPRINT-3-ISSUER-REVIEWS.md, including isolated database checks and application development migration/client generation. Preserve private environment values and the original MFA key.

From the root, pull with `git pull --ff-only origin main`, then restart the existing backend/frontend. Test the new workspace behavior rather than repeating already reported onboarding acceptance:

1. An approved requester opens **My Workspace → Manage** and sees its own organization overview. A pending/rejected requester receives no operational workspace.
2. Returning primary administrator: avatar → Switch account → organization. The header/sidebar/bottom navigation identify organization context. Enter Staff & permissions, then Overview, then Credential reviews without returning to a personal sidebar.
3. Confirm staff/review tools require the correct current permission and MFA. A publishing-only member must not receive staff/review tools. Revoke access with a stale tab open and verify UI data clears and direct API requests fail.
4. School/training organizations show applicable planned programs/admissions. A non-training Company does not. None can activate Campus/billing from this overview.
5. Planned posts/opportunities/admissions/analytics cards do not submit forms or imply saved/published data. Their real backend work remains scheduled.
6. Check desktop/mobile navigation, keyboard focus, no horizontal overflow, public profile opening separately, and preservation of unsaved personal profile edits across context changes.

Record the exact local SHA and outcomes. CI/service/UI/native-browser checks are separate from owner acceptance on the application database; no cloud environment or user documents are accessed by these implementation checks.

Local verification: 296 backend cases passed (21 explicit database skips), 202 frontend cases passed, plus lint and build. The workspace route is split into a separate bundle; the main production bundle is below Vite’s default warning threshold. Native Chromium at 1280px and 390px exercised approved entry → overview → staff → issuer reviews → overview using actual services with a fixture database, with no runtime errors or horizontal overflow. These do not claim acceptance on the owner’s application database, real provider services or a deployed environment. Use the exact commit’s CI run for actual PostgreSQL execution.

## Direct organization entry — 29 October 2026

Manage opens `/organization-workspace/:id` directly for the selected organization. It never opens an account-selection step. The loading heading is Organization workspace until the authorized organization name is returned; it no longer flashes Switch account. The Switch account avatar action and legacy picker screen are retired. Old `/organization-workspace` UI bookmarks redirect to `/work`; My Workspace holds organization selection and incoming invitations. This does not remove the existing authenticated backend API or weaken organization membership, permission, MFA or revocation checks. Personal drafts remain in the shared parent layout across Manage and Return to Personal.

## Build Campus entry — 29 October 2026

A separate promotional block beneath the organization tools uses the existing Create an organization sidebar treatment, supporting copy and a **Build Campus** action. Backend workspace metadata returns this informational entry only for PRIMARY_ADMIN members of a School or an organization with training capability. Ordinary staff and non-training organization administrators do not receive it. On mobile the organization overview exposes the same entry; the bottom operational navigation remains unchanged.

The entry opens `/organization-workspace/:id/campus`, after the existing authenticated organization context check. The informational page also checks the current primary role and education capability and handles revoked/foreign contexts through existing denial behavior. It states Coming soon, explains the qualifying verified Liberia operation/administration/activation requirements, and creates no Campus, bill, payment, academic record or eligibility attestation. The actual Campus setup and server-enforced activation/billing workflows remain the agreed later-sprint delivery. The entry is distinct from operational tools; organization approval and admission acceptance still cannot activate or bill Campus. No schema migration or new dependency is introduced.

## Current organization navigation — 29 October 2026

The organization tools are ordered **Profile**, **Dashboard**, **Staff**, **Credential Review**. Staff and Credential Review remain conditional on the member's live effective permissions. Dashboard replaces the Overview label at the existing root URL. Profile is an internal `/organization-workspace/:id/profile` route with a user-profile-style cover, labelled initials placeholder, organization-specific verified badge, details and operating-location cards. It loads the existing public projection only after the parent membership context succeeds, checks response organization binding, aborts late loads and displays no account contacts, private requests or reviewer notes. Reload retries the profile read. No editing/upload action or new profile fields are invented.

Dashboard shows only current operational tools. Future posts, opportunities, programs, admissions and analytics cards have been removed from the visible dashboard until those tools are delivered. The separately requested Build Campus block and its Coming soon overview remain. Manage still opens the selected organization's Dashboard directly, and existing credential/staff URLs and authorization are preserved. No schema migration or new dependency is required.

The organization Profile opens directly with the organization name as its only main heading. Its redundant Profile heading and top Personal account / Back to My Workspace / Account security links are removed. Sidebar context links remain; Account security is available in the avatar menu. View public profile is retained, and a secondary Reload organization profile action below the details preserves refresh/retry behavior. Other workspace sections retain their existing navigation.
