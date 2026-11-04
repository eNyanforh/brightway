# Loading and refresh changes

The confirmed source causes were independent focus listeners, overlapping reads,
serial organization setup/access requests, and statistics replaced by loading
content. Database region/internet latency may still contribute, but was not
measured against an application database during this change.

- One focus dispatcher expires snapshots once and notifies mounted readers.
  Authentication providers and page readers guard in-flight work. A focus during
  initial staff loading queues one later access check so a revocation is not lost.
- A private memory-only request layer shares in-flight JSON reads and clones each
  response. One consumer abort does not cancel another. Recent ordinary results
  expire after ten seconds; admin/management and organization access remain
  network-revalidated. No cookies, bearer tokens or evidence enter this cache.
- Keys include realm, identity epoch, full URL/query (including organization) and
  headers. Identity changes/logout, mutations and confirmed denial invalidate the
  affected realm. Late results cannot repopulate a previous epoch. All protected
  backend endpoints still perform live authorization.
- Organization context now includes the setup projection from the organization
  and membership it already reads. The setup gate shares that context with the
  workspace. Rolling upgrades can fall back to the older profile endpoint.
- Existing statistics remain visible while a safe background read is pending.
  Denied access clears private content. Profile/identity refreshes do not discard
  drafts; explicit refresh bypasses recent data. Account-keyed layouts clear the
  previous account's drafts and access state.
- Management has its own layout/provider: entering it does not load personal
  profile/work data or use a personal login as an intermediate step.

## Measured synthetic request changes

| Scenario | Prior source behavior | Verified new behavior |
| --- | --- | --- |
| Two concurrent identical JSON readers | Two fetch calls | One fetch, two independent response bodies |
| Organization entry through setup/access/dashboard | Three sequential API calls | Two: context including setup, then dashboard |
| Setup projection within context | Separate profile access/read | Existing organization/membership data; existing locks retained |
| Dashboard background refresh pending | Statistics replaced by loading state | Existing statistics remain visible |

These are deterministic fixture/request-count measurements, not deployed latency
or SQL timing claims. The context test records Prisma method calls and retains
its account/organization locks. No concurrency locks, MFA checks, revocation checks
or server authorization were removed to improve these counts.

Before broader backend optimization, record browser Network timings (cold/warm
entry, focus, return navigation), correlated endpoint durations and SQL/lock time
on the intended isolated environment. Separate connection establishment, query
execution and lock waits. No actual Neon lock/time measurements or proven real
latency improvement are claimed here. Real browser/mobile and application database
acceptance remain separate from synthetic regression checks.

ESLint is also anchored at the root so the minimatch 11.0.1 override applies to
its transitive dependency; this addresses the audit advisory without disabling
security checks. Runtime product dependencies were not replaced with paid services.
