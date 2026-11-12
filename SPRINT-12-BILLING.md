# Sprint 12 — Virtual Campus billing

Deployment remains paused. This sprint adds the shared **USD platform ledger** for active, eligible Liberian Grade School and TVET Campuses. Institution tuition, program, registration and material fees remain outside this ledger.

## Billing units

| Engine | Official trigger | Unique fee |
| --- | --- | --- |
| Grade School | Official registration, including PRE_REGISTERED registrations | US$1 per student per billing semester |
| TVET | Official enrolment, including PRE_REGISTERED enrolments | US$1 per learner per Program/Intake |

Admission acceptance, Campus activation, modules, instructor assignments, assessments and certificates do not generate fees. Returning registrations use the appropriate new semester/intake unit. Suspension or withdrawal preserves the original charge and academic history; an authorized Billing Admin records a reasoned adjustment when required.

Semester academic periods map automatically when first officially registered; their start date is the classes-resume date. Term-based schools must first group their academic terms into a billing semester in **Campus → Campus billing & payments**, specifying the actual classes-resume date. Several terms in that semester share one student fee. A charged semester mapping and its original dates cannot be rewritten.

Charge creation, ledger evidence, academic registration and audit commit in one organization-locked transaction. Unique billing-unit keys and scoped source foreign keys prevent retry duplication. The source and amount are also checked by PostgreSQL.

## Staff and management workflows

Organization staff need `organization.campus.billing.manage`, an active eligible Campus, a complete organization setup and MFA for changes. Campus academic or teaching permission alone does not grant financial access. Open **Organization workspace → Virtual Campus → Campus billing & payments** to see balances, per-student charges, semester mappings, payment reports and a paginated ledger.

Select outstanding charges (up to 500 per report) and enter the reference of an actual payment through the institution's agreed payment channel. A report is **PENDING** and does not settle fees. The API also supports partial allocation in integer USD cents. This workflow records and verifies received payments; it does not move money or capture card/bank credentials.

Use **BrightWay Management → Campus billing** to review the payment queue and institution statements. The separate `billing-admin` management capability is provisioned through the existing trusted management terminal; Super Admins retain full authority. Confirmation/rejection and adjustments use the existing password + fresh MFA confirmation dialog. The management service rechecks current sessions and authority before committing.

Confirm only after independently verifying actual receipt. A unique settlement reference prevents reuse across payment reports. Confirmation preserves each allocation and adds one matching negative ledger entry. Rejection retains the report, allocation instructions, reason and actual management actor without reducing any balance. If a competing receipt/adjustment changes an allocation's balance, reject/reconcile the pending report rather than overpaying a charge. No institution staff identity can confirm receipts or adjustments. Management identities linked to institution staff, the reporting account or an affected learner cannot approve their own financial benefit.

Adjustments are signed integer cents, require an explanation and request key, and append ledger/audit evidence. Credits cannot exceed the unpaid remainder. Positive adjustments may only reverse previous credits up to the original US$1 fee. They cannot increase the platform tariff. Financial evidence is protected against database updates/deletes; corrections are appended. No financial deletion API exists.

## Grade School payment window

The due date is classes-resume date + 30 days. From seven days before that date, the notice processor sends an in-app notice to each affected learner and a reminder to authorized institution billing staff. The school reminder also asks staff to communicate with PRE_REGISTERED students.

Enforcement begins at the **later of the original due date and seven complete days after the actual notice timestamp**. Late or failed processing therefore cannot silently shorten notice. Notification insertion, notice timestamp and audit are atomic. Repeat and competing processor runs do not resend the same notice. Paid/credited charges do not receive payment notices.

My Campus exposes the affected learner's fee/window status and independently enforces it when reading a private Grade School report (including guardian access). Academic student/registration states and staff access are preserved. Confirming sufficient payment or a credit restores learner report access immediately. Reopening a settled charge clears its old notice, requiring a fresh full notice period. TVET has no automatic Grade School payment-window restriction.

## Migration and operation

From `backend`, using the intended deployment database environment:

```sh
npx prisma migrate deploy
npx prisma generate
```

The additive migration is `20261112110000_sprint12_billing`. It does not create historical charges, payments or student suspensions. An institution operator can explicitly reconcile official pre-Sprint-12 registrations from Campus billing after reviewing term mappings. Reconciliation is cursor-paginated, bounded and safe to repeat. No admissions are reconciled.

Configure the existing host scheduler to run the following **hourly**, using the same protected runtime environment and working checkout as the API:

```sh
node backend/scripts/process-campus-billing.js
```

The processor handles up to 200 outstanding eligible charges per invocation. For a backlog, run it repeatedly until `inspected` falls below 200. It filters settled/paused/ineligible campuses before selecting a batch, then rechecks current eligibility under the organization lock. Monitor nonzero exit status and the billing audit. If the scheduler is not running, notices and automatic restrictions will not begin; start it before enabling billing enforcement in any deployment. No scheduler or production deployment was enabled by this implementation.

## API

- `GET /organization-workspace/:campusId/campus/billing`: scoped statement; `cursor` pages charges.
- `GET .../billing/history/payments|ledger`: cursor-paginated evidence history.
- `POST .../billing/semesters`: map term periods to a billing semester.
- `POST .../billing/reconcile`: reconcile existing official registrations; optional cursor.
- `POST .../billing/payments`: idempotent report with explicit allocations.
- `GET /management/billing`: pending queue; cursor-paginated.
- `GET /management/billing/accounts`: institution search with `q`/`cursor`.
- `GET /management/billing/:campusId`: management statement.
- `GET /management/billing/:campusId/history/payments|ledger`: evidence history.
- `POST /management/billing/:campusId/payments/:paymentId/decision`: confirm/reject.
- `POST /management/billing/:campusId/charges/:chargeId/adjustments`: append adjustment.

All endpoints use private response headers and the proper personal or management cookie realm. Writes require the trusted frontend origin and rate limiting. Request bodies/queries reject unexpected fields. Unexpected database failures return a generic retry message rather than SQL or financial internals.

## Validation

- Real PostgreSQL migration from an empty database and migration replay.
- Real service/API authorization, MFA realms, registration/enrolment retry races, term sharing, TVET module/fee separation, bulk and partial allocations, management conflict checks, duplicate settlements, immutable evidence, failed-audit rollback, 30-day due date, late notices, restriction and restoration tests.
- Frontend regression tests for pending-payment behavior, retry-key/input preservation, disabled settled selections and audited MFA adjustments.
- Desktop/mobile browser acceptance covers institution report retries, receipt confirmation with fresh MFA and fee credits. These browser journeys use synthetic API fixtures; PostgreSQL tests exercise real services and database constraints separately.
- Existing Grade School/TVET database fixtures use privileged, isolated cleanup transactions solely to remove synthetic immutable financial evidence. The guarded database runner remains mandatory; never target an application database.
