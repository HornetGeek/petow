from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0019_add_google_auth_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='mobileappconfig',
            name='home_digest_enabled',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='mobileappconfig',
            name='request_center_enabled',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='mobileappconfig',
            name='saved_searches_enabled',
            field=models.BooleanField(default=True),
        ),
    ]
