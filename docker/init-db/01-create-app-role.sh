#!/bin/bash
# Runs automatically on first container init (official postgres image convention:
# anything in /docker-entrypoint-initdb.d/ executes once, against a fresh volume).
#
# Creates the least-privilege role the API/worker actually connect as. This role
# has NO superuser/BYPASSRLS attribute on purpose: Row-Level Security (see the
# enable_row_level_security migration) is silently ignored for superusers and
# BYPASSRLS roles no matter what the policies say, so the app must never connect
# as POSTGRES_USER (that account is only for running migrations).
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE edumanage_app LOGIN PASSWORD '${APP_ROLE_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO edumanage_app;
  GRANT USAGE ON SCHEMA public TO edumanage_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO edumanage_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO edumanage_app;
EOSQL
