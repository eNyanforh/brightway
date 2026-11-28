-- Additive: retain the single Campus identity, legacy engine and all records.
ALTER TABLE "VirtualCampus" ADD COLUMN "enabledEngines" "CampusEngine"[];
UPDATE "VirtualCampus" SET "enabledEngines" = ARRAY["engine"];
ALTER TABLE "VirtualCampus" ALTER COLUMN "enabledEngines" SET NOT NULL;

-- Exactly one or both engines in canonical order; never empty or duplicated.
ALTER TABLE "VirtualCampus" ADD CONSTRAINT "VirtualCampus_enabledEngines_check"
  CHECK ("enabledEngines" IN (
    ARRAY['GRADE_SCHOOL']::"CampusEngine"[],
    ARRAY['TVET']::"CampusEngine"[],
    ARRAY['GRADE_SCHOOL', 'TVET']::"CampusEngine"[]
  ) AND "engine" = ANY("enabledEngines"));
