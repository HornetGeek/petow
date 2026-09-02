from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0020_mobileappconfig_engagement_flags'),
    ]

    operations = [
        migrations.AddField(
            model_name='mobileappconfig',
            name='provider_onboarding_enabled',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='mobileappconfig',
            name='provider_onboarding_whatsapp',
            field=models.CharField(blank=True, default='', max_length=30),
        ),
    ]
