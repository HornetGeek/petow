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

CONTAINER_ID="$(compose ps -q "$SERVICE" | head -n 1 | tr -d '\r')"
if [[ -z "$CONTAINER_ID" ]]; then
  echo "Could not resolve running container id for service '$SERVICE'." >&2
  exit 1
fi

CONTAINER_SNAPSHOT="/tmp/petow_snapshot.json.gz"
if [[ "$SNAPSHOT_PATH" == *.json ]]; then
  CONTAINER_SNAPSHOT="/tmp/petow_snapshot.json"
fi
CONTAINER_SNAPSHOT_LOAD="/tmp/petow_snapshot.reordered.json"

echo "Copying snapshot into container..."
docker cp "$SNAPSHOT_PATH" "${CONTAINER_ID}:${CONTAINER_SNAPSHOT}"

echo "Running migrations before import..."
compose exec -T "$SERVICE" python manage.py migrate --noinput

echo "Reordering fixture by model dependencies for FK-safe load..."
compose exec -T -e SNAPSHOT_IN="$CONTAINER_SNAPSHOT" -e SNAPSHOT_OUT="$CONTAINER_SNAPSHOT_LOAD" "$SERVICE" python - <<'PY'
import gzip
import json
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "patmatch_backend.settings")
import django
django.setup()
from django.apps import apps

snapshot_in = os.environ["SNAPSHOT_IN"]
snapshot_out = os.environ["SNAPSHOT_OUT"]

def read_fixture(path):
    if path.endswith(".gz"):
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            return json.load(handle)
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)

def write_fixture(path, payload):
    if path.endswith(".gz"):
        with gzip.open(path, "wt", encoding="utf-8") as handle:
            json.dump(payload, handle)
            return
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)

data = read_fixture(snapshot_in)
for idx, obj in enumerate(data):
    obj["_original_index"] = idx

models_present = sorted({obj["model"] for obj in data})
deps = {model_label: set() for model_label in models_present}

for model_label in models_present:
    try:
        app_label, model_name = model_label.split(".", 1)
        model = apps.get_model(app_label, model_name)
    except Exception:
        continue

    for field in model._meta.get_fields():
        if not getattr(field, "is_relation", False):
            continue
        if getattr(field, "auto_created", False):
            continue
        if getattr(field, "many_to_many", False):
            continue
        if getattr(field, "one_to_many", False):
            continue

        related = field.related_model._meta.label_lower
        if related in deps and related != model_label:
            deps[model_label].add(related)

remaining = {label: set(values) for label, values in deps.items()}
ordered_models = []
ready = sorted([label for label, values in remaining.items() if not values])

while ready:
    current = ready.pop(0)
    if current in ordered_models:
        continue
    ordered_models.append(current)
    for label in sorted(remaining):
        if current in remaining[label]:
            remaining[label].remove(current)
            if not remaining[label] and label not in ordered_models and label not in ready:
                ready.append(label)
    ready.sort()

unresolved = [label for label in models_present if label not in ordered_models]
ordered_models.extend(unresolved)
rank = {label: idx for idx, label in enumerate(ordered_models)}

data.sort(key=lambda obj: (rank.get(obj["model"], len(rank)), obj["_original_index"]))
for obj in data:
    obj.pop("_original_index", None)

write_fixture(snapshot_out, data)
print(
    f"Reordered fixture: models={len(models_present)} objects={len(data)} unresolved_cycles={len(unresolved)}"
)
PY

echo "Truncating target PostgreSQL tables (except django_migrations, spatial_ref_sys)..."
compose exec -T "$SERVICE" python - <<'PY'
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "patmatch_backend.settings")
import django
django.setup()
from django.conf import settings
from django.db import connection

engine = settings.DATABASES["default"]["ENGINE"]
if not ("postgresql" in engine or "postgis" in engine):
    raise SystemExit(f"Target DB must be PostgreSQL/PostGIS. Found: {engine}")

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

echo "Normalizing UUID column types to match Django models..."
compose exec -T "$SERVICE" python - <<'PY'
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "patmatch_backend.settings")
import django
django.setup()

from django.apps import apps
from django.db import connection, models

text_types = {"text", "character varying", "character"}
text_udts = {"text", "varchar", "bpchar"}

normalized = 0
skipped = 0

with connection.cursor() as cursor:
    for model in apps.get_models():
        if model._meta.proxy or not model._meta.managed:
            continue

        table_name = model._meta.db_table
        for field in model._meta.local_fields:
            if not isinstance(field, models.UUIDField):
                continue

            column_name = field.column
            cursor.execute(
                """
                SELECT data_type, udt_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = %s
                  AND column_name = %s
                """,
                [table_name, column_name],
            )
            row = cursor.fetchone()
            if not row:
                skipped += 1
                continue

            data_type, udt_name = row
            if data_type == "uuid" or udt_name == "uuid":
                continue

            if data_type in text_types or udt_name in text_udts:
                sql = (
                    f'ALTER TABLE "{table_name}" '
                    f'ALTER COLUMN "{column_name}" TYPE uuid '
                    f'USING NULLIF("{column_name}"::text, \'\')::uuid'
                )
                cursor.execute(sql)
                normalized += 1
            else:
                print(
                    f"Skipped non-text UUID mismatch {table_name}.{column_name}: "
                    f"data_type={data_type}, udt_name={udt_name}"
                )
                skipped += 1

print(f"UUID normalization completed: normalized={normalized}, skipped={skipped}")
PY

echo "Loading snapshot fixture..."
compose exec -T -e SNAPSHOT_LOAD="$CONTAINER_SNAPSHOT_LOAD" "$SERVICE" python - <<'PY'
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "patmatch_backend.settings")
import django
django.setup()

from django.core.management import call_command
from django.db.models.signals import m2m_changed, post_delete, post_save, pre_delete, pre_save

snapshot = os.environ["SNAPSHOT_LOAD"]
signals = [pre_save, post_save, pre_delete, post_delete, m2m_changed]
saved_receivers = {sig: list(sig.receivers) for sig in signals}

for sig in signals:
    sig.receivers = []

try:
    call_command("loaddata", snapshot, verbosity=1)
finally:
    for sig in signals:
        sig.receivers = saved_receivers[sig]

print("Fixture loaded successfully with model signals disabled during import.")
PY

echo "Resetting sequences..."
compose exec -T "$SERVICE" python - <<'PY'
import io
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "patmatch_backend.settings")
import django
django.setup()

from django.core.management import call_command
from django.db import connection

buffer = io.StringIO()
call_command(
    "sqlsequencereset",
    "accounts",
    "pets",
    "clinics",
    "auth",
    "authtoken",
    stdout=buffer,
)

sql_batch = buffer.getvalue().strip()
if not sql_batch:
    print("No sequence reset SQL generated.")
    raise SystemExit(0)

statements = [stmt.strip() for stmt in sql_batch.split(";") if stmt.strip()]
with connection.cursor() as cursor:
    for stmt in statements:
        cursor.execute(stmt)

print(f"Applied {len(statements)} sequence reset statements.")
PY

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
