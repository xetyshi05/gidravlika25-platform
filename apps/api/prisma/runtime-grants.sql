-- Privileges of the API role (INF-01). Run by migrator (as db_owner) right
-- after `prisma migrate deploy`, so tables created by new migrations are
-- covered. Idempotent. app_runtime gets DML only: no DDL, TRUNCATE, triggers,
-- references or access to the migration history.
BEGIN;
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM app_runtime;
REVOKE ALL ON TABLE public."_prisma_migrations" FROM app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
REVOKE UPDATE ON ALL SEQUENCES IN SCHEMA public FROM app_runtime;
COMMIT;
