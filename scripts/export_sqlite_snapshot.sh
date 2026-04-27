#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

COMPOSE_FILE="docker-compose.yml"
SERVICE="backend"
SNAPSHOT_PATH="/tmp/petow_snapshot.json.gz"
COUNTS_PATH="/tmp/petow_counts.json"

usage() {
  cat <<'EOF'
Export a full Django fixture snapshot from the current backend service (SQLite source).

Usage:
  scripts/export_sqlite_snapshot.sh [options]

Options:
  --compose-file PATH   Compose file path (default: docker-compose.yml)
  --service NAME        Backend service name (default: backend)
  --snapshot PATH       Output snapshot path (.json.gz) (default: /tmp/petow_snapshot.json.gz)
  --counts PATH         Output counts json path (default: /tmp/petow_counts.json)
  -h, --help            Show this help message
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
    --counts)
      COUNTS_PATH="$2"
      shift 2
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

if [[ "$SNAPSHOT_PATH" != *.gz ]]; then
  SNAPSHOT_PATH="${SNAPSHOT_PATH}.gz"
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
  echo "Service '$SERVICE' is not running. Start it first, then rerun." >&2
  exit 1
fi

CONTAINER_ID="$(compose ps -q "$SERVICE" | head -n 1 | tr -d '\r')"
if [[ -z "$CONTAINER_ID" ]]; then
  echo "Could not resolve running container id for service '$SERVICE'." >&2
  exit 1
fi

CONTAINER_SNAPSHOT_JSON="/tmp/petow_snapshot.json"
CONTAINER_SNAPSHOT_GZ="${CONTAINER_SNAPSHOT_JSON}.gz"

echo "Checking source database engine..."
DB_ENGINE="$(
  compose exec -T "$SERVICE" python - <<'PY' | tail -n 1 | tr -d '\r'
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "patmatch_backend.settings")
import django
django.setup()
from django.conf import settings
print(settings.DATABASES["default"]["ENGINE"])
PY
)"

if [[ "$DB_ENGINE" != *sqlite* ]]; then
  echo "Warning: source DB engine is '$DB_ENGINE' (expected SQLite for old server export)." >&2
fi

echo "Exporting snapshot from service '$SERVICE'..."
compose exec -T "$SERVICE" rm -f "$CONTAINER_SNAPSHOT_JSON" "$CONTAINER_SNAPSHOT_GZ"
compose exec -T "$SERVICE" python manage.py dumpdata \
  --natural-foreign \
  --natural-primary \
  --exclude sessions.session \
  --exclude admin.logentry \
  --exclude pets.notificationoutbox \
  --output "$CONTAINER_SNAPSHOT_JSON"
compose exec -T "$SERVICE" gzip -f "$CONTAINER_SNAPSHOT_JSON"

mkdir -p "$(dirname "$SNAPSHOT_PATH")"
docker cp "${CONTAINER_ID}:${CONTAINER_SNAPSHOT_GZ}" "$SNAPSHOT_PATH"

echo "Generating counts manifest..."
mkdir -p "$(dirname "$COUNTS_PATH")"
"$PYTHON_BIN" "${SCRIPT_DIR}/verify_sync_counts.py" \
  --compose-file "$COMPOSE_FILE" \
  --service "$SERVICE" \
  --output "$COUNTS_PATH"

echo "Export completed."
echo "Snapshot: $SNAPSHOT_PATH"
echo "Counts:   $COUNTS_PATH"
