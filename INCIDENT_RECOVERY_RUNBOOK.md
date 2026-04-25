# Incident Recovery Runbook

This runbook covers two production failures:

1. `operator does not exist: text -> unknown` on `pets_notification.extra_data`
2. `503` responses from `/api/accounts/maps/*` when Google Maps server key is missing

## 1) Verify `pets_notification.extra_data` type

Run in PostgreSQL:

```sql
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name='pets_notification' AND column_name='extra_data';
```

Expected `udt_name`: `jsonb`

## 2) One-time DB hotfix (if type is not `jsonb`)

```sql
BEGIN;

CREATE OR REPLACE FUNCTION _safe_to_jsonb(input_text text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  IF input_text IS NULL OR btrim(input_text) = '' THEN
    RETURN '{}'::jsonb;
  END IF;

  BEGIN
    RETURN input_text::jsonb;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('legacy_text', input_text);
  END;
END;
$$;

ALTER TABLE pets_notification
  ALTER COLUMN extra_data TYPE jsonb
  USING _safe_to_jsonb(extra_data::text);

ALTER TABLE pets_notification
  ALTER COLUMN extra_data SET DEFAULT '{}'::jsonb;

UPDATE pets_notification
SET extra_data='{}'::jsonb
WHERE extra_data IS NULL;

ALTER TABLE pets_notification
  ALTER COLUMN extra_data SET NOT NULL;

DROP FUNCTION _safe_to_jsonb(text);

COMMIT;
```

Re-check:

```sql
SELECT pg_typeof(extra_data) FROM pets_notification LIMIT 1;
```

## 3) Verify Google Maps server key in backend

Inside backend container:

```bash
printenv GOOGLE_MAPS_SERVER_API_KEY
```

If empty, set it in runtime env (`docker compose` env/env_file) and restart backend container(s).

## 4) Smoke checks after restart

Expected: endpoints return non-503 (200/400/401/429 are possible depending on auth/payload/quota).

- `POST /api/accounts/maps/autocomplete/`
- `POST /api/accounts/maps/reverse-geocode/`

## 5) DB/operator validation query

```sql
SELECT id
FROM pets_notification
WHERE extra_data ->> 'invite_token' IS NOT NULL
LIMIT 1;
```

Expected: query executes without operator error.

## 6) Security hygiene

If auth tokens were exposed in logs, rotate them immediately.
