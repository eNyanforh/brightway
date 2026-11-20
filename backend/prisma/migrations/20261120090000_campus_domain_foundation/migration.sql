BEGIN;

-- Never merge or remove institutional records to repair unexpected schema/data drift.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "VirtualCampus" GROUP BY "organizationId" HAVING count(*) > 1) THEN
  RAISE EXCEPTION 'Campus migration stopped: duplicate organization Campus identities. Reconcile explicitly; no records were deleted.';
 END IF;
 IF EXISTS (SELECT 1 FROM "VirtualCampus" c LEFT JOIN "Organization" o ON o.id=c."organizationId" WHERE o.id IS NULL) THEN
  RAISE EXCEPTION 'Campus migration stopped: orphan Campus organization. Repair the relationship before retrying.';
 END IF;
 IF EXISTS (SELECT 1 FROM "AdmissionCycle" c JOIN "Program" p ON p.id=c."programId" WHERE c."organizationId"<>p."organizationId")
 OR EXISTS (SELECT 1 FROM "TvetProgram" t JOIN "Program" p ON p.id=t."discoverProgramId" WHERE t."campusId"<>p."organizationId") THEN
  RAISE EXCEPTION 'Campus migration stopped: cross-organization Discover/admission program relationship. No records were changed.';
 END IF;
 IF EXISTS (SELECT 1 FROM "GradeSchoolRegistration" r JOIN "GradeSchoolStudent" s ON s.id=r."studentId" JOIN "AdmissionApplication" a ON a.id=r."admissionId" JOIN "AdmissionCycle" c ON c.id=a."cycleId" WHERE r."campusId"<>c."organizationId" OR s."accountId"<>a."applicantId")
 OR EXISTS (SELECT 1 FROM "TvetEnrolment" r JOIN "TvetLearner" s ON s.id=r."learnerId" JOIN "AdmissionApplication" a ON a.id=r."admissionId" JOIN "AdmissionCycle" c ON c.id=a."cycleId" WHERE r."campusId"<>c."organizationId" OR s."accountId"<>a."applicantId") THEN
  RAISE EXCEPTION 'Campus migration stopped: admission belongs to another institution or learner. Repair explicitly; historical records are retained.';
 END IF;
END $$;

CREATE TYPE "CampusConfigurationStatus" AS ENUM ('NOT_CONFIGURED','CONFIGURING','READY','REVIEW_REQUIRED');
CREATE TYPE "CampusPermissionScope" AS ENUM ('CAMPUS','GRADE_SCHOOL','TVET');
ALTER TABLE "VirtualCampus" ADD COLUMN "configurationStatus" "CampusConfigurationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED';
-- Preserve incomplete legacy records and activation timestamps; never invent history.
UPDATE "VirtualCampus" SET "configurationStatus" = CASE
 WHEN length(trim("displayName"))=0 OR ("status" IN ('ACTIVE','PAUSED') AND "activatedAt" IS NULL)
 THEN 'REVIEW_REQUIRED'::"CampusConfigurationStatus" ELSE 'READY'::"CampusConfigurationStatus" END;
