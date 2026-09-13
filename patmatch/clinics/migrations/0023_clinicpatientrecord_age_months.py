from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinics', '0022_simple_veterinary_sessions'),
    ]

    operations = [
        migrations.AddField(
            model_name='clinicpatientrecord',
            name='age_months',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
