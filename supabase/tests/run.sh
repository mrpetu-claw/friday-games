#!/usr/bin/env bash
# Runs the server acceptance tests against a throwaway local Postgres database.
# Usage: PGHOST=localhost PGPORT=5432 PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")"
DB=${TEST_DB:-friday_games_test}
P="psql -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
$P -d "$DB" -f supabase_stub.sql
for f in ../migrations/*.sql; do $P -d "$DB" -f "$f"; done
$P -d "$DB" -f acceptance.sql
