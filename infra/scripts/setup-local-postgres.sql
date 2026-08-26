-- Run once against your local PostgreSQL instance (as a superuser) to
-- create the dedicated `nova` role/database used by .env.example's
-- DATABASE_URL=postgresql://nova:nova@localhost:5035/nova_org
--
-- Example (adjust port to match your instance, see postgresql.conf):
--   & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -p 5035 -f infra\scripts\setup-local-postgres.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'nova') THEN
    CREATE ROLE nova LOGIN PASSWORD 'nova';
  END IF;
END
$$;

SELECT 'CREATE DATABASE nova_org OWNER nova'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'nova_org')
\gexec