ALTER TABLE "VirtualCampus" ADD CONSTRAINT "VirtualCampus_version_check" CHECK ("version">0);
CREATE TABLE "CampusEngineConfiguration" (
 "campusId" TEXT NOT NULL, "engine" "CampusEngine" NOT NULL,
 "status" "CampusConfigurationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
 "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version">0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "CampusEngineConfiguration_pkey" PRIMARY KEY ("campusId","engine"),
 CONSTRAINT "CampusEngineConfiguration_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "VirtualCampus"("organizationId") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Engine academic readiness cannot be inferred from the old single Campus status.
INSERT INTO "CampusEngineConfiguration" ("campusId","engine","status","updatedAt")
 SELECT c."organizationId", e, 'REVIEW_REQUIRED', CURRENT_TIMESTAMP FROM "VirtualCampus" c CROSS JOIN LATERAL unnest(c."enabledEngines") e;
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_id_key" ON "OrganizationMembership"("organizationId","id");
CREATE TABLE "CampusPermissionGrant" (
 "campusId" TEXT NOT NULL, "membershipId" TEXT NOT NULL, "scope" "CampusPermissionScope" NOT NULL,
 "permission" VARCHAR(80) NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
 "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version">0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "CampusPermissionGrant_pkey" PRIMARY KEY ("campusId","membershipId","scope","permission"),
 CONSTRAINT "CampusPermissionGrant_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "VirtualCampus"("organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "CampusPermissionGrant_campusId_membershipId_fkey" FOREIGN KEY ("campusId","membershipId") REFERENCES "OrganizationMembership"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "CampusPermissionGrant_scope_check" CHECK (
  ("scope"='CAMPUS' AND "permission" IN ('organization.campus.manage','organization.campus.announcements.manage','organization.campus.billing.manage')) OR
  ("scope" IN ('GRADE_SCHOOL','TVET') AND "permission" IN ('organization.campus.academics.manage','organization.campus.teach'))
 )
);
ALTER TABLE "VirtualCampusAudit" ADD COLUMN "campusVersion" INTEGER;
ALTER TABLE "VirtualCampusAudit" ADD CONSTRAINT "VirtualCampusAudit_version_check" CHECK ("campusVersion" IS NULL OR "campusVersion">0);
-- Legacy events remain unchanged. New versioned domain transitions get one event each.
CREATE UNIQUE INDEX "VirtualCampusAudit_campusId_campusVersion_key" ON "VirtualCampusAudit"("campusId","campusVersion");

CREATE UNIQUE INDEX "Program_organizationId_id_key" ON "Program"("organizationId","id");
ALTER TABLE "AdmissionCycle" DROP CONSTRAINT "AdmissionCycle_programId_fkey";
ALTER TABLE "AdmissionCycle" ADD CONSTRAINT "AdmissionCycle_organizationId_programId_fkey" FOREIGN KEY ("organizationId","programId") REFERENCES "Program"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TvetProgram" DROP CONSTRAINT "TvetProgram_discoverProgramId_fkey";
ALTER TABLE "TvetProgram" ADD CONSTRAINT "TvetProgram_campusId_discoverProgramId_fkey" FOREIGN KEY ("campusId","discoverProgramId") REFERENCES "Program"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "GradeSchoolSubject" r JOIN "VirtualCampus" c ON c."organizationId"=r."campusId" WHERE NOT ('GRADE_SCHOOL'::"CampusEngine"=ANY(c."enabledEngines"))) THEN
  RAISE EXCEPTION 'Campus migration stopped: GradeSchoolSubject records exist without the corresponding enabled engine. Review explicitly; no engine was silently enabled.';
 END IF;
END $$;
ALTER TABLE "GradeSchoolSubject" ADD COLUMN "engine" "CampusEngine" NOT NULL DEFAULT 'GRADE_SCHOOL';
ALTER TABLE "GradeSchoolSubject" ADD CONSTRAINT "GradeSchoolSubject_engine_check" CHECK ("engine"='GRADE_SCHOOL');
ALTER TABLE "GradeSchoolSubject" ADD CONSTRAINT "GradeSchoolSubject_campusId_engine_fkey" FOREIGN KEY ("campusId","engine") REFERENCES "CampusEngineConfiguration"("campusId","engine") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "GradeSchoolClass" r JOIN "VirtualCampus" c ON c."organizationId"=r."campusId" WHERE NOT ('GRADE_SCHOOL'::"CampusEngine"=ANY(c."enabledEngines"))) THEN
  RAISE EXCEPTION 'Campus migration stopped: GradeSchoolClass records exist without the corresponding enabled engine. Review explicitly; no engine was silently enabled.';
 END IF;
