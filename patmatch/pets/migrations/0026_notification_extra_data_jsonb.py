from django.db import migrations


ENFORCE_NOTIFICATION_EXTRA_DATA_JSONB_SQL = """
DO $$
DECLARE
    v_udt_name text;
BEGIN
    SELECT c.udt_name
    INTO v_udt_name
    FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'pets_notification'
      AND c.column_name = 'extra_data';

    IF v_udt_name IS NULL THEN
        RETURN;
    END IF;

    IF v_udt_name <> 'jsonb' THEN
        CREATE OR REPLACE FUNCTION _safe_to_jsonb(input_text text)
        RETURNS jsonb
        LANGUAGE plpgsql
        AS $fn$
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
        $fn$;

        ALTER TABLE pets_notification
            ALTER COLUMN extra_data TYPE jsonb
            USING _safe_to_jsonb(extra_data::text);

        DROP FUNCTION IF EXISTS _safe_to_jsonb(text);
    END IF;

    ALTER TABLE pets_notification
        ALTER COLUMN extra_data SET DEFAULT '{}'::jsonb;

    UPDATE pets_notification
    SET extra_data = '{}'::jsonb
    WHERE extra_data IS NULL;

    ALTER TABLE pets_notification
        ALTER COLUMN extra_data SET NOT NULL;
END $$;
"""


def enforce_notification_extra_data_jsonb(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return

    with schema_editor.connection.cursor() as cursor:
        cursor.execute(ENFORCE_NOTIFICATION_EXTRA_DATA_JSONB_SQL)


class Migration(migrations.Migration):
    dependencies = [
        ('pets', '0025_backfill_location_points'),
    ]

    operations = [
        migrations.RunPython(
            enforce_notification_extra_data_jsonb,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
