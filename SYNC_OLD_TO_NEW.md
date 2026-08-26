# Old SQLite -> New PostgreSQL Full Sync (One Script)

This runbook uses one local orchestrator script to:
1. export snapshot on old server
2. pull artifacts to local machine
3. push artifacts to new server
4. import snapshot on new server
5. compare counts and fail on mismatch

## Prerequisites

1. Local machine has:
- `ssh`
- `scp`
- `sshpass`
- access to old-server key file (for example `~/Downloads/petow.pem`)

2. Old server prerequisites:
- project directory exists (default `/home/ubuntu/petow`)
- compose file exists (default `docker-compose.prod.yml`)
- Docker compose available (`docker compose` or `docker-compose`)
- backend service is already running in that compose project

3. New server prerequisites:
- project directory exists (default `/root/petow`)
- `scripts/import_snapshot_postgres.sh` is present and executable
- `scripts/verify_sync_counts.py` is present (used by import script)

4. You exported new-server SSH password as env var (default var name):
```bash
export NEW_SERVER_SSH_PASSWORD='YOUR_NEW_SERVER_PASSWORD'
```

## Script Location

`scripts/sync_old_to_new_full.sh`

## Pass 1 (Bulk While Old Is Live)

```bash
bash scripts/sync_old_to_new_full.sh \
  --mode pass1 \
  --old-host ec2-13-60-199-22.eu-north-1.compute.amazonaws.com \
  --old-user ubuntu \
  --old-key ~/Downloads/petow.pem \
  --new-host 89.167.27.181 \
  --new-user root \
  --yes
```

## Final Pass (Before Cutover)

Before running final pass, freeze writes on old server.

```bash
bash scripts/sync_old_to_new_full.sh \
  --mode final \
  --old-host ec2-13-60-199-22.eu-north-1.compute.amazonaws.com \
  --old-user ubuntu \
  --old-key ~/Downloads/petow.pem \
  --new-host 89.167.27.181 \
  --new-user root \
  --yes
```

## Useful Options

1. Keep local snapshot artifact:
```bash
--keep-artifacts
```

2. Custom password env var name:
```bash
--new-password-env MY_NEW_SERVER_PASS
```

3. Custom local artifacts directory:
```bash
--local-artifacts-dir ./tmp/my-sync-run
```

## Notes

1. Script exits non-zero on any failure.
2. Script exits non-zero on count mismatch (via import comparison).
3. Snapshot is removed locally after success unless `--keep-artifacts` is passed.
4. Old server does not need `export_sqlite_snapshot.sh`; export is executed inline over SSH.
5. During step 3, orchestrator uploads latest `import_snapshot_postgres.sh` and `verify_sync_counts.py` to new server before import.
