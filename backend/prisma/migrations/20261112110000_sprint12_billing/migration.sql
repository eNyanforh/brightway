-- AlterTable
ALTER TABLE "GradeSchoolPeriod" ADD COLUMN     "billingSemesterId" TEXT;

-- CreateTable
CREATE TABLE "BillingAccount" (
    "campusId" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("campusId")
);

-- CreateTable
CREATE TABLE "BillingSemester" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "resumesOn" DATE NOT NULL,

    CONSTRAINT "BillingSemester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingCharge" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "unitKey" VARCHAR(160) NOT NULL,
    "engine" "CampusEngine" NOT NULL,
    "learnerAccountId" TEXT NOT NULL,
    "semesterId" TEXT,
    "schoolRegistrationId" TEXT,
    "tvetEnrolmentId" TEXT,
    "label" VARCHAR(240) NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 100,
    "dueAt" TIMESTAMP(3),
    "noticeAt" TIMESTAMP(3),
    "enforceAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampusPayment" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "inputHash" VARCHAR(64) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reference" VARCHAR(160) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    "settlementReference" VARCHAR(160),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reason" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampusPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampusPaymentAllocation" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "CampusPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAdjustment" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "inputHash" VARCHAR(64) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingLedgerEntry" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "chargeId" TEXT,
    "paymentId" TEXT,
    "adjustmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAudit" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorKind" VARCHAR(16) NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingSemester_campusId_id_key" ON "BillingSemester"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSemester_campusId_name_key" ON "BillingSemester"("campusId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCharge_unitKey_key" ON "BillingCharge"("unitKey");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCharge_schoolRegistrationId_key" ON "BillingCharge"("schoolRegistrationId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCharge_tvetEnrolmentId_key" ON "BillingCharge"("tvetEnrolmentId");

-- CreateIndex
CREATE INDEX "BillingCharge_campusId_createdAt_id_idx" ON "BillingCharge"("campusId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "BillingCharge_engine_dueAt_idx" ON "BillingCharge"("engine", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCharge_campusId_schoolRegistrationId_key" ON "BillingCharge"("campusId", "schoolRegistrationId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCharge_campusId_tvetEnrolmentId_key" ON "BillingCharge"("campusId", "tvetEnrolmentId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCharge_campusId_id_key" ON "BillingCharge"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CampusPayment_requestKey_key" ON "CampusPayment"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "CampusPayment_settlementReference_key" ON "CampusPayment"("settlementReference");

-- CreateIndex
CREATE INDEX "CampusPayment_campusId_createdAt_id_idx" ON "CampusPayment"("campusId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "CampusPayment_status_createdAt_id_idx" ON "CampusPayment"("status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CampusPayment_campusId_id_key" ON "CampusPayment"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CampusPaymentAllocation_paymentId_chargeId_key" ON "CampusPaymentAllocation"("paymentId", "chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAdjustment_requestKey_key" ON "BillingAdjustment"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAdjustment_campusId_id_key" ON "BillingAdjustment"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BillingLedgerEntry_chargeId_key" ON "BillingLedgerEntry"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingLedgerEntry_paymentId_key" ON "BillingLedgerEntry"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingLedgerEntry_adjustmentId_key" ON "BillingLedgerEntry"("adjustmentId");

-- CreateIndex
CREATE INDEX "BillingLedgerEntry_campusId_createdAt_id_idx" ON "BillingLedgerEntry"("campusId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "BillingAudit_campusId_createdAt_id_idx" ON "BillingAudit"("campusId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "GradeSchoolPeriod" ADD CONSTRAINT "GradeSchoolPeriod_campusId_billingSemesterId_fkey" FOREIGN KEY ("campusId", "billingSemesterId") REFERENCES "BillingSemester"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "VirtualCampus"("organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSemester" ADD CONSTRAINT "BillingSemester_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "BillingAccount"("campusId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCharge" ADD CONSTRAINT "BillingCharge_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "BillingAccount"("campusId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCharge" ADD CONSTRAINT "BillingCharge_learnerAccountId_fkey" FOREIGN KEY ("learnerAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCharge" ADD CONSTRAINT "BillingCharge_campusId_semesterId_fkey" FOREIGN KEY ("campusId", "semesterId") REFERENCES "BillingSemester"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCharge" ADD CONSTRAINT "BillingCharge_campusId_schoolRegistrationId_fkey" FOREIGN KEY ("campusId", "schoolRegistrationId") REFERENCES "GradeSchoolRegistration"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCharge" ADD CONSTRAINT "BillingCharge_campusId_tvetEnrolmentId_fkey" FOREIGN KEY ("campusId", "tvetEnrolmentId") REFERENCES "TvetEnrolment"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampusPayment" ADD CONSTRAINT "CampusPayment_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "BillingAccount"("campusId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampusPaymentAllocation" ADD CONSTRAINT "CampusPaymentAllocation_campusId_paymentId_fkey" FOREIGN KEY ("campusId", "paymentId") REFERENCES "CampusPayment"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampusPaymentAllocation" ADD CONSTRAINT "CampusPaymentAllocation_campusId_chargeId_fkey" FOREIGN KEY ("campusId", "chargeId") REFERENCES "BillingCharge"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAdjustment" ADD CONSTRAINT "BillingAdjustment_campusId_chargeId_fkey" FOREIGN KEY ("campusId", "chargeId") REFERENCES "BillingCharge"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLedgerEntry" ADD CONSTRAINT "BillingLedgerEntry_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "BillingAccount"("campusId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLedgerEntry" ADD CONSTRAINT "BillingLedgerEntry_campusId_chargeId_fkey" FOREIGN KEY ("campusId", "chargeId") REFERENCES "BillingCharge"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLedgerEntry" ADD CONSTRAINT "BillingLedgerEntry_campusId_paymentId_fkey" FOREIGN KEY ("campusId", "paymentId") REFERENCES "CampusPayment"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLedgerEntry" ADD CONSTRAINT "BillingLedgerEntry_campusId_adjustmentId_fkey" FOREIGN KEY ("campusId", "adjustmentId") REFERENCES "BillingAdjustment"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAudit" ADD CONSTRAINT "BillingAudit_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "BillingAccount"("campusId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Platform amounts are integer USD cents; institution fees cannot be inserted here.
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_currency_check" CHECK ("currency"='USD');
ALTER TABLE "BillingSemester" ADD CONSTRAINT "BillingSemester_dates_check" CHECK ("endsOn">"startsOn" AND "resumesOn" BETWEEN "startsOn" AND "endsOn");
ALTER TABLE "BillingCharge" ADD CONSTRAINT "BillingCharge_unit_check" CHECK ("amountCents"=100 AND (("engine"='GRADE_SCHOOL' AND "schoolRegistrationId" IS NOT NULL AND "tvetEnrolmentId" IS NULL AND "semesterId" IS NOT NULL AND "dueAt" IS NOT NULL) OR ("engine"='TVET' AND "tvetEnrolmentId" IS NOT NULL AND "schoolRegistrationId" IS NULL AND "semesterId" IS NULL AND "dueAt" IS NULL)));
ALTER TABLE "BillingCharge" ADD CONSTRAINT "BillingCharge_notice_check" CHECK (("noticeAt" IS NULL AND "enforceAt" IS NULL) OR ("engine"='GRADE_SCHOOL' AND "noticeAt" IS NOT NULL AND "enforceAt">="noticeAt" + INTERVAL '7 days' AND "enforceAt">="dueAt"));
ALTER TABLE "CampusPayment" ADD CONSTRAINT "CampusPayment_state_check" CHECK ("amountCents" BETWEEN 1 AND 50000 AND "status" IN ('PENDING','CONFIRMED','REJECTED') AND (("status"='PENDING' AND "decidedAt" IS NULL AND "decidedById" IS NULL AND "reason" IS NULL AND "settlementReference" IS NULL) OR ("status"<>'PENDING' AND "decidedAt" IS NOT NULL AND "decidedById" IS NOT NULL AND length(trim("reason"))>=10 AND (("status"='CONFIRMED')=("settlementReference" IS NOT NULL)))));
ALTER TABLE "CampusPaymentAllocation" ADD CONSTRAINT "CampusPaymentAllocation_amount_check" CHECK ("amountCents" BETWEEN 1 AND 100);
ALTER TABLE "BillingAdjustment" ADD CONSTRAINT "BillingAdjustment_amount_check" CHECK ("amountCents" BETWEEN -100 AND 100 AND "amountCents"<>0 AND length(trim("reason"))>=10);
ALTER TABLE "BillingAudit" ADD CONSTRAINT "BillingAudit_actor_check" CHECK ("actorKind" IN ('ORGANIZATION','MANAGEMENT','SYSTEM'));
ALTER TABLE "BillingLedgerEntry" ADD CONSTRAINT "BillingLedgerEntry_source_check" CHECK (("kind"='CHARGE' AND "chargeId" IS NOT NULL AND "paymentId" IS NULL AND "adjustmentId" IS NULL AND "amountCents"=100) OR ("kind"='PAYMENT' AND "paymentId" IS NOT NULL AND "chargeId" IS NULL AND "adjustmentId" IS NULL AND "amountCents"<0) OR ("kind"='ADJUSTMENT' AND "adjustmentId" IS NOT NULL AND "chargeId" IS NULL AND "paymentId" IS NULL AND "amountCents"<>0));

CREATE FUNCTION "billing_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Billing financial evidence is immutable; append an adjustment'; END $$;
CREATE TRIGGER "BillingLedgerEntry_immutable" BEFORE UPDATE ON "BillingLedgerEntry" FOR EACH ROW EXECUTE FUNCTION "billing_immutable"();
CREATE TRIGGER "BillingAdjustment_immutable" BEFORE UPDATE ON "BillingAdjustment" FOR EACH ROW EXECUTE FUNCTION "billing_immutable"();
CREATE TRIGGER "CampusPaymentAllocation_immutable" BEFORE UPDATE ON "CampusPaymentAllocation" FOR EACH ROW EXECUTE FUNCTION "billing_immutable"();
CREATE TRIGGER "BillingAudit_immutable" BEFORE UPDATE ON "BillingAudit" FOR EACH ROW EXECUTE FUNCTION "billing_immutable"();
CREATE TRIGGER "BillingSemester_immutable" BEFORE UPDATE ON "BillingSemester" FOR EACH ROW EXECUTE FUNCTION "billing_immutable"();
CREATE FUNCTION "billing_charge_integrity"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected TEXT; account_id TEXT; semester_id TEXT; due TIMESTAMP;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-'noticeAt'-'enforceAt') IS DISTINCT FROM (to_jsonb(OLD)-'noticeAt'-'enforceAt') THEN RAISE EXCEPTION 'Original platform charge is immutable'; END IF;
  RETURN NEW;
 END IF;
 IF NEW."engine"='GRADE_SCHOOL' THEN
  SELECT 'school:'||r."studentId"||':'||p."billingSemesterId",s."accountId",p."billingSemesterId",b."resumesOn" + INTERVAL '30 days' INTO expected,account_id,semester_id,due
  FROM "GradeSchoolRegistration" r JOIN "GradeSchoolStudent" s ON s."id"=r."studentId" JOIN "GradeSchoolPeriod" p ON p."id"=r."periodId" JOIN "BillingSemester" b ON b."id"=p."billingSemesterId" WHERE r."id"=NEW."schoolRegistrationId" AND r."campusId"=NEW."campusId";
  IF NEW."semesterId" IS DISTINCT FROM semester_id OR NEW."dueAt" IS DISTINCT FROM due THEN RAISE EXCEPTION 'Invalid registration semester or payment window'; END IF;
 ELSE
  SELECT 'tvet:'||e."learnerId"||':'||e."programId"||':'||e."intakeId",l."accountId" INTO expected,account_id FROM "TvetEnrolment" e JOIN "TvetLearner" l ON l."id"=e."learnerId" WHERE e."id"=NEW."tvetEnrolmentId" AND e."campusId"=NEW."campusId";
 END IF;
 IF expected IS NULL OR NEW."unitKey"<>expected OR NEW."learnerAccountId"<>account_id THEN RAISE EXCEPTION 'Platform charge does not match official registration'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "BillingCharge_integrity" BEFORE INSERT OR UPDATE ON "BillingCharge" FOR EACH ROW EXECUTE FUNCTION "billing_charge_integrity"();
CREATE FUNCTION "billing_payment_lock"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD."status"<>'PENDING' OR (to_jsonb(NEW)-'status'-'settlementReference'-'decidedById'-'decidedAt'-'reason') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'settlementReference'-'decidedById'-'decidedAt'-'reason') THEN RAISE EXCEPTION 'Payment evidence is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "CampusPayment_immutable" BEFORE UPDATE ON "CampusPayment" FOR EACH ROW EXECUTE FUNCTION "billing_payment_lock"();
CREATE FUNCTION "billing_allocation_lock"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM 1 FROM "CampusPayment" WHERE "id"=NEW."paymentId" AND "status"='PENDING' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only pending payments accept allocation instructions'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER "CampusPaymentAllocation_pending" BEFORE INSERT ON "CampusPaymentAllocation" FOR EACH ROW EXECUTE FUNCTION "billing_allocation_lock"();
-- Deferred constraints validate complete atomic writes, including direct SQL paths.
CREATE FUNCTION "billing_payment_balance"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p RECORD; total BIGINT; ledger BIGINT;
BEGIN
 SELECT * INTO p FROM "CampusPayment" WHERE "id"=NEW."id";
 SELECT COALESCE(sum("amountCents"),0) INTO total FROM "CampusPaymentAllocation" WHERE "paymentId"=p."id";
 SELECT COALESCE(sum("amountCents"),0) INTO ledger FROM "BillingLedgerEntry" WHERE "paymentId"=p."id";
 IF total<>p."amountCents" OR (p."status"='CONFIRMED' AND ledger<>-p."amountCents") OR (p."status"<>'CONFIRMED' AND ledger<>0) THEN RAISE EXCEPTION 'Payment, allocations and ledger do not reconcile'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "CampusPayment_balance" AFTER INSERT OR UPDATE ON "CampusPayment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "billing_payment_balance"();
CREATE FUNCTION "billing_charge_balance"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid TEXT; original INT; adjusted BIGINT; paid BIGINT;
BEGIN
 IF TG_TABLE_NAME='BillingCharge' THEN cid=NEW."id"; ELSE cid=NEW."chargeId"; END IF;
 SELECT "amountCents" INTO original FROM "BillingCharge" WHERE "id"=cid FOR UPDATE;
 SELECT COALESCE(sum("amountCents"),0) INTO adjusted FROM "BillingAdjustment" WHERE "chargeId"=cid;
 SELECT COALESCE(sum(a."amountCents"),0) INTO paid FROM "CampusPaymentAllocation" a JOIN "CampusPayment" p ON p."id"=a."paymentId" WHERE a."chargeId"=cid AND p."status"='CONFIRMED';
 IF original+adjusted<paid OR original+adjusted>100 THEN RAISE EXCEPTION 'Platform charge cannot be overpaid or increased above US$1'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "BillingCharge_balance" AFTER INSERT ON "BillingCharge" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "billing_charge_balance"();
CREATE CONSTRAINT TRIGGER "BillingAdjustment_balance" AFTER INSERT ON "BillingAdjustment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "billing_charge_balance"();
CREATE CONSTRAINT TRIGGER "CampusPaymentAllocation_balance" AFTER INSERT ON "CampusPaymentAllocation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "billing_charge_balance"();
-- Confirming an existing payment must recheck each affected charge too.
CREATE FUNCTION "billing_confirmation_balance"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a RECORD; total BIGINT; paid BIGINT;
BEGIN
 IF NEW."status"='CONFIRMED' THEN
  FOR a IN SELECT "chargeId" FROM "CampusPaymentAllocation" WHERE "paymentId"=NEW."id" ORDER BY "chargeId" LOOP
   PERFORM 1 FROM "BillingCharge" WHERE "id"=a."chargeId" FOR UPDATE;
   SELECT c."amountCents"+COALESCE((SELECT SUM(x."amountCents") FROM "BillingAdjustment" x WHERE x."chargeId"=c."id"),0) INTO total FROM "BillingCharge" c WHERE c."id"=a."chargeId";
   SELECT COALESCE(sum(x."amountCents"),0) INTO paid FROM "CampusPaymentAllocation" x JOIN "CampusPayment" p ON p."id"=x."paymentId" WHERE x."chargeId"=a."chargeId" AND p."status"='CONFIRMED';
   IF paid>total THEN RAISE EXCEPTION 'Confirmed allocations exceed the registration fee'; END IF;
  END LOOP;
 END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "CampusPayment_confirmation_balance" AFTER UPDATE ON "CampusPayment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "billing_confirmation_balance"();
CREATE FUNCTION "billing_ledger_source"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE amount INT;
BEGIN
 IF NEW."kind"='CHARGE' THEN SELECT "amountCents" INTO amount FROM "BillingCharge" WHERE "id"=NEW."chargeId";
 ELSIF NEW."kind"='PAYMENT' THEN SELECT -"amountCents" INTO amount FROM "CampusPayment" WHERE "id"=NEW."paymentId";
 ELSE SELECT "amountCents" INTO amount FROM "BillingAdjustment" WHERE "id"=NEW."adjustmentId"; END IF;
 IF amount IS NULL OR amount<>NEW."amountCents" THEN RAISE EXCEPTION 'Ledger entry must match source evidence'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER "BillingLedgerEntry_source" BEFORE INSERT ON "BillingLedgerEntry" FOR EACH ROW EXECUTE FUNCTION "billing_ledger_source"();
CREATE FUNCTION "billing_ledger_complete"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE amount INT; entry INT; state TEXT;
BEGIN
 IF TG_TABLE_NAME='BillingCharge' THEN
  SELECT "amountCents" INTO entry FROM "BillingLedgerEntry" WHERE "chargeId"=NEW."id";
  IF entry IS DISTINCT FROM NEW."amountCents" THEN RAISE EXCEPTION 'Charge requires matching ledger evidence'; END IF;
 ELSIF TG_TABLE_NAME='BillingAdjustment' THEN
  SELECT "amountCents" INTO entry FROM "BillingLedgerEntry" WHERE "adjustmentId"=NEW."id";
  IF entry IS DISTINCT FROM NEW."amountCents" THEN RAISE EXCEPTION 'Adjustment requires matching ledger evidence'; END IF;
 ELSIF NEW."kind"='PAYMENT' THEN
  SELECT "status" INTO state FROM "CampusPayment" WHERE "id"=NEW."paymentId";
  IF state IS DISTINCT FROM 'CONFIRMED' THEN RAISE EXCEPTION 'Only confirmed payments have ledger entries'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "BillingCharge_ledger_complete" AFTER INSERT ON "BillingCharge" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "billing_ledger_complete"();
CREATE CONSTRAINT TRIGGER "BillingAdjustment_ledger_complete" AFTER INSERT ON "BillingAdjustment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "billing_ledger_complete"();
CREATE CONSTRAINT TRIGGER "BillingLedgerEntry_complete" AFTER INSERT ON "BillingLedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "billing_ledger_complete"();
-- No application role may remove financial evidence. Isolated test cleanup uses
-- a privileged fixture transaction; production exposes no delete operation.
CREATE TRIGGER "BillingCharge_no_delete" BEFORE DELETE ON "BillingCharge" FOR EACH ROW EXECUTE FUNCTION "billing_immutable"();
CREATE TRIGGER "CampusPayment_no_delete" BEFORE DELETE ON "CampusPayment" FOR EACH ROW EXECUTE FUNCTION "billing_immutable"();
CREATE TRIGGER "CampusPaymentAllocation_no_delete" BEFORE DELETE ON "CampusPaymentAllocation" FOR EACH ROW EXECUTE FUNCTION "billing_immutable"();
CREATE TRIGGER "BillingAdjustment_no_delete" BEFORE DELETE ON "BillingAdjustment" FOR EACH ROW EXECUTE FUNCTION "billing_immutable"();
CREATE TRIGGER "BillingLedgerEntry_no_delete" BEFORE DELETE ON "BillingLedgerEntry" FOR EACH ROW EXECUTE FUNCTION "billing_immutable"();
CREATE TRIGGER "BillingAudit_no_delete" BEFORE DELETE ON "BillingAudit" FOR EACH ROW EXECUTE FUNCTION "billing_immutable"();
CREATE FUNCTION "billing_period_mapping_lock"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."billingSemesterId" IS DISTINCT FROM OLD."billingSemesterId" AND EXISTS(SELECT 1 FROM "BillingCharge" WHERE "semesterId"=OLD."billingSemesterId") THEN RAISE EXCEPTION 'Charged semester mapping is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER "GradeSchoolPeriod_billing_mapping" BEFORE UPDATE ON "GradeSchoolPeriod" FOR EACH ROW EXECUTE FUNCTION "billing_period_mapping_lock"();
