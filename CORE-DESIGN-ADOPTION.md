# BrightWay Core Design — authenticated interface adoption

Reference: https://brightway-core-design.nyanforhen.chatgpt.site/
Date: 18 November 2026

## Scope of this change

- Reuse the existing React/Vite/Express/Prisma implementation. The published prototype supplies **visual direction**, not application logic or sample data.
- Adopt a shared design surface for the authenticated shell: black typography, white surfaces, BrightWay blue (#175CD3), restrained borders, consistent icon/button states, and clean, purposeful spacing.
- Use Proxima Nova when available locally; otherwise fall back to system fonts. Do not redistribute proprietary font files.
- Keep the official existing logo and uppercase BRIGHTWAY wordmark on desktop; logo only on mobile.
- Show real message and notification routes in the header. On mobile, keep the logo, search icon, messages, notifications, and authorized account avatars accessible. Search results still use the **single existing search field**.
- Make mobile navigation exactly Explore / Opportunity / Post / Network / Learning. The raised central Post action reuses the real composer route and is not duplicated as a second floating button.
- Retain authorized personal/organization/school account shortcuts and the current-context-first facepile. Context visibility remains determined by approved memberships and student enrollments; do not infer teacher/admin permissions from the preview.
- Restyle only the existing Explore billboard to BrightWay blue/black rather than navy. Preserve the rest of the live feed, card rules, and working opportunity forms.

## Deliberately unchanged

API contracts, database schema, authentication, role enforcement, page content, campus/organization isolation, opportunity submission, profile editing, post operations, and all real-user data. The preview's sample content has **not** been copied to production.

## Validation required before merge

1. Run `npm --prefix frontend run lint`, `npm --prefix frontend test`, and `npm --prefix frontend run build`.
2. Confirm keyboard/focus navigation, auth account switching, the unsaved-edit guard, and the single live search across desktop and mobile.
3. Browser acceptance at widths 320, 375, 700, 768, 1024 and 1440px; verify no horizontal overflow, avatar clipping, accidental sixth mobile action, or blocked controls.
4. Verify private organization and Campus workspaces retain separate navigation and existing permissions.
5. Visually compare against a browser screenshot of the published reference. The reference URL's public text extraction does **not** expose full pixel/layout details, so visual parity remains unverified until screenshot-based inspection.

This is a **first implementation slice** of the Core Design interface, not a claim that every feature page now pixel-matches the preview.
