from django.db import migrations, models
from django.contrib.gis.geos import Point


def populate_clinic_location_points(apps, schema_editor):
    Clinic = apps.get_model('clinics', 'Clinic')
    for clinic in Clinic.objects.filter(location_point__isnull=True).exclude(
        latitude__isnull=True,
    ).exclude(longitude__isnull=True):
        clinic.location_point = Point(float(clinic.longitude), float(clinic.latitude), srid=4326)
        clinic.save(update_fields=['location_point'])


class Migration(migrations.Migration):

    dependencies = [
        ('clinics', '0013_clinic_location_point'),
    ]

    operations = [
        migrations.AddField(
            model_name='clinic',
            name='whatsapp_phone',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='contact_channel',
            field=models.CharField(
                choices=[('whatsapp', 'واتساب'), ('phone', 'هاتف'), ('app', 'التطبيق')],
                default='app',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='request_type',
            field=models.CharField(
                choices=[('inquiry', 'استفسار'), ('appointment', 'موعد')],
                default='appointment',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='source',
            field=models.CharField(default='PetMatch', max_length=80),
        ),
        migrations.AddIndex(
            model_name='clinicservice',
            index=models.Index(
                fields=['category', 'is_active', 'display_order'],
                name='clinics_cli_categor_95832a_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='clinicservice',
            index=models.Index(
                fields=['is_featured', 'base_price'],
                name='clinics_cli_is_feat_5d514f_idx',
            ),
        ),
        migrations.RunPython(populate_clinic_location_points, migrations.RunPython.noop),
    ]
