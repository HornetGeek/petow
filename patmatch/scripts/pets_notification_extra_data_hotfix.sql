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
