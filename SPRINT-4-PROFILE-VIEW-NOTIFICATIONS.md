# Sprint 4 — published individual profiles and view notifications

## User controls

Each individual profile starts private. The owner can separately enable publishing, sharing their identity when viewing another profile, and receiving view notifications. Publishing makes only the basic profile fields visible to signed-in BrightWay members who know the exact username. Phone, email and WhatsApp remain governed by existing contact visibility and are never returned by the public profile API. Education and experience histories are not included in this first public profile surface.

## Explicit view behavior

The Network lookup remains a non-view operation. Only entering `/people/:username` from the explicit View published profile link sends `POST /profiles/:username/view`. The server checks both accounts and current profile settings, rejects unpublished or blocked profiles, and returns a curated response. It creates a view notification only when the visitor's sharing preference and the owner's notification preference are both enabled at that moment. A visitor-owner pair is coalesced to one notification per UTC day. Organization profile visits do not use this feature.

The event is private to the recipient. The inbox shows only active visitors, is paginated, owner-scoped and no-store. Mark-read and dismiss operations are authenticated and transactional. Blocking either person deletes existing notifications between them; unblocking does not restore those records. Turning off sharing stops future notifications; it cannot remove an event already delivered to the recipient. No email, push, public view count, follower graph, or profile-view analytics are added.

## Data and migration

`ProfileViewNotification` stores recipient, visitor, UTC day, created time and read time, with real account foreign keys, no-self constraint, unique recipient/visitor/day key and owner paging indexes. The database keeps at most one notification per visitor per recipient each UTC day. Marking a notification read does not delete it; the recipient can dismiss it to delete that inbox record. Blocking deletes any notification history between those accounts in the same transaction as the block. This first slice does not define an automatic retention interval. The viewer identity is resolved from the current active account when the inbox is read. Suspended/deactivated visitors are omitted.

Apply `20261105140000_profile_view_consent_settings` followed by `20261105153000_profile_views_notifications` using the ordinary development migration workflow. The deployment pause remains in effect. Real application acceptance must still verify two opted-in accounts, either-side opt-out, anonymous/unauthenticated rejection, unpublished profiles, blocks, daily coalescing, inactive visitors, owner-scoped pagination and desktop/mobile UI.
