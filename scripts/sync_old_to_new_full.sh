#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MODE=""
OLD_HOST=""
OLD_USER=""
OLD_KEY=""
NEW_HOST=""
NEW_USER=""
NEW_PASSWORD_ENV="NEW_SERVER_SSH_PASSWORD"
OLD_PROJECT_DIR="/home/ubuntu/petow"
NEW_PROJECT_DIR="/root/petow"
OLD_COMPOSE_FILE="docker-compose.prod.yml"
NEW_COMPOSE_FILE="docker-compose.yml"
SERVICE="backend"
REMOTE_SNAPSHOT="/tmp/petow_snapshot.json.gz"
REMOTE_COUNTS="/tmp/petow_counts.json"
REMOTE_COUNTS_AFTER="/tmp/petow_counts_after_import.json"
LOCAL_ARTIFACTS_DIR=""
KEEP_ARTIFACTS=0
CONFIRMED=0

usage() {
  cat <<'EOF'
Run full SQLite(old) -> PostgreSQL(new) sync from local machine.

This script orchestrates:
1) export snapshot on old server
2) download artifacts to local
3) upload artifacts to new server
4) import snapshot on new server
5) download post-import counts

Usage:
  scripts/sync_old_to_new_full.sh [options] --yes

Required options:
  --mode pass1|final
  --old-host HOST
  --old-user USER
  --old-key PATH
  --new-host HOST
  --new-user USER

Optional:
  --new-password-env NAME      Env var name for new-server SSH password (default: NEW_SERVER_SSH_PASSWORD)
  --old-project-dir PATH       Old server repo path (default: /home/ubuntu/petow)
  --new-project-dir PATH       New server repo path (default: /root/petow)
  --old-compose-file PATH      Old server compose file (default: docker-compose.prod.yml)
  --new-compose-file PATH      New server compose file (default: docker-compose.yml)
  --service NAME               Compose backend service name (default: backend)
  --remote-snapshot PATH       Remote snapshot path (default: /tmp/petow_snapshot.json.gz)
  --remote-counts PATH         Remote old counts path (default: /tmp/petow_counts.json)
  --remote-counts-after PATH   Remote new counts path (default: /tmp/petow_counts_after_import.json)
  --local-artifacts-dir PATH   Local artifact dir (default: ./tmp/sync-<timestamp>)
  --keep-artifacts             Keep local snapshot file after success
  --yes                        Required confirmation for destructive import on new server
  -h, --help                   Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="$2"
      shift 2
      ;;
    --old-host)
      OLD_HOST="$2"
      shift 2
      ;;
    --old-user)
      OLD_USER="$2"
      shift 2
      ;;
    --old-key)
      OLD_KEY="$2"
      shift 2
      ;;
    --new-host)
      NEW_HOST="$2"
      shift 2
      ;;
    --new-user)
      NEW_USER="$2"
      shift 2
      ;;
    --new-password-env)
      NEW_PASSWORD_ENV="$2"
      shift 2
      ;;
    --old-project-dir)
      OLD_PROJECT_DIR="$2"
      shift 2
      ;;
    --new-project-dir)
      NEW_PROJECT_DIR="$2"
      shift 2
      ;;
    --old-compose-file)
      OLD_COMPOSE_FILE="$2"
      shift 2
      ;;
    --new-compose-file)
      NEW_COMPOSE_FILE="$2"
      shift 2
      ;;
    --service)
      SERVICE="$2"
      shift 2
      ;;
    --remote-snapshot)
      REMOTE_SNAPSHOT="$2"
      shift 2
      ;;
    --remote-counts)
      REMOTE_COUNTS="$2"
      shift 2
      ;;
    --remote-counts-after)
      REMOTE_COUNTS_AFTER="$2"
      shift 2
      ;;
    --local-artifacts-dir)
      LOCAL_ARTIFACTS_DIR="$2"
      shift 2
      ;;
    --keep-artifacts)
      KEEP_ARTIFACTS=1
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

if [[ "$MODE" != "pass1" && "$MODE" != "final" ]]; then
  echo "Invalid --mode. Use pass1 or final." >&2
  exit 1
fi

for required in OLD_HOST OLD_USER OLD_KEY NEW_HOST NEW_USER; do
  if [[ -z "${!required}" ]]; then
    echo "Missing required option for ${required}." >&2
    usage
    exit 1
  fi
done

