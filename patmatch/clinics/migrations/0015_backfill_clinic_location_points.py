from django.contrib.gis.geos import Point
from django.db import migrations


def backfill_clinic_location_points(apps, schema_editor):
    Clinic = apps.get_model('clinics', 'Clinic')
    clinics = (
        Clinic.objects
        .filter(location_point__isnull=True)
        .exclude(latitude__isnull=True)
        .exclude(longitude__isnull=True)
        .only('id', 'latitude', 'longitude', 'location_point')
    )
    for clinic in clinics.iterator(chunk_size=500):
        clinic.location_point = Point(float(clinic.longitude), float(clinic.latitude), srid=4326)
        clinic.save(update_fields=['location_point'])


class Migration(migrations.Migration):

    dependencies = [
        ('clinics', '0014_marketplace_inquiries'),
    ]

    operations = [
        migrations.RunPython(backfill_clinic_location_points, migrations.RunPython.noop),
    ]
