#!/bin/sh
set -eu

# Mount the repository at /kiwi (read-only); connect using standard PG* variables.
: "${PGHOST:?Set PGHOST}"
: "${PGUSER:?Set PGUSER}"
: "${PGDATABASE:?Set PGDATABASE}"
: "${AUTH_HEALTH_URL:?Set AUTH_HEALTH_URL to the internal Auth /health URL}"

root=/kiwi
tmp=$(mktemp)
list=$(mktemp)
trap 'rm -f "$tmp" "$list"' EXIT HUP INT TERM

attempt=0
until curl --fail --silent --show-error --max-time 3 "$AUTH_HEALTH_URL" >/dev/null 2>&1 &&
  psql -X -q -v ON_ERROR_STOP=1 -c "SELECT 1 FROM auth.users LIMIT 0" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "${WAIT_ATTEMPTS:-120}" ]; then
    echo 'Auth or its database schema did not become ready' >&2
    exit 1
  fi
  sleep 2
done

for file in "$root/drizzle/migrations/0011_kiwi_trip_name.sql" "$root/drizzle/migrations/0012_kiwi_price_refresh.sql" "$root/drizzle/migrations/0013_kiwi_price_freshness.sql" "$root/drizzle/migrations/0014_kiwi_first_session.sql" "$root/supabase/seed.sql"; do
  test -r "$file" || { echo "Missing required file: $file" >&2; exit 1; }
done

cat > "$tmp" <<'SQL'
\set ON_ERROR_STOP on
SELECT pg_advisory_lock(hashtextextended('kiwi-self-host-migrations', 0));
CREATE SCHEMA IF NOT EXISTS kiwi_bootstrap;
CREATE TABLE IF NOT EXISTS kiwi_bootstrap.migrations (
  version text PRIMARY KEY,
  filename text NOT NULL,
  sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TEMP TABLE migration_manifest (version text PRIMARY KEY, filename text NOT NULL, sha256 text NOT NULL);
SQL

add_manifest() {
  version=$1 file=$2
  name=${file##*/}
  case "$name" in *[!a-zA-Z0-9_.-]*|'') echo "Invalid migration filename: $name" >&2; exit 1;; esac
  hash=$(sha256sum "$file" | cut -d ' ' -f 1)
  printf "INSERT INTO migration_manifest VALUES ('%s', '%s', '%s');\n" "$version" "$name" "$hash" >> "$tmp"
}

found=0
for file in "$root"/supabase/migrations/*.sql; do
  test -f "$file" || continue
  name=${file##*/}
  version=${name%%_*}
  case "$version" in *[!0-9]*|'') echo "Invalid migration version: $name" >&2; exit 1;; esac
  test "${#version}" -eq 14 || { echo "Expected 14-digit version: $name" >&2; exit 1; }
  printf '%s %s\n' "$version" "$file" >> "$list"
  found=$((found + 1))
done
test "$found" -gt 0 || { echo 'No canonical migrations found' >&2; exit 1; }
printf '%s %s\n' 20260101000022 "$root/drizzle/migrations/0011_kiwi_trip_name.sql" >> "$list"
printf '%s %s\n' 20260101000024 "$root/drizzle/migrations/0012_kiwi_price_refresh.sql" >> "$list"
printf '%s %s\n' 20260101000028 "$root/drizzle/migrations/0013_kiwi_price_freshness.sql" >> "$list"
printf '%s %s\n' 20260101000030 "$root/drizzle/migrations/0014_kiwi_first_session.sql" >> "$list"
LC_ALL=C sort -o "$list" "$list"
while read -r version file; do
  add_manifest "$version" "$file"
done < "$list"

cat >> "$tmp" <<'SQL'
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM kiwi_bootstrap.migrations a
    LEFT JOIN migration_manifest m USING (version)
    WHERE m.version IS NULL OR a.filename <> m.filename OR a.sha256 <> m.sha256
  ) THEN
    RAISE EXCEPTION 'Applied migration missing or changed; reconcile manually';
  END IF;
  IF EXISTS (
    SELECT 1 FROM migration_manifest m
    WHERE NOT EXISTS (SELECT 1 FROM kiwi_bootstrap.migrations a WHERE a.version = m.version)
      AND m.version < (SELECT max(version) FROM kiwi_bootstrap.migrations)
  ) THEN
    RAISE EXCEPTION 'Unapplied migration precedes an applied migration; reconcile manually';
  END IF;
END $$;
SQL

apply_file() {
  version=$1 file=$2
  printf "SELECT NOT EXISTS (SELECT 1 FROM kiwi_bootstrap.migrations WHERE version = '%s') AS apply \\gset\n" "$version" >> "$tmp"
  printf '\\if :apply\nBEGIN;\n\\i %s\n' "$file" >> "$tmp"
  printf "INSERT INTO kiwi_bootstrap.migrations (version, filename, sha256) SELECT version, filename, sha256 FROM migration_manifest WHERE version = '%s';\nCOMMIT;\n" "$version" >> "$tmp"
  printf '%s\n' '\endif' >> "$tmp"
}

while read -r version file; do
  apply_file "$version" "$file"
done < "$list"

# The seed's empty-catalog guard and ledger insert share the same transaction.
cat >> "$tmp" <<'SQL'
CREATE TABLE IF NOT EXISTS kiwi_bootstrap.seed (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  applied_at timestamptz NOT NULL DEFAULT now()
);
SELECT NOT EXISTS (SELECT 1 FROM kiwi_bootstrap.seed) AS apply_seed \gset
\if :apply_seed
BEGIN;
\i /kiwi/supabase/seed.sql
INSERT INTO kiwi_bootstrap.seed DEFAULT VALUES;
COMMIT;
\endif
SELECT pg_advisory_unlock(hashtextextended('kiwi-self-host-migrations', 0));
SQL

psql -X -v ON_ERROR_STOP=1 -f "$tmp"
