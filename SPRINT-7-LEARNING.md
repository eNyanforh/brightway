# Sprint 7: Learning, Discover, Programs and Admissions

Learning → **Discover** now lists verified education/training providers, published programs and open application periods globally. Country, city/location and study-mode filters work outside Liberia. Programs also appear in Search (All and Programs) and Explore, whose Following view respects current organization follows. Program search ranks exact titles before prefixes and other matches, with stable pagination.

## Organization workflow

Open **Organization workspace → Programs** with `organization.programs.manage`. Verified schools and organizations with education/training capability can create a program with its name, description, type, duration, field, study mode, country/location and entry requirements. Drafts can be edited, then published or archived. Published program details are preserved; create another offering when those details change. Archival stops discovery and new applications while preserving history.

Add separate admission cycles to a published program for successive intakes. Each cycle has a name, opening date, deadline and optional custom questions. Save a draft, then publish as Upcoming or Open. Opening and deadline boundaries are enforced from timestamps on every request; a scheduler is not needed. Draft and future cycles can be edited; the program and questions are locked after publication. Opened cycles cannot be edited, and closure/cancellation is final. Published future cycles appear on the program detail page; Discover's Open applications view includes only cycles accepting applications now.

**Admissions** is the separate staff review tool, requiring `organization.admissions.review`. Managing programs does not grant access to applicants. Current membership, verified email, organization approval/profile readiness, education/training capability and MFA are checked inside each privileged transaction. An applicant cannot review their own application. Capability or membership revocation immediately prevents subsequent staff reads, downloads and decisions.

## Learner workflow

Find a program in Discover, choose an intake, answer its questions and save a private draft. Supported questions reuse the existing short/long answer, yes/no, single/multiple choice and document controls. Submit after consenting to share a professional profile snapshot and completing the backend's profile requirements. Name, headline, location, skills, interests and verified credentials are snapshotted; private contact details and credential evidence are excluded. Submitted answers, the program/cycle form, profile snapshot and documents are immutable.

**Learning → My applications** retains drafts and submissions. Statuses are Draft, Submitted, Under review, Waitlisted, Accepted, Not accepted and Withdrawn. Authorized reviewers can provide feedback; decisions appear in the application's timeline and Notifications → All/Unread. Applicants may withdraw, including after a decision. Withdrawal is final.

**Accepted is an admission decision.** It does not create Campus registration/enrolment, grant My Campus or Study AI access, or trigger billing. Institutions outside Liberia and institutions without Virtual Campus can use the complete Discover/program/admission workflow. Online study mode describes an offering; BrightWay lesson delivery is outside this sprint.

## Persistence, privacy and concurrency

The additive migration `20261111100000_sprint7_learning_admissions` adds separate Program, AdmissionCycle, AdmissionApplication, private-file, event and upload-budget tables. It preserves existing opportunity and member data. Apply migrations and generate the client before running the API:

```sh
cd backend
npx prisma migrate deploy
npx prisma generate
```

Admission documents use the same separate **private** `R2_APPLICATION_BUCKET` as opportunity application documents, with unique object keys and separate ownership/authorization records. No public file URLs or object keys are returned. Validated PDFs and normalized images are limited to 5 MiB, five file questions per cycle and 30 upload attempts per member per UTC day for admissions. Storage fails closed when unconfigured. Downloads authenticate before fetching storage bytes and recheck authorization before returning attachments. Best-effort cleanup can leave an inaccessible orphan if storage deletion fails; the existing retention/lifecycle operational requirements still apply.

Applications are unique per applicant and cycle. Actor → organization → cycle lock ordering, expected versions and transactional authorization checks serialize competing submissions, withdrawals, publication and decisions. Program/cycle creation uses scoped idempotency keys. Audit and status timeline writes commit atomically with changes. No external application URL/method or Campus registration field is accepted.

## Validation

Run backend/frontend regression, frontend lint, production build, isolated PostgreSQL migration/integration tests, and the desktop/mobile browser suite. The new tests cover global discovery, literal search, relevance/pagination, multiple intakes, opening/deadline gates, capability/tenant/permission/MFA isolation, draft/file privacy, snapshots, required answers, concurrent submissions/decisions, audit rollback, self-review rejection, archival, withdrawal and applicant-owned notifications. Browser fixtures use synthetic accounts and data; they do not contact production services.

Deployment remains paused.