if [[ $CONFIRMED -ne 1 ]]; then
  echo "Refusing to continue without --yes (import truncates target PostgreSQL tables)." >&2
  exit 1
fi

OLD_KEY="${OLD_KEY/#\~/$HOME}"
if [[ ! -f "$OLD_KEY" ]]; then
  echo "Old server SSH key not found: $OLD_KEY" >&2
  exit 1
fi

NEW_PASSWORD="${!NEW_PASSWORD_ENV:-}"
if [[ -z "$NEW_PASSWORD" ]]; then
  echo "Missing new-server password env var: $NEW_PASSWORD_ENV" >&2
  echo "Example: export $NEW_PASSWORD_ENV='your-password'" >&2
  exit 1
fi

for cmd in bash ssh scp sshpass date tee; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required command is not installed: $cmd" >&2
    exit 1
  fi
done

if [[ -z "$LOCAL_ARTIFACTS_DIR" ]]; then
  LOCAL_ARTIFACTS_DIR="./tmp/sync-$(date +%Y%m%d-%H%M%S)"
fi

mkdir -p "$LOCAL_ARTIFACTS_DIR"
LOG_FILE="$LOCAL_ARTIFACTS_DIR/sync.log"
exec > >(tee -a "$LOG_FILE") 2>&1

CURRENT_STEP="initialization"

die() {
  echo "ERROR [${CURRENT_STEP}]: $*" >&2
  exit 1
}

on_err() {
  local exit_code=$?
  echo "ERROR [${CURRENT_STEP}]: command failed (exit=${exit_code})." >&2
  echo "ERROR [${CURRENT_STEP}]: failed command: ${BASH_COMMAND}" >&2
  echo "ERROR [${CURRENT_STEP}]: See log: ${LOG_FILE}" >&2
  exit "$exit_code"
}

trap on_err ERR

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

q() {
  printf '%q' "$1"
}

OLD_SSH_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o BatchMode=yes
  -o ConnectTimeout=20
)

NEW_SSH_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o PreferredAuthentications=password
  -o PubkeyAuthentication=no
  -o ConnectTimeout=20
)

run_old() {
  local remote_cmd="$1"
  ssh "${OLD_SSH_OPTS[@]}" -i "$OLD_KEY" "${OLD_USER}@${OLD_HOST}" \
    "bash -lc $(q "$remote_cmd")"
}

run_new() {
  local remote_cmd="$1"
  SSHPASS="$NEW_PASSWORD" sshpass -e ssh "${NEW_SSH_OPTS[@]}" "${NEW_USER}@${NEW_HOST}" \
    "bash -lc $(q "$remote_cmd")"
}

copy_old_to_local() {
  local remote_path="$1"
  local local_path="$2"
  scp "${OLD_SSH_OPTS[@]}" -i "$OLD_KEY" "${OLD_USER}@${OLD_HOST}:${remote_path}" "$local_path"
}

copy_local_to_new() {
  local local_path="$1"
  local remote_path="$2"
  SSHPASS="$NEW_PASSWORD" sshpass -e scp "${NEW_SSH_OPTS[@]}" "$local_path" "${NEW_USER}@${NEW_HOST}:${remote_path}"
}

copy_new_to_local() {
  local remote_path="$1"
  local local_path="$2"
  SSHPASS="$NEW_PASSWORD" sshpass -e scp "${NEW_SSH_OPTS[@]}" "${NEW_USER}@${NEW_HOST}:${remote_path}" "$local_path"
}

local_sha256() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$path" | awk '{print $1}'
    return
  fi
  die "Neither sha256sum nor shasum is available locally."
}

check_old() {
  local label="$1"
  local cmd="$2"
  log " - old: ${label}"
  if ! run_old "$cmd"; then
    die "old preflight failed: ${label}"
  fi
}

check_new() {
  local label="$1"
  local cmd="$2"
  log " - new: ${label}"
  if ! run_new "$cmd"; then
    die "new preflight failed: ${label}"
  fi
}

LOCAL_SNAPSHOT="$LOCAL_ARTIFACTS_DIR/$(basename "$REMOTE_SNAPSHOT")"
LOCAL_COUNTS="$LOCAL_ARTIFACTS_DIR/$(basename "$REMOTE_COUNTS")"
LOCAL_COUNTS_AFTER="$LOCAL_ARTIFACTS_DIR/$(basename "$REMOTE_COUNTS_AFTER")"

