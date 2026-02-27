#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

COMPOSE_FILE="docker-compose.yml"
SERVICE="backend"
SNAPSHOT_PATH="/tmp/petow_snapshot.json.gz"
COUNTS_REFERENCE=""
COUNTS_AFTER_PATH="/tmp/petow_counts_after_import.json"
REBUILD_GEOMETRY=1
CONFIRMED=0

usage() {
  cat <<'EOF'
Import a Django fixture snapshot into PostgreSQL backend service.

WARNING: This script truncates target DB tables before import.

Usage:
  scripts/import_snapshot_postgres.sh [options] --yes

Options:
  --compose-file PATH      Compose file path (default: docker-compose.yml)
  --service NAME           Backend service name (default: backend)
  --snapshot PATH          Input snapshot path (.json or .json.gz) (default: /tmp/petow_snapshot.json.gz)
  --counts-reference PATH  Optional old-server counts json to compare after import
  --counts-after PATH      Output counts json for new server (default: /tmp/petow_counts_after_import.json)
  --no-geometry-rebuild    Skip rebuilding location_point fields from lat/lng
  --yes                    Confirm destructive truncate + import
  -h, --help               Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --compose-file)
      COMPOSE_FILE="$2"
      shift 2
      ;;
    --service)
      SERVICE="$2"
      shift 2
      ;;
    --snapshot)
      SNAPSHOT_PATH="$2"
      shift 2
      ;;
    --counts-reference)
      COUNTS_REFERENCE="$2"
      shift 2
      ;;
    --counts-after)
      COUNTS_AFTER_PATH="$2"
      shift 2
      ;;
    --no-geometry-rebuild)
      REBUILD_GEOMETRY=0
      shift
      ;;
    --yes)
      CONFIRMED=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ $CONFIRMED -ne 1 ]]; then
  echo "Refusing to continue without explicit confirmation. Re-run with --yes." >&2
  exit 1
fi

if [[ ! -f "$SNAPSHOT_PATH" ]]; then
  echo "Snapshot file not found: $SNAPSHOT_PATH" >&2
  exit 1
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_BIN=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_BIN=(docker-compose)
else
  echo "Neither 'docker compose' nor 'docker-compose' is available." >&2
  exit 1
fi

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "Python is required to run verify_sync_counts.py." >&2
  exit 1
fi

compose() {
  "${COMPOSE_BIN[@]}" -f "$COMPOSE_FILE" "$@"
}

if [[ -z "$(compose ps -q "$SERVICE")" ]]; then
  echo "Service '$SERVICE' is not running. Starting it now..."
  compose up -d "$SERVICE"
fi

CONTAINER_SNAPSHOT="/tmp/petow_snapshot.json.gz"
if [[ "$SNAPSHOT_PATH" == *.json ]]; then
  CONTAINER_SNAPSHOT="/tmp/petow_snapshot.json"
fi

echo "Copying snapshot into container..."
compose cp "$SNAPSHOT_PATH" "${SERVICE}:${CONTAINER_SNAPSHOT}"

echo "Running migrations before import..."
compose exec -T "$SERVICE" python manage.py migrate --noinput

echo "Truncating target PostgreSQL tables (except django_migrations, spatial_ref_sys)..."
compose exec -T "$SERVICE" python - <<'PY'
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "patmatch_backend.settings")
import django
django.setup()
from django.conf import settings
from django.db import connection

engine = settings.DATABASES["default"]["ENGINE"]
if "postgresql" not in engine:
    raise SystemExit(f"Target DB must be PostgreSQL. Found: {engine}")

excluded = {"django_migrations", "spatial_ref_sys"}

with connection.cursor() as cursor:
    cursor.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'")
    tables = [row[0] for row in cursor.fetchall() if row[0] not in excluded]

if not tables:
    print("No tables to truncate.")
    raise SystemExit(0)

quoted_tables = ", ".join(f'"{name}"' for name in sorted(tables))
with connection.cursor() as cursor:
    cursor.execute(f"TRUNCATE TABLE {quoted_tables} RESTART IDENTITY CASCADE")

print(f"Truncated {len(tables)} tables.")
PY

echo "Loading snapshot fixture..."
compose exec -T "$SERVICE" python manage.py loaddata "$CONTAINER_SNAPSHOT"

echo "Resetting sequences..."
compose exec -T "$SERVICE" sh -lc \
  "python manage.py sqlsequencereset accounts pets clinics auth authtoken | python manage.py dbshell"

if [[ $REBUILD_GEOMETRY -eq 1 ]]; then
  echo "Rebuilding derived geometry fields from latitude/longitude..."
  compose exec -T "$SERVICE" python - <<'PY'
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "patmatch_backend.settings")
import django
django.setup()
from django.db import connection

updates = [
    (
        "accounts_user",
        """
        UPDATE accounts_user
        SET location_point = ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography
        WHERE location_point IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
        """,
    ),
    (
        "pets_pet",
        """
        UPDATE pets_pet
        SET location_point = ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography
        WHERE location_point IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
        """,
    ),
    (
        "clinics_clinic",
        """
        UPDATE clinics_clinic
        SET location_point = ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography
        WHERE location_point IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
        """,
    ),
]

with connection.cursor() as cursor:
    for table_name, sql in updates:
        try:
            cursor.execute(sql)
            print(f"{table_name}: rebuilt {cursor.rowcount} rows")
        except Exception as exc:
            print(f"{table_name}: skipped ({exc})")
PY
fi

echo "Capturing post-import counts..."
mkdir -p "$(dirname "$COUNTS_AFTER_PATH")"
"$PYTHON_BIN" "${SCRIPT_DIR}/verify_sync_counts.py" \
  --compose-file "$COMPOSE_FILE" \
  --service "$SERVICE" \
  --output "$COUNTS_AFTER_PATH"

if [[ -n "$COUNTS_REFERENCE" ]]; then
  echo "Comparing imported counts with reference: $COUNTS_REFERENCE"
  "$PYTHON_BIN" "${SCRIPT_DIR}/verify_sync_counts.py" \
    --compose-file "$COMPOSE_FILE" \
    --service "$SERVICE" \
    --compare "$COUNTS_REFERENCE"
fi

echo "Import completed."
echo "Post-import counts: $COUNTS_AFTER_PATH"
