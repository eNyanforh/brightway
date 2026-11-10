# BrightWay member profile visibility policy

## Default member visibility

Active individual accounts have member profiles visible to signed-in BrightWay members. Members do not need to publish or opt in to make the basic profile visible. The person's name, headline, about section, location, career direction, skills, interests and their professional records can be displayed when entered.

Education and work experience are displayed whether or not reviewed, except records explicitly flagged as false credentials. Unverified records must be identified as self-reported; they may not carry a verified badge. Standalone licenses and certifications are self-reported. Verified credentials require the current revision and an authorized, approved review. Published, non-withdrawn achievement posts from effectively verified members may be featured.

Block relationships, account suspension/deactivation, identity verification for community posting, organization publication permissions, abuse controls, credential-review evidence protection, and authentication requirements remain enforced. These are security and trust rules, **not** member-configurable profile privacy switches.

## The only member-configurable privacy settings: contact

Email, phone and WhatsApp contact information each have an independent setting:

- **Only me** — the account owner alone can read it.
- **Connections** — the owner and accepted connections can read it.
- **Public** — exposed under the existing contact API policy, including to people who are not connected.

Defaults remain **Only me**. The server alone resolves identity and connection status; the client cannot forge audience settings. Blocking takes precedence and hides contact information from blocked people. Contact information is loaded independently from the public profile and must never be included in the general profile projection.

## Profile visits, search and notifications

Signed-in profile visits and search appearances are counted for the owner's seven-day dashboard. Recent visitors/searchers may appear in an owner-only, bounded avatar preview. Search queries are never disclosed. Actual profile opening, not network directory browsing or contact lookup, records a profile visit. Notifications about genuine profile visits are generated automatically and at most once per member pair per UTC day. The original notification inbox retains read/dismiss controls and block cleanup. No account-level sharing or notification opt-in switches remain.

## Removed preferences

The former profile-publication, certification visibility, credential visibility, featured-achievement visibility, profile-view identity-sharing, and view-notification preference controls no longer appear in the UI. The profile update schema rejects them, and read/authorization paths do not consult them.

The old Boolean columns remain in the Prisma database model as **inert legacy columns** for compatibility with existing migrations and snapshots. They must never be used to gate any member profile feature, and no additional code should introduce corresponding UI switches. A future database-cleanup migration may drop them once production rollout is complete; never rewrite previously applied migrations.

## Development tests

Regression coverage should verify active default-visible profiles, independently filtered contacts, blocked viewers, verified vs self-reported credentials, verified individual posting, zero opt-in controls, and automatic daily-coalesced visit notifications.
