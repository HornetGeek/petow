from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('pets', '0035_merge_0034_notificationoutbox_adoption_unique')]

    operations = [
        migrations.AddField(
            model_name='notification',
            name='template_key',
            field=models.CharField(blank=True, db_index=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name='notification',
            name='template_context',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AlterField(
            model_name='notification',
            name='type',
            field=models.CharField(
                choices=[
                    ('breeding_request_received', 'New breeding request received'),
                    ('breeding_request_approved', 'Breeding request approved'),
                    ('breeding_request_rejected', 'Breeding request rejected'),
                    ('breeding_request_completed', 'Breeding meeting completed'),
                    ('favorite_added', 'Pet added to favorites'),
                    ('pet_status_changed', 'Pet status changed'),
                    ('system_message', 'System message'),
                    ('chat_message_received', 'New message received'),
                    ('pet_nearby', 'A new pet is nearby'),
                    ('adoption_pet_nearby', 'An adoptable pet is nearby'),
                    ('saved_search_match', 'New saved-search match'),
                    ('clinic_broadcast', 'Clinic notification'),
                    ('clinic_invite', 'Clinic connection invitation'),
                    ('breeding_request_pending_reminder', 'Pending breeding request reminder'),
                    ('adoption_request_received', 'New adoption request received'),
                    ('adoption_request_approved', 'Adoption request approved'),
                    ('adoption_request_pending_reminder', 'Pending adoption request reminder'),
                    ('account_verification_approved', 'Account verification approved'),
                ],
                help_text='نوع الإشعار',
                max_length=64,
            ),
        ),
    ]
