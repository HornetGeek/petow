from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import datetime


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0014_enable_server_map_clustering_default'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserNotificationSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled_global', models.BooleanField(default=True)),
                ('allow_transactional', models.BooleanField(default=True)),
                ('allow_chat', models.BooleanField(default=True)),
                ('allow_breeding', models.BooleanField(default=True)),
                ('allow_adoption', models.BooleanField(default=True)),
                ('allow_clinic', models.BooleanField(default=True)),
                ('allow_discovery', models.BooleanField(default=True)),
                ('allow_reminders', models.BooleanField(default=True)),
                ('quiet_hours_start', models.TimeField(default=datetime.time(22, 0))),
                ('quiet_hours_end', models.TimeField(default=datetime.time(8, 0))),
                ('timezone', models.CharField(default='UTC', max_length=64)),
                ('max_push_per_day', models.PositiveSmallIntegerField(default=6)),
                ('max_discovery_per_day', models.PositiveSmallIntegerField(default=2)),
                ('min_minutes_between_non_transactional', models.PositiveSmallIntegerField(default=120)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='notification_settings', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'إعدادات الإشعارات',
                'verbose_name_plural': 'إعدادات الإشعارات',
            },
        ),
    ]