END $$;
ALTER TABLE "GradeSchoolClass" ADD COLUMN "engine" "CampusEngine" NOT NULL DEFAULT 'GRADE_SCHOOL';
ALTER TABLE "GradeSchoolClass" ADD CONSTRAINT "GradeSchoolClass_engine_check" CHECK ("engine"='GRADE_SCHOOL');
ALTER TABLE "GradeSchoolClass" ADD CONSTRAINT "GradeSchoolClass_campusId_engine_fkey" FOREIGN KEY ("campusId","engine") REFERENCES "CampusEngineConfiguration"("campusId","engine") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "GradeSchoolYear" r JOIN "VirtualCampus" c ON c."organizationId"=r."campusId" WHERE NOT ('GRADE_SCHOOL'::"CampusEngine"=ANY(c."enabledEngines"))) THEN
  RAISE EXCEPTION 'Campus migration stopped: GradeSchoolYear records exist without the corresponding enabled engine. Review explicitly; no engine was silently enabled.';
 END IF;
END $$;
ALTER TABLE "GradeSchoolYear" ADD COLUMN "engine" "CampusEngine" NOT NULL DEFAULT 'GRADE_SCHOOL';
ALTER TABLE "GradeSchoolYear" ADD CONSTRAINT "GradeSchoolYear_engine_check" CHECK ("engine"='GRADE_SCHOOL');
ALTER TABLE "GradeSchoolYear" ADD CONSTRAINT "GradeSchoolYear_campusId_engine_fkey" FOREIGN KEY ("campusId","engine") REFERENCES "CampusEngineConfiguration"("campusId","engine") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "GradeSchoolStudent" r JOIN "VirtualCampus" c ON c."organizationId"=r."campusId" WHERE NOT ('GRADE_SCHOOL'::"CampusEngine"=ANY(c."enabledEngines"))) THEN
  RAISE EXCEPTION 'Campus migration stopped: GradeSchoolStudent records exist without the corresponding enabled engine. Review explicitly; no engine was silently enabled.';
 END IF;
END $$;
ALTER TABLE "GradeSchoolStudent" ADD COLUMN "engine" "CampusEngine" NOT NULL DEFAULT 'GRADE_SCHOOL';
ALTER TABLE "GradeSchoolStudent" ADD CONSTRAINT "GradeSchoolStudent_engine_check" CHECK ("engine"='GRADE_SCHOOL');
ALTER TABLE "GradeSchoolStudent" ADD CONSTRAINT "GradeSchoolStudent_campusId_engine_fkey" FOREIGN KEY ("campusId","engine") REFERENCES "CampusEngineConfiguration"("campusId","engine") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "TvetProgram" r JOIN "VirtualCampus" c ON c."organizationId"=r."campusId" WHERE NOT ('TVET'::"CampusEngine"=ANY(c."enabledEngines"))) THEN
  RAISE EXCEPTION 'Campus migration stopped: TvetProgram records exist without the corresponding enabled engine. Review explicitly; no engine was silently enabled.';
 END IF;
END $$;
ALTER TABLE "TvetProgram" ADD COLUMN "engine" "CampusEngine" NOT NULL DEFAULT 'TVET';
ALTER TABLE "TvetProgram" ADD CONSTRAINT "TvetProgram_engine_check" CHECK ("engine"='TVET');
ALTER TABLE "TvetProgram" ADD CONSTRAINT "TvetProgram_campusId_engine_fkey" FOREIGN KEY ("campusId","engine") REFERENCES "CampusEngineConfiguration"("campusId","engine") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "TvetLearner" r JOIN "VirtualCampus" c ON c."organizationId"=r."campusId" WHERE NOT ('TVET'::"CampusEngine"=ANY(c."enabledEngines"))) THEN
  RAISE EXCEPTION 'Campus migration stopped: TvetLearner records exist without the corresponding enabled engine. Review explicitly; no engine was silently enabled.';
 END IF;
