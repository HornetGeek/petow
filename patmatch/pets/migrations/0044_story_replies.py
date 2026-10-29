from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('pets', '0043_referral_points_ledger'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='story', name='allow_replies',
            field=models.BooleanField(default=True),
        ),
        migrations.CreateModel(
            name='UserBlock',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('blocked', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='blocked_by_users', to=settings.AUTH_USER_MODEL)),
                ('blocker', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='blocked_users', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(
            model_name='userblock',
            constraint=models.UniqueConstraint(fields=('blocker', 'blocked'), name='pets_user_block_pair_uniq'),
        ),
        migrations.CreateModel(
            name='StoryReplyRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('original_story_id', models.PositiveBigIntegerField()),
                ('initial_text', models.TextField(max_length=1000)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')], default='pending', max_length=16)),
                ('idempotency_key', models.CharField(max_length=100)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('sender', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sent_story_replies', to=settings.AUTH_USER_MODEL)),
                ('owner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='received_story_replies', to=settings.AUTH_USER_MODEL)),
                ('story', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reply_requests', to='pets.story')),
                ('chat_room', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='story_reply', to='pets.chatroom')),
            ],
        ),
        migrations.AddConstraint(
            model_name='storyreplyrequest',
            constraint=models.UniqueConstraint(fields=('sender', 'owner'), name='pets_story_reply_pair_uniq'),
        ),
        migrations.AddConstraint(
            model_name='storyreplyrequest',
            constraint=models.UniqueConstraint(fields=('sender', 'idempotency_key'), name='pets_story_reply_idem_uniq'),
        ),
        migrations.AddField(
            model_name='chatroom', name='story_reply_request',
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='pending_room', to='pets.storyreplyrequest'),
        ),
        migrations.AlterField(
            model_name='notification',
            name='type',
            field=models.CharField(choices=[('breeding_request_received', 'New breeding request received'), ('breeding_request_approved', 'Breeding request approved'), ('breeding_request_rejected', 'Breeding request rejected'), ('breeding_request_completed', 'Breeding meeting completed'), ('favorite_added', 'Pet added to favorites'), ('pet_availability_check', 'Pet availability check'), ('pet_status_changed', 'Pet status changed'), ('system_message', 'System message'), ('chat_message_received', 'New message received'), ('story_reply_received', 'Story reply received'), ('story_reply_approved', 'Story reply approved'), ('pet_nearby', 'A new pet is nearby'), ('adoption_pet_nearby', 'An adoptable pet is nearby'), ('saved_search_match', 'New saved-search match'), ('clinic_broadcast', 'Clinic notification'), ('clinic_invite', 'Clinic connection invitation'), ('breeding_request_pending_reminder', 'Pending breeding request reminder'), ('adoption_request_received', 'New adoption request received'), ('adoption_request_approved', 'Adoption request approved'), ('adoption_request_pending_reminder', 'Pending adoption request reminder'), ('account_verification_approved', 'Account verification approved')], help_text='نوع الإشعار', max_length=64),
        ),
        migrations.AlterField(
            model_name='notificationoutbox', name='event_type',
            field=models.CharField(max_length=64, choices=[
                ('pet_availability_push', 'Pet availability push'), ('pet_created', 'Pet created'),
                ('breeding_request_received', 'Breeding request received'),
                ('breeding_request_approved', 'Breeding request approved'),
                ('breeding_request_rejected', 'Breeding request rejected'),
                ('adoption_request_received', 'Adoption request received'),
                ('adoption_request_approved', 'Adoption request approved'),
                ('chat_message_received', 'Chat message received'),
                ('story_reply_received', 'Story reply received'),
                ('story_reply_approved', 'Story reply approved'),
                ('chat_permission_sync', 'Chat permission sync'),
                ('clinic_invite_push', 'Clinic invite push'),
                ('clinic_broadcast_push', 'Clinic broadcast push'),
                ('clinic_chat_message_push', 'Clinic chat message push'),
                ('clinic_booking_push', 'Clinic booking push'),
                ('account_verification_approved_push', 'Account verification approved push'),
            ]),
        ),
    ]
