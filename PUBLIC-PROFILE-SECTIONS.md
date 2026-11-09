# Public member profiles — professional proof sections

## Visibility and authorization

The existing `POST /api/v1/profiles/:username/view` endpoint is a signed-in,
trusted-origin, consent-gated profile view. The current network block checks,
no-store policy, and view-notification consent continue to apply.

The existing `profilePublicEnabled` setting must be **true** before the
profile can be opened. Three independent settings default to **false**:

- `profileCertificationsPublicEnabled`: show the member's self-reported
  certifications. These do not receive BrightWay verification badges.
- `profileCredentialsPublicEnabled`: show verified education and experience
  records only when the record's current revision matches an actual
  `CredentialReview` with status `VERIFIED`.
- `profileAchievementsPublicEnabled`: show the member's original,
  non-withdrawn `ACHIEVEMENT` posts only when effective identity verification
  is currently `APPROVED`.

Disabling basic publication overrides all three opt-ins. A blocked person
cannot open the profile. Private contacts, uploads, reviewer notes, review
history, and verification evidence are never projected by these sections.

## Self-reported certifications

Stored as a versioned array on the owner-only Profile record. Each record
contains title, issuing organization, issued month, optional expiration
month, and an optional HTTPS credential URL. The existing `PATCH
/api/v1/profile/me` route enforces schema validation and optimistic profile
versioning; the profile editor retains unsaved drafts.

Only standalone self-reported certificates use this array. Academic and
employment evidence belongs to the existing credential review workflow.
The presence of a credential link is **not** proof of verification.

## Deployment

Apply the database migration in
`backend/prisma/migrations/20261109183000_public_profile_sections`
before serving the updated backend. Existing members remain opted out.
There are no new external JavaScript dependencies.

## Verification matrix

- New profile, all flags false: **no optional sections**.
- Public profile on, all optional flags false: **basic fields only**.
- Certifications on: **self-reported records**, explicitly labeled.
- Credentials on: **matching current verified revisions only**.
- Achievements on: **currently verified member's non-withdrawn achievements**.
- Blocked viewer, inactive target, or unpublished profile: **404**.
- Private contact, evidence, notes: **never in the public response**.

The dedicated browser spec exercises the three optional sections on the
published profile. The standard pull-request browser workflow runs the
full `frontend/e2e` directory on desktop and mobile.
