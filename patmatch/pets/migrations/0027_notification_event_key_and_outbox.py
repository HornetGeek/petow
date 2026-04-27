from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ('pets', '0026_notification_extra_data_jsonb'),
    ]

    operations = [
        migrations.AddField(
            model_name='notification',
            name='event_key',
            field=models.CharField(
                blank=True,
                db_index=True,
                help_text='مفتاح idempotency لمنع تكرار نفس الإشعار',
                max_length=255,
                null=True,
            ),
        ),
        migrations.CreateModel(
            name='NotificationOutbox',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_type', models.CharField(choices=[('pet_created', 'Pet created'), ('breeding_request_received', 'Breeding request received'), ('breeding_request_approved', 'Breeding request approved'), ('breeding_request_rejected', 'Breeding request rejected'), ('adoption_request_received', 'Adoption request received'), ('adoption_request_approved', 'Adoption request approved')], max_length=64)),
                ('object_id', models.PositiveBigIntegerField()),
                ('payload', models.JSONField(blank=True, default=dict)),
                ('dedupe_key', models.CharField(max_length=255, unique=True)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('processing', 'Processing'), ('succeeded', 'Succeeded'), ('failed', 'Failed')], default='pending', max_length=16)),
                ('attempts', models.PositiveIntegerField(default=0)),
                ('next_attempt_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('processed_at', models.DateTimeField(blank=True, null=True)),
                ('last_error', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Notification Outbox Event',
                'verbose_name_plural': 'Notification Outbox Events',
                'ordering': ['created_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='notification',
            constraint=models.UniqueConstraint(
                condition=models.Q(event_key__isnull=False),
                fields=('user', 'event_key'),
                name='pets_notification_user_event_key_uniq',
            ),
        ),
        migrations.AddIndex(
            model_name='notificationoutbox',
            index=models.Index(fields=['status', 'next_attempt_at'], name='pets_notifi_status_d39f19_idx'),
        ),
        migrations.AddIndex(
            model_name='notificationoutbox',
            index=models.Index(fields=['event_type', 'status'], name='pets_notifi_event_t_629f6d_idx'),
        ),
    ]
