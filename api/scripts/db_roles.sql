-- Create a least-privilege role for the app (NO SUPERUSER, NO BYPASSRLS)
-- Run once as postgres/admin.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nimbus_app') THEN
        CREATE ROLE nimbus_app LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END IF;
END $$;

-- Revoke broad defaults
REVOKE ALL ON DATABASE postgres FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- Allow app to connect and use schema
GRANT CONNECT ON DATABASE postgres TO nimbus_app;
GRANT USAGE ON SCHEMA public TO nimbus_app;

-- Grant DML only on current tables (repeat per schema if needed)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nimbus_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nimbus_app;

-- Ensure future tables also get privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nimbus_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO nimbus_app;