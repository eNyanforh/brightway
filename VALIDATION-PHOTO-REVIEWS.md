# Validation — 26 October 2026

Executed on the prepared working copy using Node 24.22.1 and Prisma 7.10.0.

| Check | Result | Scope |
| --- | --- | --- |
| Backend tests | 228 passed, 0 failed, 15 database cases skipped | Fixture/service/HTTP tests, including the new approval/upload gate regression. |
| Frontend tests | 157 passed in 15 files | Simulated API responses. |
| Frontend ESLint | Passed | npm environment notice is separate from ESLint. |
| Combined build | Passed | Frontend production build and backend source syntax checks. |
| Prisma validate/generate | Passed | Dummy offline URL; no migration run. |
| npm ci dry run | Passed | Lockfile consistency only; no clean installation claim. |
| CI YAML | Parsed and permissions/matrix checked | Read-only contents permission; Node 22.23.3 and 24.22.1; workflow not published or executed. |
| Chromium desktop/mobile | Passed at 1280/390 px | Simulated APIs and synthetic WebP images: pending retention, approval refresh, decline preservation, revocation image clearing, no horizontal overflow or page runtime exceptions. |
| Expanded PostgreSQL case | Added, JavaScript syntax passed; not executed | Approval/upload interleaving, assignment/decision races, audit rollback, revocation and immutable identity. No PostgreSQL/R2 acceptance claimed. |

No database/cloud credentials are configured here. No application migrations, GitHub writes, production deployments or real-account browser changes were performed. See SPRINT-1-ACCEPTANCE.md for carried-forward evidence and unresolved gates.