END $$;
ALTER TABLE "TvetLearner" ADD COLUMN "engine" "CampusEngine" NOT NULL DEFAULT 'TVET';
ALTER TABLE "TvetLearner" ADD CONSTRAINT "TvetLearner_engine_check" CHECK ("engine"='TVET');
ALTER TABLE "TvetLearner" ADD CONSTRAINT "TvetLearner_campusId_engine_fkey" FOREIGN KEY ("campusId","engine") REFERENCES "CampusEngineConfiguration"("campusId","engine") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Two representations must agree at COMMIT, allowing atomic Campus + engine creation.
CREATE FUNCTION campus_engine_set_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid TEXT; selected "CampusEngine"[]; configured "CampusEngine"[];
BEGIN
 IF TG_TABLE_NAME='VirtualCampus' THEN cid:=NEW."organizationId";
 ELSIF TG_OP='DELETE' THEN cid:=OLD."campusId"; ELSE cid:=NEW."campusId"; END IF;
 SELECT "enabledEngines" INTO selected FROM "VirtualCampus" WHERE "organizationId"=cid;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT array_agg("engine" ORDER BY "engine") INTO configured FROM "CampusEngineConfiguration" WHERE "campusId"=cid;
 IF selected IS DISTINCT FROM configured THEN RAISE EXCEPTION 'Campus engine configuration must match enabled engines' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "VirtualCampus_engine_set" AFTER INSERT OR UPDATE ON "VirtualCampus" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION campus_engine_set_integrity();
CREATE CONSTRAINT TRIGGER "CampusEngineConfiguration_engine_set" AFTER INSERT OR UPDATE OR DELETE ON "CampusEngineConfiguration" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION campus_engine_set_integrity();

CREATE FUNCTION campus_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND (NEW."organizationId"<>OLD."organizationId" OR NEW."engine"<>OLD."engine" OR NOT OLD."enabledEngines"<@NEW."enabledEngines") THEN
  RAISE EXCEPTION 'Campus identity and legacy engine are immutable; enabled engines may only be added' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' OR (NEW."status"='ACTIVE' AND OLD."status" IS DISTINCT FROM NEW."status") THEN
  IF NOT EXISTS (SELECT 1 FROM "Organization" o JOIN "OrganizationRequest" r ON r.id=o."requestId"
    WHERE o.id=NEW."organizationId" AND o.status='ACTIVE' AND r.status='APPROVED' AND o."verifiedAt" IS NOT NULL
    AND (o.type='SCHOOL' OR o."offersTraining")
    AND EXISTS (SELECT 1 FROM "OrganizationOperatingLocation" l WHERE l."organizationId"=o.id AND l."countryCode"='LR' AND l."verifiedAt" IS NOT NULL)
    AND EXISTS (SELECT 1 FROM "ProductAvailability" p WHERE p.product='VIRTUAL_CAMPUS' AND p."countryCode"='LR' AND p.enabled)) THEN
   RAISE EXCEPTION 'An eligible verified organization and Liberia operation are required' USING ERRCODE='23514';
  END IF;
  IF NEW."status"='ACTIVE' AND NEW."configurationStatus"<>'READY' THEN RAISE EXCEPTION 'Essential Campus configuration is not ready' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "VirtualCampus_identity_guard" BEFORE INSERT OR UPDATE ON "VirtualCampus" FOR EACH ROW EXECUTE FUNCTION campus_identity_guard();

CREATE FUNCTION campus_scoped_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."campusId"<>OLD."campusId" THEN RAISE EXCEPTION 'Institutional records cannot be moved to another Campus' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION campus_engine_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."engine"<>OLD."engine" THEN RAISE EXCEPTION 'Academic engine identity is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "CampusEngineConfiguration_identity" BEFORE UPDATE ON "CampusEngineConfiguration" FOR EACH ROW EXECUTE FUNCTION campus_engine_identity_guard();
CREATE FUNCTION campus_grant_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.scope<>'CAMPUS' AND NOT EXISTS (SELECT 1 FROM "CampusEngineConfiguration" WHERE "campusId"=NEW."campusId" AND "engine"::text=NEW.scope::text) THEN
  RAISE EXCEPTION 'Permission scope requires an enabled Campus engine' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND (NEW."membershipId"<>OLD."membershipId" OR NEW.scope<>OLD.scope OR NEW.permission<>OLD.permission) THEN
  RAISE EXCEPTION 'Permission identity is immutable; revoke the old grant instead' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "CampusPermissionGrant_guard" BEFORE INSERT OR UPDATE ON "CampusPermissionGrant" FOR EACH ROW EXECUTE FUNCTION campus_grant_guard();

