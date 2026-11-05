# Sprint 4 — profile-view consent settings

This change adds two owner-controlled settings to the private individual profile:

- `profileViewSharingEnabled` lets the account holder opt in to showing their identity when they explicitly view another individual profile.
- `profileViewNotificationsEnabled` lets the account holder opt in to receiving profile-view notifications.

Both settings default to off. Saving either setting uses the current profile version and the existing authenticated, trusted-origin profile update path. A stale profile version is rejected by the existing conflict handling. Settings do not change profile visibility, contact access, account status, or network relationships.

The explicit public individual profile and notification inbox are not implemented yet. Therefore no profile visits are recorded or notifications created by this settings slice. Future tracking must be initiated only by an explicit profile-view action, and may create an identifiable notification only when both viewer sharing and recipient notification preferences are enabled at that time. Background lookup, relationship refresh, contact access, and organization profile visits must not create these events. Turning either preference off must stop future identifiable notifications; it must not delete or restore relationships or access.

The additive migration is `20261105140000_profile_view_consent_settings`. It adds two non-null Boolean columns with `false` defaults; existing profile records remain opted out. Apply it through the ordinary development migration workflow after updating the local checkout. Deployment remains paused.
