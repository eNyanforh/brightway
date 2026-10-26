# Dependency and CI checkpoint — 26 October 2026

GitHub Actions run 40317887766 passed on commit cf3baed5b75680f036c3192dee7636b275c41117 for Node 22.23.3 and Node 24.22.1. Both jobs passed clean dependency installation, schema validation/generation, backend/frontend tests, lint, build, clean PostgreSQL 16 migration deployment, all 15 database cases without skips, and migration replay with no pending changes. This is real PostgreSQL integration evidence with synthetic data/simulated storage. It does not migrate Emmanuel's application database or prove live R2/browser acceptance.

https://github.com/eNyanforh/brightway/actions/runs/40317887766

The successful run also surfaced dependency advisories. Targeted lockfile updates resolve the currently reported findings without changing direct dependency ranges or upgrading Prisma:

| Dependency | Before | Updated |
| --- | --- | --- |
| body-parser | 2.3.0 | 2.4.0 |
| fast-uri | 3.1.8 | 3.1.9 |
| undici | 8.11.2 | 8.12.3 |
| qs (body-parser dependency) | 6.16.0 | 6.16.1 |

Advisory references:

- https://github.com/advisories/GHSA-27r3-jxmh-p828
- https://github.com/advisories/GHSA-xjj6-f33q-929c
- https://github.com/advisories/GHSA-w74x-v6f9-j3xg

A fresh `npm ci` and `npm audit --json` against the updated lockfile completed here. The audit reported zero known findings at this check; this is not a claim that the application has no security defects. Backend regression, frontend regression, lint and combined build are checked before publication. The CI workflow now runs `npm audit --audit-level=moderate` and retains its log with other check artifacts. No audit exceptions, force upgrades or failing checks are suppressed.

Deployment remains paused. New application migrations, real-account name/photo journeys, retention acceptance and the other Sprint 1 gates remain separately tracked.
