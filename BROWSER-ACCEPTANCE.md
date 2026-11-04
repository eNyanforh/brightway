# Management browser acceptance

Run from the repository root after `npm ci`:

```bash
npx --no-install playwright install chromium
npm run test:browser --workspace frontend
```

The locked Playwright dependency determines the Chromium revision. CI installs its
Linux system dependencies too. Tests start their own Vite server on loopback port
4187 with strict port selection; close anything using that port first.

The same management journeys plus organization navigation run in desktop Chromium (1280 × 900) and mobile Chromium
with Pixel 7 emulation:

- Independent email/authenticator enrollment, rejected proof, one-time backup
  display, management entry and sign-out, without personal authentication reads.
- Unsaved credential feedback retained and disabled during temporary management
  access failure, one request per focus access check, and private feedback removed
  after confirmed access denial.
- An unassigned operational deep link cannot mount/request the private review queue.

Checks fail on uncaught page errors, unexpected API routes or horizontal overflow
in the checked sign-in/workspace views. API calls are fulfilled by synthetic browser
fixtures and third-party network requests are blocked. No backend, database,
Resend account, storage bucket or real user is accessed. These are real browser UI
checks, not end-to-end acceptance of real credentials or provider delivery.

Organization navigation also stays mounted during delayed tab access checks,
then clears on confirmed membership denial. This runs in both viewport projects.

GitHub workflow `Management browser acceptance` runs the eight cases on PRs. Reports
and failure screenshots/traces are retained for seven days as CI artifacts.
`frontend/playwright-report/` and `frontend/test-results/` are ignored by Git.
The existing Vitest suite remains separate under `frontend/src/test`.

Owner acceptance still includes actual management bootstrap/email/MFA/recovery,
issuer and management decisions using test accounts in the application, private
storage delivery, and mobile-device/assistive-technology checks. Browser fixture
success must not be described as production acceptance or actual latency evidence.
