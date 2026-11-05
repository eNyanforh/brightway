# Sprint 4 — profile-view consent settings

This work adds owner-controlled settings to the private individual profile:

- `profileViewSharingEnabled` lets the account holder opt in to showing their identity when they explicitly view another individual profile.
- `profileViewNotificationsEnabled` lets the account holder opt in to receiving profile-view notifications.
- `profilePublicEnabled` lets the account holder publish a basic profile for signed-in members who know the exact username.

All three settings default to off. Saving a setting uses the current profile version and the existing authenticated, trusted-origin profile update path. A stale profile version is rejected by the existing conflict handling. Publishing does not change contact access, account status, or network relationships. Contact details are not included in the public profile response.

The public profile is available only through an explicit “View published profile” action in Network. Loading a person in Network, refreshing relationship state, checking contact visibility, and viewing an organization never record a visit. A notification is created only when the visitor has enabled sharing and the profile owner has enabled notifications at the time of the view. One visitor-owner pair produces at most one notification per UTC day. The inbox is owner-only and omits inactive visitors. Blocking deletes prior view notifications between the two people, so unblocking does not restore them. Turning off either preference stops future identifiable notifications. Marking a notification read changes its read status; it does not erase the record. No email or push notification is sent.

The additive migrations are `20261105140000_profile_view_consent_settings` and `20261105153000_profile_views_notifications`. They add three non-null Boolean columns with `false` defaults and an owner-scoped, daily-coalesced notification table. Apply them through the ordinary development migration workflow after updating the local checkout. Deployment remains paused.
