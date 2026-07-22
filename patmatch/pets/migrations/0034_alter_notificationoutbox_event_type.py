from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pets', '0033_savedsearch_savedsearchmatch'),
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
                    ('clinic_invite_push', 'Clinic invite push'),
                    ('clinic_broadcast_push', 'Clinic broadcast push'),
                    ('clinic_chat_message_push', 'Clinic chat message push'),
                    ('clinic_booking_push', 'Clinic booking push'),
                    (
                        'account_verification_approved_push',
                        'Account verification approved push',
                    ),
                ],
                max_length=64,
            ),
        ),
    ]
