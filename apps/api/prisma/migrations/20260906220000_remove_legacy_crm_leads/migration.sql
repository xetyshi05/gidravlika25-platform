BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Lead") OR EXISTS (SELECT 1 FROM "LeadNote") THEN
    RAISE EXCEPTION 'Legacy Lead tables contain data; migrate or archive it before removing the legacy CRM module';
  END IF;
END $$;

DROP TABLE "LeadNote";
DROP TABLE "Lead";
DROP TYPE "LeadStatus";

COMMIT;
