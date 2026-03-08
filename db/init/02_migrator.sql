-- db/init/02_migrator.sql
-- Role separada para migrations (sem superuser/bypassrls), com CREATE no schema.
-- IMPORTANT: default privileges FOR ROLE crm_migrator para que crm_app consiga ler/escrever nas tabelas criadas.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_migrator') THEN
    CREATE ROLE crm_migrator LOGIN PASSWORD 'crm_migrator_pass';
  END IF;
END $$;

ALTER ROLE crm_migrator NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

GRANT CONNECT ON DATABASE crm TO crm_migrator;
GRANT USAGE ON SCHEMA public TO crm_migrator;
GRANT CREATE ON SCHEMA public TO crm_migrator;

-- O migrator pode manipular também (útil para backfills controlados)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crm_migrator;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO crm_migrator;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_migrator;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO crm_migrator;

-- ✅ O PONTO CRÍTICO: objetos criados PELO crm_migrator devem dar grant automaticamente ao crm_app
ALTER DEFAULT PRIVILEGES FOR ROLE crm_migrator IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_app;

ALTER DEFAULT PRIVILEGES FOR ROLE crm_migrator IN SCHEMA public
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO crm_app;