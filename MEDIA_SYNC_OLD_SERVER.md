# Old Production Media Sync to Hetzner (Phase 1)

This runbook is for copying existing media files from the old production server to Hetzner Object Storage before new-server cutover work.

## Scope

- This phase only copies media files from `MEDIA_ROOT` (`/app/media` in backend container).
- No runtime storage switching.
- No nginx/client URL behavior changes.
- No DB updates.

## Required Environment Variables

Set these in the backend container environment on the old production server:

- `HETZNER_S3_ENDPOINT_URL`
- `HETZNER_S3_REGION`
- `HETZNER_S3_ACCESS_KEY`
- `HETZNER_S3_SECRET_KEY`
- `HETZNER_MEDIA_BUCKET`

## Command

```bash
python manage.py sync_media_to_bucket \
  [--dry-run] \
  [--workers N] \
  [--skip-existing] \
  [--overwrite] \
  [--report-json PATH] \
  [--prefix PREFIX] \
  [--limit N]
```

Notes:

- Source path is `settings.MEDIA_ROOT`.
- Object key keeps relative path under `MEDIA_ROOT`.
- `--skip-existing` compares remote object size via `HeadObject`.
- Command exits non-zero if any file fails upload.

## Execution Steps (Old Production Server)

1. Build and run backend from this branch without switching active traffic.
2. Dry-run:

```bash
docker compose -f docker-compose.prod.yml run --rm backend \
  python manage.py sync_media_to_bucket --dry-run --workers 12 --skip-existing --report-json /tmp/media_sync_dryrun.json
```

3. Pass-1 bulk copy:

```bash
docker compose -f docker-compose.prod.yml run --rm backend \
  python manage.py sync_media_to_bucket --workers 12 --skip-existing --report-json /tmp/media_sync_pass1.json
```

4. Pass-2 delta copy right before new-server cutover:

```bash
docker compose -f docker-compose.prod.yml run --rm backend \
  python manage.py sync_media_to_bucket --workers 12 --skip-existing --report-json /tmp/media_sync_pass2.json
```

5. Keep old server media volume intact until post-cutover validation is complete.

## Validation Checklist

- Dry-run returns non-zero scanned count and `would_upload > 0` (if bucket is not already fully synced).
- Pass-1 finishes with `failed=0`.
- Re-run with `--skip-existing` shows mostly skipped files.
- Invalid credentials fail with clear `CommandError`.
- Pass-2 completes with `failed=0` before switching production to the new server.