if [[ "$MODE" == "final" ]]; then
  log "WARNING: FINAL mode selected."
  log "Ensure writes are frozen on old server BEFORE running this sync."
fi

CURRENT_STEP="preflight"
log "Preflight: validating remote paths and dependencies..."
check_old "project dir exists ($OLD_PROJECT_DIR)" "test -d $(q "$OLD_PROJECT_DIR")"
check_old "compose file exists ($OLD_COMPOSE_FILE)" "test -f $(q "$OLD_PROJECT_DIR/$OLD_COMPOSE_FILE")"
check_old "docker compose available" "set -Eeuo pipefail; \
if docker compose version >/dev/null 2>&1; then true; \
elif command -v docker-compose >/dev/null 2>&1; then true; \
else echo \"Neither docker compose nor docker-compose is available on old server.\" >&2; exit 1; fi"
check_new "project dir exists ($NEW_PROJECT_DIR)" "test -d $(q "$NEW_PROJECT_DIR")"

CURRENT_STEP="old_export"
log "Step 1/5: exporting snapshot on old server (inline)..."
OLD_EXPORT_CMD="set -Eeuo pipefail; cd $(q "$OLD_PROJECT_DIR"); \
if docker compose version >/dev/null 2>&1; then COMPOSE_BIN='docker compose'; \
elif command -v docker-compose >/dev/null 2>&1; then COMPOSE_BIN='docker-compose'; \
else echo \"Neither docker compose nor docker-compose is available on old server.\" >&2; exit 1; fi; \
CONTAINER_ID=\"\$(\$COMPOSE_BIN -f $(q "$OLD_COMPOSE_FILE") ps -q $(q "$SERVICE") | head -n 1 | tr -d '\r')\"; \
[ -n \"\$CONTAINER_ID\" ] || { \
echo \"Service $(q "$SERVICE") is not running on old server.\" >&2; exit 1; }; \
mkdir -p $(q "$(dirname "$REMOTE_SNAPSHOT")") $(q "$(dirname "$REMOTE_COUNTS")"); \
CONTAINER_SNAPSHOT_JSON='/tmp/petow_snapshot.json'; \
CONTAINER_SNAPSHOT_GZ='/tmp/petow_snapshot.json.gz'; \
CONTAINER_COUNTS_JSON='/tmp/petow_counts.json'; \
\$COMPOSE_BIN -f $(q "$OLD_COMPOSE_FILE") exec -T $(q "$SERVICE") rm -f \"\$CONTAINER_SNAPSHOT_JSON\" \"\$CONTAINER_SNAPSHOT_GZ\" \"\$CONTAINER_COUNTS_JSON\"; \
\$COMPOSE_BIN -f $(q "$OLD_COMPOSE_FILE") exec -T $(q "$SERVICE") python manage.py shell -c \
\"from django.apps import apps; print('yes' if apps.get_model('pets','NotificationOutbox') else 'no')\" >/tmp/petow_has_notificationoutbox.txt 2>/dev/null || true; \
HAS_OUTBOX=\$(tr -d '\r\n' </tmp/petow_has_notificationoutbox.txt || true); \
if [ \"\$HAS_OUTBOX\" = \"yes\" ]; then OUTBOX_EXCLUDE='--exclude pets.notificationoutbox'; else OUTBOX_EXCLUDE=''; fi; \
\$COMPOSE_BIN -f $(q "$OLD_COMPOSE_FILE") exec -T $(q "$SERVICE") python manage.py dumpdata \
--natural-foreign --natural-primary \
--exclude sessions.session \
--exclude admin.logentry \
\$OUTBOX_EXCLUDE \
--output \"\$CONTAINER_SNAPSHOT_JSON\"; \
\$COMPOSE_BIN -f $(q "$OLD_COMPOSE_FILE") exec -T $(q "$SERVICE") gzip -f \"\$CONTAINER_SNAPSHOT_JSON\"; \
docker cp \"\$CONTAINER_ID:\$CONTAINER_SNAPSHOT_GZ\" $(q "$REMOTE_SNAPSHOT"); \
\$COMPOSE_BIN -f $(q "$OLD_COMPOSE_FILE") exec -T $(q "$SERVICE") python manage.py shell -c \
\"import json;from django.apps import apps;targets=['accounts.User','accounts.AccountVerification','pets.Breed','pets.Pet','pets.BreedingRequest','pets.AdoptionRequest','pets.Notification','pets.ChatRoom','clinics.Clinic','clinics.ClinicStaff','clinics.ClinicService','clinics.ClinicProduct','clinics.StorefrontOrder','clinics.StorefrontBooking','authtoken.Token','auth.Group','auth.Permission','contenttypes.ContentType','sites.Site'];out={target: apps.get_model(*target.split('.')).objects.count() for target in targets};open('/tmp/petow_counts.json','w').write(json.dumps(out, sort_keys=True))\"; \
docker cp \"\$CONTAINER_ID:\$CONTAINER_COUNTS_JSON\" $(q "$REMOTE_COUNTS")"
run_old "$OLD_EXPORT_CMD"