CREATE FUNCTION campus_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Campus audit history is immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER "VirtualCampusAudit_immutable" BEFORE UPDATE OR DELETE ON "VirtualCampusAudit" FOR EACH ROW EXECUTE FUNCTION campus_audit_immutable();

-- Admissions remain their own global learning domain. These checks close its
-- previously single-column links into the tenant-scoped academic domain.
CREATE FUNCTION campus_admission_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id TEXT; learner_id TEXT; applicant_id TEXT;
BEGIN
 IF NEW."admissionId" IS NULL THEN RETURN NEW; END IF;
 SELECT c."organizationId",a."applicantId" INTO owner_id,applicant_id FROM "AdmissionApplication" a JOIN "AdmissionCycle" c ON c.id=a."cycleId" WHERE a.id=NEW."admissionId" FOR SHARE OF a,c;
 IF TG_TABLE_NAME='GradeSchoolRegistration' THEN SELECT "accountId" INTO learner_id FROM "GradeSchoolStudent" WHERE id=NEW."studentId";
 ELSE SELECT "accountId" INTO learner_id FROM "TvetLearner" WHERE id=NEW."learnerId"; END IF;
 IF owner_id IS DISTINCT FROM NEW."campusId" OR applicant_id IS DISTINCT FROM learner_id THEN
  RAISE EXCEPTION 'Admission must belong to the same institution and learner' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "GradeSchoolRegistration_admission_scope" BEFORE INSERT OR UPDATE ON "GradeSchoolRegistration" FOR EACH ROW EXECUTE FUNCTION campus_admission_integrity();
