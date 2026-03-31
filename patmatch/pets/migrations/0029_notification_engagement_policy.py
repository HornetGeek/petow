from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('pets', '0028_performance_indexes_and_chat_outbox_event'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='type',
            field=models.CharField(
                choices=[
                    ('breeding_request_received', 'تم استلام طلب مقابلة جديد'),
                    ('breeding_request_approved', 'تم قبول طلب المقابلة'),
                    ('breeding_request_rejected', 'تم رفض طلب المقابلة'),
                    ('breeding_request_completed', 'تم إكمال المقابلة'),
                    ('favorite_added', 'تم إضافة حيوانك إلى المفضلة'),
                    ('pet_status_changed', 'تم تغيير حالة حيوانك'),
                    ('system_message', 'رسالة من النظام'),
                    ('chat_message_received', 'تم استلام رسالة جديدة'),
                    ('pet_nearby', 'حيوان جديد بالقرب منك'),
                    ('adoption_pet_nearby', 'حيوان للتبني بالقرب منك'),
                    ('clinic_broadcast', 'إشعار من العيادة'),
                    ('clinic_invite', 'دعوة ربط عيادة'),
                    ('breeding_request_pending_reminder', 'تذكير بطلب مقابلة معلق'),
                    ('adoption_request_received', 'تم استلام طلب تبني جديد'),
                    ('adoption_request_approved', 'تم قبول طلب التبني'),
                    ('adoption_request_pending_reminder', 'تذكير بطلب تبني معلق'),
                    ('account_verification_approved', 'تم اعتماد التحقق من الحساب'),
                ],
                max_length=64,
                help_text='نوع الإشعار',
            ),
        ),
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(fields=['user', 'is_read', '-created_at'], name='pets_notifi_user_id_82b9a5_idx'),
        ),
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(fields=['user', 'type', '-created_at'], name='pets_notifi_user_id_8d5d81_idx'),
        ),
        migrations.CreateModel(
            name='NotificationDeliveryAttempt',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('channel', models.CharField(choices=[('push', 'Push'), ('in_app', 'In App'), ('email', 'Email')], default='push', max_length=16)),
                ('provider', models.CharField(default='fcm', max_length=32)),
                ('provider_message_id', models.CharField(blank=True, default='', max_length=255)),
                ('status', models.CharField(choices=[('queued', 'Queued'), ('sent', 'Sent'), ('failed', 'Failed'), ('suppressed', 'Suppressed')], default='queued', max_length=16)),
                ('error', models.TextField(blank=True, default='')),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('notification', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='delivery_attempts', to='pets.notification')),
            ],
            options={
                'verbose_name': 'محاولة تسليم إشعار',
                'verbose_name_plural': 'محاولات تسليم الإشعارات',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='NotificationInteractionEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_type', models.CharField(choices=[('opened', 'Opened'), ('actioned', 'Actioned'), ('dismissed', 'Dismissed')], max_length=16)),
                ('source', models.CharField(choices=[('mobile_push', 'Mobile Push'), ('web_push', 'Web Push'), ('in_app', 'In App')], max_length=24)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('notification', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='interaction_events', to='pets.notification')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notification_interaction_events', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'حدث تفاعل إشعار',
                'verbose_name_plural': 'أحداث تفاعل الإشعارات',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='notificationdeliveryattempt',
            index=models.Index(fields=['channel', 'status', '-created_at'], name='pets_notifi_channel_5bc52d_idx'),
        ),
        migrations.AddIndex(
            model_name='notificationdeliveryattempt',
            index=models.Index(fields=['notification', 'channel'], name='pets_notifi_notific_c59c19_idx'),
        ),
        migrations.AddIndex(
            model_name='notificationinteractionevent',
            index=models.Index(fields=['user', 'event_type', '-created_at'], name='pets_notifi_user_id_7e1b2e_idx'),
        ),
        migrations.AddIndex(
            model_name='notificationinteractionevent',
            index=models.Index(fields=['notification', 'event_type'], name='pets_notifi_notific_b252b3_idx'),
        ),
        migrations.AlterField(
            model_name='notificationoutbox',
            name='event_type',
            field=models.CharField(
                choices=[
                    ('pet_created', 'Pet created'),
                    ('breeding_request_received', 'Breeding request received'),
                    ('breeding_request_approved', 'Breeding request approved'),
                    ('breeding_request_rejected', 'Breeding request rejected'),
                    ('adoption_request_received', 'Adoption request received'),
                    ('adoption_request_approved', 'Adoption request approved'),
                    ('chat_message_received', 'Chat message received'),
                    ('clinic_invite_push', 'Clinic invite push'),
                    ('clinic_broadcast_push', 'Clinic broadcast push'),
                    ('clinic_chat_message_push', 'Clinic chat message push'),
                    ('account_verification_approved_push', 'Account verification approved push'),
                ],
                max_length=64,
            ),
        ),
    ]
