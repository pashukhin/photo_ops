DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'identity_user') THEN
    CREATE USER identity_user WITH PASSWORD 'identity_pass';
  END IF;
END
$$;
ALTER USER identity_user WITH PASSWORD 'identity_pass';
SELECT 'CREATE DATABASE identity_db OWNER identity_user' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'identity_db')\gexec

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'photo_user') THEN
    CREATE USER photo_user WITH PASSWORD 'photo_pass';
  END IF;
END
$$;
ALTER USER photo_user WITH PASSWORD 'photo_pass';
SELECT 'CREATE DATABASE photo_db OWNER photo_user' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'photo_db')\gexec

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cluster_user') THEN
    CREATE USER cluster_user WITH PASSWORD 'cluster_pass';
  END IF;
END
$$;
ALTER USER cluster_user WITH PASSWORD 'cluster_pass';
SELECT 'CREATE DATABASE cluster_db OWNER cluster_user' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'cluster_db')\gexec

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'publication_user') THEN
    CREATE USER publication_user WITH PASSWORD 'publication_pass';
  END IF;
END
$$;
ALTER USER publication_user WITH PASSWORD 'publication_pass';
SELECT 'CREATE DATABASE publication_db OWNER publication_user' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'publication_db')\gexec

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'usage_user') THEN
    CREATE USER usage_user WITH PASSWORD 'usage_pass';
  END IF;
END
$$;
ALTER USER usage_user WITH PASSWORD 'usage_pass';
SELECT 'CREATE DATABASE usage_db OWNER usage_user' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'usage_db')\gexec

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'connector_user') THEN
    CREATE USER connector_user WITH PASSWORD 'connector_pass';
  END IF;
END
$$;
ALTER USER connector_user WITH PASSWORD 'connector_pass';
SELECT 'CREATE DATABASE connector_db OWNER connector_user' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'connector_db')\gexec