CREATE TRIGGER "TvetEnrolment_admission_scope" BEFORE INSERT OR UPDATE ON "TvetEnrolment" FOR EACH ROW EXECUTE FUNCTION campus_admission_integrity();
CREATE FUNCTION campus_admission_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."cycleId"<>OLD."cycleId" OR NEW."applicantId"<>OLD."applicantId" THEN RAISE EXCEPTION 'Admission application ownership is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "AdmissionApplication_identity_guard" BEFORE UPDATE ON "AdmissionApplication" FOR EACH ROW EXECUTE FUNCTION campus_admission_identity_guard();
CREATE FUNCTION campus_organization_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."organizationId"<>OLD."organizationId" THEN RAISE EXCEPTION 'Organization ownership is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Program_organization_guard" BEFORE UPDATE ON "Program" FOR EACH ROW EXECUTE FUNCTION campus_organization_identity_guard();
CREATE TRIGGER "AdmissionCycle_organization_guard" BEFORE UPDATE ON "AdmissionCycle" FOR EACH ROW EXECUTE FUNCTION campus_organization_identity_guard();
CREATE TRIGGER "CampusAnnouncement_campus_identity" BEFORE UPDATE ON "CampusAnnouncement" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "CampusEngineConfiguration_campus_identity" BEFORE UPDATE ON "CampusEngineConfiguration" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "CampusPermissionGrant_campus_identity" BEFORE UPDATE ON "CampusPermissionGrant" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "GradeSchoolSubject_campus_identity" BEFORE UPDATE ON "GradeSchoolSubject" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "GradeSchoolClass_campus_identity" BEFORE UPDATE ON "GradeSchoolClass" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "GradeSchoolSection_campus_identity" BEFORE UPDATE ON "GradeSchoolSection" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "GradeSchoolYear_campus_identity" BEFORE UPDATE ON "GradeSchoolYear" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "GradeSchoolPeriod_campus_identity" BEFORE UPDATE ON "GradeSchoolPeriod" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "GradeSchoolOffering_campus_identity" BEFORE UPDATE ON "GradeSchoolOffering" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "GradeSchoolStudent_campus_identity" BEFORE UPDATE ON "GradeSchoolStudent" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "GradeSchoolRegistration_campus_identity" BEFORE UPDATE ON "GradeSchoolRegistration" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "GradeSchoolElective_campus_identity" BEFORE UPDATE ON "GradeSchoolElective" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "GradeSchoolGuardian_campus_identity" BEFORE UPDATE ON "GradeSchoolGuardian" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "GradeSchoolSchedule_campus_identity" BEFORE UPDATE ON "GradeSchoolSchedule" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "GradeSchoolAttendance_campus_identity" BEFORE UPDATE ON "GradeSchoolAttendance" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "GradeSchoolAttendanceRecord_campus_identity" BEFORE UPDATE ON "GradeSchoolAttendanceRecord" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "GradeSchoolAssessment_campus_identity" BEFORE UPDATE ON "GradeSchoolAssessment" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "GradeSchoolScore_campus_identity" BEFORE UPDATE ON "GradeSchoolScore" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "TvetProgram_campus_identity" BEFORE UPDATE ON "TvetProgram" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "TvetIntake_campus_identity" BEFORE UPDATE ON "TvetIntake" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "TvetSection_campus_identity" BEFORE UPDATE ON "TvetSection" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "TvetModule_campus_identity" BEFORE UPDATE ON "TvetModule" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "TvetAssignment_campus_identity" BEFORE UPDATE ON "TvetAssignment" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "TvetLearner_campus_identity" BEFORE UPDATE ON "TvetLearner" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "TvetEnrolment_campus_identity" BEFORE UPDATE ON "TvetEnrolment" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "TvetSupporter_campus_identity" BEFORE UPDATE ON "TvetSupporter" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "TvetSchedule_campus_identity" BEFORE UPDATE ON "TvetSchedule" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "TvetAttendance_campus_identity" BEFORE UPDATE ON "TvetAttendance" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "TvetAttendanceRecord_campus_identity" BEFORE UPDATE ON "TvetAttendanceRecord" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "TvetAssessment_campus_identity" BEFORE UPDATE ON "TvetAssessment" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "TvetResult_campus_identity" BEFORE UPDATE ON "TvetResult" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "TvetCertificate_campus_identity" BEFORE UPDATE ON "TvetCertificate" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "BillingAccount_campus_identity" BEFORE UPDATE ON "BillingAccount" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "BillingSemester_campus_identity" BEFORE UPDATE ON "BillingSemester" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "BillingCharge_campus_identity" BEFORE UPDATE ON "BillingCharge" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "CampusPayment_campus_identity" BEFORE UPDATE ON "CampusPayment" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "CampusPaymentAllocation_campus_identity" BEFORE UPDATE ON "CampusPaymentAllocation" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "BillingAdjustment_campus_identity" BEFORE UPDATE ON "BillingAdjustment" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "BillingLedgerEntry_campus_identity" BEFORE UPDATE ON "BillingLedgerEntry" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();
CREATE TRIGGER "BillingAudit_campus_identity" BEFORE UPDATE ON "BillingAudit" FOR EACH ROW EXECUTE FUNCTION campus_scoped_identity_guard();

CREATE FUNCTION campus_learner_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."accountId"<>OLD."accountId" THEN RAISE EXCEPTION 'Learner identity is immutable; preserve historical admission and academic ownership' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "GradeSchoolStudent_identity_guard" BEFORE UPDATE ON "GradeSchoolStudent" FOR EACH ROW EXECUTE FUNCTION campus_learner_identity_guard();
CREATE TRIGGER "TvetLearner_identity_guard" BEFORE UPDATE ON "TvetLearner" FOR EACH ROW EXECUTE FUNCTION campus_learner_identity_guard();
COMMIT;
