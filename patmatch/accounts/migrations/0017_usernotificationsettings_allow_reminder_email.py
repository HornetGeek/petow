from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0016_mobileappconfig_force_update_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='usernotificationsettings',
            name='allow_reminder_email',
            field=models.BooleanField(default=True),
        ),
    ]