CURRENT_STEP="download_old_artifacts"
log "Step 2/5: downloading export artifacts to local..."
copy_old_to_local "$REMOTE_SNAPSHOT" "$LOCAL_SNAPSHOT"
copy_old_to_local "$REMOTE_COUNTS" "$LOCAL_COUNTS"

CURRENT_STEP="upload_to_new"
log "Step 3/5: uploading artifacts to new server..."
copy_local_to_new "$LOCAL_SNAPSHOT" "$REMOTE_SNAPSHOT"
copy_local_to_new "$LOCAL_COUNTS" "$REMOTE_COUNTS"
run_new "mkdir -p $(q "$NEW_PROJECT_DIR/scripts")"
copy_local_to_new "$SCRIPT_DIR/import_snapshot_postgres.sh" "$NEW_PROJECT_DIR/scripts/import_snapshot_postgres.sh"
copy_local_to_new "$SCRIPT_DIR/verify_sync_counts.py" "$NEW_PROJECT_DIR/scripts/verify_sync_counts.py"
run_new "chmod +x $(q "$NEW_PROJECT_DIR/scripts/import_snapshot_postgres.sh")"
LOCAL_IMPORT_HASH="$(local_sha256 "$SCRIPT_DIR/import_snapshot_postgres.sh")"
REMOTE_IMPORT_HASH="$(
  run_new "if command -v sha256sum >/dev/null 2>&1; then sha256sum $(q "$NEW_PROJECT_DIR/scripts/import_snapshot_postgres.sh") | cut -d' ' -f1; \
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 $(q "$NEW_PROJECT_DIR/scripts/import_snapshot_postgres.sh") | cut -d' ' -f1; \
  else echo ''; fi" | tail -n 1 | tr -d '\r'
)"
if [[ -z "$REMOTE_IMPORT_HASH" ]]; then
  die "Could not compute remote hash for import script on new server."
fi
if [[ "$LOCAL_IMPORT_HASH" != "$REMOTE_IMPORT_HASH" ]]; then
  die "Remote import script hash mismatch after upload."
fi
log " - new: import script synced (sha256: $REMOTE_IMPORT_HASH)"

CURRENT_STEP="new_import"
log "Step 4/5: importing snapshot on new server..."
NEW_IMPORT_CMD="set -Eeuo pipefail; cd $(q "$NEW_PROJECT_DIR"); \
bash ./scripts/import_snapshot_postgres.sh --compose-file $(q "$NEW_COMPOSE_FILE") --service $(q "$SERVICE") \
--snapshot $(q "$REMOTE_SNAPSHOT") --counts-reference $(q "$REMOTE_COUNTS") \
--counts-after $(q "$REMOTE_COUNTS_AFTER") --yes"
run_new "$NEW_IMPORT_CMD"

CURRENT_STEP="download_new_counts"
log "Step 5/5: downloading post-import counts to local..."
copy_new_to_local "$REMOTE_COUNTS_AFTER" "$LOCAL_COUNTS_AFTER"

if [[ $KEEP_ARTIFACTS -ne 1 ]]; then
  CURRENT_STEP="cleanup"
  log "Cleaning local snapshot (use --keep-artifacts to retain it)..."
  rm -f "$LOCAL_SNAPSHOT"
fi

log "Sync completed successfully."
log "Mode:                $MODE"
log "Local artifacts dir: $LOCAL_ARTIFACTS_DIR"
log "Old counts:          $LOCAL_COUNTS"
log "New counts:          $LOCAL_COUNTS_AFTER"
if [[ $KEEP_ARTIFACTS -eq 1 ]]; then
  log "Snapshot kept:       $LOCAL_SNAPSHOT"
fi
log "Log file:            $LOG_FILE"
