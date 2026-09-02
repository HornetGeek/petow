from django.db import migrations, models
import django.db.models.deletion


def backfill_push_devices(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    PushDevice = apps.get_model('accounts', 'PushDevice')
    for user in User.objects.exclude(fcm_token__isnull=True).exclude(fcm_token='').iterator():
        PushDevice.objects.get_or_create(
            token=user.fcm_token,
            defaults={
                'user_id': user.id,
                'device_id': f'legacy-user-{user.id}',
                'app_type': 'petmatch_mobile',
                'language': 'ar',
                'is_active': True,
            },
        )


class Migration(migrations.Migration):
    dependencies = [('accounts', '0021_mobileappconfig_provider_onboarding')]

    operations = [
        migrations.AddField(
            model_name='user',
            name='preferred_language',
            field=models.CharField(
                choices=[('ar', 'العربية'), ('en', 'English')],
                db_index=True,
                default='ar',
                max_length=2,
            ),
        ),
        migrations.CreateModel(
            name='PushDevice',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('device_id', models.CharField(max_length=128)),
                ('token', models.TextField(unique=True)),
                ('platform', models.CharField(blank=True, default='', max_length=20)),
                ('app_type', models.CharField(default='petmatch_mobile', max_length=40)),
                ('language', models.CharField(choices=[('ar', 'العربية'), ('en', 'English')], default='ar', max_length=2)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('last_seen_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='push_devices', to='accounts.user')),
            ],
        ),
        migrations.AddConstraint(
            model_name='pushdevice',
            constraint=models.UniqueConstraint(fields=('user', 'device_id', 'app_type'), name='accounts_push_device_installation_unique'),
        ),
        migrations.AddIndex(
            model_name='pushdevice',
            index=models.Index(fields=['user', 'is_active'], name='accounts_push_user_active_idx'),
        ),
        migrations.RunPython(backfill_push_devices, migrations.RunPython.noop),
    ]
