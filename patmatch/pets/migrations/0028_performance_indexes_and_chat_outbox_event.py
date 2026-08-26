from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('pets', '0027_notification_event_key_and_outbox'),
    ]

    operations = [
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
                ],
                max_length=64,
            ),
        ),
        migrations.AddIndex(
            model_name='pet',
            index=models.Index(fields=['status', 'created_at'], name='pets_pet_status_5ce6d5_idx'),
        ),
        migrations.AddIndex(
            model_name='breedingrequest',
            index=models.Index(fields=['requester', 'created_at'], name='pets_breedi_request_55bc14_idx'),
        ),
        migrations.AddIndex(
            model_name='breedingrequest',
            index=models.Index(fields=['receiver', 'created_at'], name='pets_breedi_receive_f0df09_idx'),
        ),
        migrations.AddIndex(
            model_name='breedingrequest',
            index=models.Index(fields=['status', 'created_at'], name='pets_breedi_status_2c575a_idx'),
        ),
        migrations.AddIndex(
            model_name='chatroom',
            index=models.Index(fields=['is_active', 'updated_at'], name='pets_chatro_is_acti_6cab74_idx'),
        ),
        migrations.AddIndex(
            model_name='adoptionrequest',
            index=models.Index(fields=['adopter', 'created_at'], name='pets_adopti_adopter_e507df_idx'),
        ),
        migrations.AddIndex(
            model_name='adoptionrequest',
            index=models.Index(fields=['pet', 'status', 'created_at'], name='pets_adopti_pet_id_5cc999_idx'),
        ),
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(
                fields=['user', 'type', 'is_read', 'related_chat_room'],
                name='pets_notifi_user_id_a8a6dd_idx',
            ),
        ),
    ]
