-- Database roles (INF-01). Run as a superuser, connected to the application
-- database, before every `prisma migrate deploy`. Idempotent: it creates
-- missing roles, resets their attributes and passwords, and moves objects
-- created by other roles (for example by the former superuser deployment or
-- by pg_restore --no-owner) to db_owner.
--
--   db_owner    NOLOGIN; owns the database, schema public and every object.
--   migrator    LOGIN; every session runs as db_owner, used only by migrations.
--   app_runtime LOGIN; the API. DML only, granted by runtime-grants.sql
--               after migrations, because the tables must exist first.
--
-- Passwords are read from the session settings gidravlika.migrator_password
-- and gidravlika.runtime_password (PGOPTIONS='-c gidravlika.…=…' or
-- set_config), so they never appear in the statement text or server logs.
DO $roles$
DECLARE
  migrator_password text := current_setting('gidravlika.migrator_password', true);
  runtime_password text := current_setting('gidravlika.runtime_password', true);
  statement text;
BEGIN
  IF current_database() IN ('postgres', 'template0', 'template1') THEN
    RAISE EXCEPTION 'Connect to the application database, not %.', current_database();
  END IF;
  IF coalesce(migrator_password, '') !~ '^[A-Za-z0-9_-]{32,}$'
    OR coalesce(runtime_password, '') !~ '^[A-Za-z0-9_-]{32,}$' THEN
    RAISE EXCEPTION 'DB_MIGRATOR_PASSWORD and DB_RUNTIME_PASSWORD must be at least 32 characters of A-Z, a-z, 0-9, "_" or "-".';
  END IF;
  IF migrator_password = runtime_password THEN
    RAISE EXCEPTION 'DB_MIGRATOR_PASSWORD and DB_RUNTIME_PASSWORD must differ.';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'db_owner') THEN
    CREATE ROLE db_owner;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'migrator') THEN
    CREATE ROLE migrator;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime;
  END IF;

  ALTER ROLE db_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  EXECUTE format(
    'ALTER ROLE migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
    migrator_password
  );
  EXECUTE format(
    'ALTER ROLE app_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L',
    runtime_password
  );
  GRANT db_owner TO migrator;
  -- Objects created by migrations belong to db_owner, not to the login role.
  ALTER ROLE migrator SET role = 'db_owner';
  REVOKE db_owner FROM app_runtime;
  REVOKE migrator FROM app_runtime;

  EXECUTE format('ALTER DATABASE %I OWNER TO db_owner', current_database());
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO migrator, app_runtime', current_database());
  ALTER SCHEMA public OWNER TO db_owner;
  REVOKE ALL ON SCHEMA public FROM PUBLIC;
  GRANT USAGE ON SCHEMA public TO app_runtime;

  -- Extension members (pg_trgm) keep their owner. Sequences owned by a column
  -- follow their table.
  FOR statement IN
    SELECT format('ALTER TABLE public.%I OWNER TO db_owner', c.relname)
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind IN ('r', 'p')
      AND c.relowner <> 'db_owner'::regrole
      AND NOT EXISTS (
        SELECT FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
      )
    UNION ALL
    SELECT format('ALTER SEQUENCE public.%I OWNER TO db_owner', c.relname)
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'S'
      AND c.relowner <> 'db_owner'::regrole
      AND NOT EXISTS (
        SELECT FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('a', 'i', 'e')
      )
    UNION ALL
    SELECT format('ALTER TYPE public.%I OWNER TO db_owner', t.typname)
    FROM pg_type t
    WHERE t.typnamespace = 'public'::regnamespace
      AND t.typtype IN ('e', 'd', 'r', 'm')
      AND t.typowner <> 'db_owner'::regrole
      AND NOT EXISTS (
        SELECT FROM pg_depend d
        WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e'
      )
    UNION ALL
    SELECT format('ALTER ROUTINE %s OWNER TO db_owner', p.oid::regprocedure)
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proowner <> 'db_owner'::regrole
      AND NOT EXISTS (
        SELECT FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE statement;
  END LOOP;
END
$roles$;
