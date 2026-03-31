from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.conf import settings
from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db.models.signals import post_save
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts.models import User, UserNotificationSettings
from clinics.signals import claim_invites_when_user_updates

from .email_notifications import send_adoption_request_email, send_daily_unread_messages_reminder
from .models import AdoptionRequest, Breed, BreedingRequest, ChatRoom, EmailReminderDispatch, Notification, NotificationDeliveryAttempt, NotificationOutbox, Pet
from .notification_events import enqueue_notification_event
from .notifications import notify_new_adoption_pet, notify_new_pet_added
from .serializers import ChatContextSerializer, ChatRoomListSerializer
from .tasks import (
    process_notification_outbox_event,
    run_auto_manage_requests,
    run_daily_unread_email_reminders,
    run_lifecycle_engagement_reminders,
)
from .views import PetMapMarkersView


class NotifyNewPetAddedTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        post_save.disconnect(receiver=claim_invites_when_user_updates, sender=User)

    @classmethod
    def tearDownClass(cls):
        post_save.connect(receiver=claim_invites_when_user_updates, sender=User)
        super().tearDownClass()

    def setUp(self):
        self.owner = User.objects.create_user(
            username='owner1',
            email='owner@example.com',
            password='testpass123',
            phone='1234567890',
            first_name='Owner',
            last_name='User',
        )
        self.breed = Breed.objects.create(name='Test Breed', pet_type='cats')

    def _test_image(self):
        return SimpleUploadedFile('test.jpg', b'\xff\xd8\xff', content_type='image/jpeg')

    def test_skip_notifications_for_adoption_pets(self):
        pet = Pet.objects.create(
            owner=self.owner,
            name='Adoption Cat',
            pet_type='cats',
            breed=self.breed,
            age_months=12,
            gender='F',
            description='Looking for a home',
            hosting_preference='flexible',
            main_image=self._test_image(),
            status='available_for_adoption',
            location='Riyadh',
            latitude=Decimal('24.7136'),
            longitude=Decimal('46.6753'),
            is_free=True,
        )

        result = notify_new_pet_added(pet)

        self.assertEqual(result, [])
        self.assertEqual(Notification.objects.count(), 0)


class AdoptionPushPayloadRegressionTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        post_save.disconnect(receiver=claim_invites_when_user_updates, sender=User)

    @classmethod
    def tearDownClass(cls):
        post_save.connect(receiver=claim_invites_when_user_updates, sender=User)
        super().tearDownClass()

    def setUp(self):
        self.owner = User.objects.create_user(
            username='adoption-owner',
            email='adoption-owner@example.com',
            password='testpass123',
            phone='1231231234',
            first_name='Owner',
            last_name='Adoption',
        )
        self.recipient = User.objects.create_user(
            username='adoption-recipient',
            email='adoption-recipient@example.com',
            password='testpass123',
            phone='1231239999',
            first_name='Recipient',
            last_name='Nearby',
            latitude=Decimal('24.7136'),
            longitude=Decimal('46.6753'),
            fcm_token='recipient-token',
        )
        self.breed = Breed.objects.create(name='Adoption Push Breed', pet_type='cats')

    @staticmethod
    def _test_image():
        return SimpleUploadedFile('adoption_push.jpg', b'\xff\xd8\xff', content_type='image/jpeg')

    def test_notify_new_adoption_pet_sends_string_safe_payload(self):
        pet = Pet.objects.create(
            owner=self.owner,
            name='Nearby Adoption Cat',
            pet_type='cats',
            breed=self.breed,
            age_months=12,
            gender='F',
            description='Adopt me',
            hosting_preference='flexible',
            main_image=self._test_image(),
            status='available_for_adoption',
            location='Riyadh',
            latitude=Decimal('24.7136'),
            longitude=Decimal('46.6753'),
            is_free=True,
        )

        with patch('pets.notifications.is_user_in_variant_cohort', return_value=False), patch(
            'pets.notifications.firebase_service.is_initialized',
            True,
        ), patch('accounts.firebase_service.messaging.Message') as message_mock, patch(
            'accounts.firebase_service.messaging.send',
            return_value='firebase-message-id',
        ):
            notifications = notify_new_adoption_pet(
                pet,
                radius_km=10,
                event_key_prefix=f"adoption_pet_nearby:{pet.id}",
            )

        self.assertEqual(len(notifications), 1)
        normalized_data = message_mock.call_args.kwargs['data']
        self.assertIn('distance_km', normalized_data)
        self.assertTrue(all(isinstance(value, str) for value in normalized_data.values()))

        attempt = NotificationDeliveryAttempt.objects.filter(notification=notifications[0]).order_by('-created_at').first()
        self.assertIsNotNone(attempt)
        self.assertEqual(attempt.status, NotificationDeliveryAttempt.STATUS_SENT)


class PetMapMarkersValidationTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = PetMapMarkersView.as_view()

    def test_bbox_is_required(self):
        request = self.factory.get('/api/pets/map/markers/', {'zoom': '12'})
        response = self.view(request)
        self.assertEqual(response.status_code, 400)
        self.assertIn('bbox', str(response.data.get('error', '')))

    def test_zoom_is_required(self):
        request = self.factory.get('/api/pets/map/markers/', {'bbox': '30,30,31,31'})
        response = self.view(request)
        self.assertEqual(response.status_code, 400)
        self.assertIn('zoom', str(response.data.get('error', '')))

    def test_user_coordinates_must_be_paired(self):
        request = self.factory.get(
            '/api/pets/map/markers/',
            {
                'bbox': '30,30,31,31',
                'zoom': '12',
                'user_lat': '30.0',
            },
        )
        response = self.view(request)
        self.assertEqual(response.status_code, 400)


class NotificationOutboxTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        post_save.disconnect(receiver=claim_invites_when_user_updates, sender=User)

    @classmethod
    def tearDownClass(cls):
        post_save.connect(receiver=claim_invites_when_user_updates, sender=User)
        super().tearDownClass()

    def setUp(self):
        self.owner = User.objects.create_user(
            username='owner2',
            email='owner2@example.com',
            password='testpass123',
            phone='1111111111',
            first_name='Owner',
            last_name='Two',
        )
        self.adopter = User.objects.create_user(
            username='adopter1',
            email='adopter@example.com',
            password='testpass123',
            phone='2222222222',
            first_name='Adopter',
            last_name='User',
        )
        self.breed = Breed.objects.create(name='Outbox Breed', pet_type='cats')
        self.pet = Pet.objects.create(
            owner=self.owner,
            name='Adoption Cat',
            pet_type='cats',
            breed=self.breed,
            age_months=10,
            gender='F',
            description='Friendly cat',
            hosting_preference='flexible',
            main_image=SimpleUploadedFile('outbox.jpg', b'\xff\xd8\xff', content_type='image/jpeg'),
            status='available_for_adoption',
            location='Riyadh',
            latitude=Decimal('24.7136'),
            longitude=Decimal('46.6753'),
            is_free=True,
        )
        self.adoption_request = AdoptionRequest.objects.create(
            adopter=self.adopter,
            pet=self.pet,
            adopter_name='Adopter User',
            adopter_email='adopter@example.com',
            adopter_phone='2222222222',
            adopter_age=29,
            adopter_occupation='Engineer',
            adopter_address='Riyadh',
        )

    @patch('pets.notification_events._schedule_outbox_event')
    def test_enqueue_notification_event_deduplicates_by_key(self, mock_schedule):
        dedupe_key = f"adoption_request_received:{self.adoption_request.id}"
        first = enqueue_notification_event(
            event_type=NotificationOutbox.EVENT_ADOPTION_REQUEST_RECEIVED,
            object_id=self.adoption_request.id,
            dedupe_key=dedupe_key,
        )
        second = enqueue_notification_event(
            event_type=NotificationOutbox.EVENT_ADOPTION_REQUEST_RECEIVED,
            object_id=self.adoption_request.id,
            dedupe_key=dedupe_key,
        )

        self.assertEqual(first.id, second.id)
        self.assertEqual(NotificationOutbox.objects.count(), 1)
        self.assertGreaterEqual(mock_schedule.call_count, 1)

    @patch('pets.notifications._send_push_if_allowed', return_value=True)
    @patch('pets.notifications.send_adoption_request_email')
    def test_process_outbox_event_is_idempotent(self, mock_send_email, mock_send_push):
        outbox_event = NotificationOutbox.objects.create(
            event_type=NotificationOutbox.EVENT_ADOPTION_REQUEST_RECEIVED,
            object_id=self.adoption_request.id,
            dedupe_key=f"adoption_request_received:{self.adoption_request.id}",
        )

        process_notification_outbox_event(outbox_event.id)
        outbox_event.refresh_from_db()

        expected_event_key = f"adoption_request_received:{self.adoption_request.id}:{self.owner.id}"
        self.assertEqual(outbox_event.status, NotificationOutbox.STATUS_SUCCEEDED)
        self.assertEqual(Notification.objects.filter(event_key=expected_event_key).count(), 1)
        self.assertEqual(mock_send_email.call_count, 1)
        self.assertEqual(mock_send_push.call_count, 1)

        process_notification_outbox_event(outbox_event.id)
        self.assertEqual(Notification.objects.filter(event_key=expected_event_key).count(), 1)
        self.assertEqual(mock_send_email.call_count, 1)
        self.assertEqual(mock_send_push.call_count, 1)

    @patch('pets.email_notifications.send_email_payload', return_value=True)
    def test_adoption_email_uses_branded_html_and_text(self, mocked_send_email_payload):
        send_adoption_request_email(self.adoption_request)

        self.assertEqual(mocked_send_email_payload.call_count, 1)
        kwargs = mocked_send_email_payload.call_args.kwargs
        self.assertIn('Petow', kwargs['text_body'])
        self.assertIn('Petow', kwargs['html_body'])
        self.assertTrue(kwargs['html_body'])


class DailyReminderEmailPolicyTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        post_save.disconnect(receiver=claim_invites_when_user_updates, sender=User)

    @classmethod
    def tearDownClass(cls):
        post_save.connect(receiver=claim_invites_when_user_updates, sender=User)
        super().tearDownClass()

    def setUp(self):
        self.target_date = timezone.localdate()
        self.opted_out_user = User.objects.create_user(
            username='optedout',
            email='optedout@example.com',
            password='testpass123',
            phone='3000000000',
            first_name='Opted',
            last_name='Out',
        )
        self.eligible_user = User.objects.create_user(
            username='eligible',
            email='eligible@example.com',
            password='testpass123',
            phone='4000000000',
            first_name='Eligible',
            last_name='User',
        )

        opted_settings, _ = UserNotificationSettings.objects.get_or_create(user=self.opted_out_user)
        opted_settings.allow_reminder_email = False
        opted_settings.allow_reminders = True
        opted_settings.save(update_fields=['allow_reminder_email', 'allow_reminders', 'updated_at'])

        for user in (self.opted_out_user, self.eligible_user):
            Notification.objects.create(
                user=user,
                type='chat_message_received',
                title='Unread chat message',
                message='You have a new chat message',
                is_read=False,
                extra_data={'sender_name': 'Sender A'},
            )

    @patch('pets.email_notifications.send_email_payload', return_value=True)
    def test_daily_reminder_respects_email_opt_out(self, mocked_send):
        result = send_daily_unread_messages_reminder(target_date=self.target_date)

        self.assertEqual(result['sent'], 1)
        self.assertEqual(result['failed'], 0)
        self.assertEqual(result['skipped_opt_out'], 1)
        self.assertEqual(mocked_send.call_count, 1)
        self.assertIn('eligible@example.com', mocked_send.call_args.kwargs['to_email'])

    @patch('pets.email_notifications.send_email_payload', return_value=True)
    def test_daily_reminder_is_deduped_per_user_per_day(self, mocked_send):
        first = send_daily_unread_messages_reminder(target_date=self.target_date)
        second = send_daily_unread_messages_reminder(target_date=self.target_date)

        self.assertEqual(first['sent'], 1)
        self.assertEqual(second['sent'], 0)
        self.assertEqual(second['attempted'], 0)
        self.assertGreaterEqual(second['skipped_deduped'], 1)
        self.assertEqual(mocked_send.call_count, 1)

        dispatch = EmailReminderDispatch.objects.get(
            user=self.eligible_user,
            reminder_key=EmailReminderDispatch.REMINDER_DAILY_UNREAD_MESSAGES,
            target_date=self.target_date,
        )
        self.assertEqual(dispatch.status, EmailReminderDispatch.STATUS_SENT)


class PetOnboardingStateSignalTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        post_save.disconnect(receiver=claim_invites_when_user_updates, sender=User)

    @classmethod
    def tearDownClass(cls):
        post_save.connect(receiver=claim_invites_when_user_updates, sender=User)
        super().tearDownClass()

    def setUp(self):
        self.user = User.objects.create_user(
            username='signal-owner',
            email='signal-owner@example.com',
            password='testpass123',
            phone='5555555555',
            first_name='Signal',
            last_name='Owner',
        )
        self.breed = Breed.objects.create(name='Signal Breed', pet_type='cats')

    def _create_pet(self, name: str):
        return Pet.objects.create(
            owner=self.user,
            name=name,
            pet_type='cats',
            breed=self.breed,
            age_months=8,
            gender='F',
            description='Signal test pet',
            hosting_preference='flexible',
            main_image=SimpleUploadedFile(f'{name}.jpg', b'\xff\xd8\xff', content_type='image/jpeg'),
            status='available',
            location='Riyadh',
            is_free=True,
        )

    def test_first_pet_creation_sets_first_pet_created_at(self):
        self.assertIsNone(self.user.first_pet_created_at)

        pet = self._create_pet('first-pet')
        self.user.refresh_from_db()

        self.assertIsNotNone(self.user.first_pet_created_at)
        self.assertEqual(self.user.first_pet_created_at, pet.created_at)

    def test_subsequent_pet_creation_does_not_overwrite_first_pet_created_at(self):
        self._create_pet('first-pet')
        self.user.refresh_from_db()
        fixed_timestamp = self.user.first_pet_created_at - timedelta(days=2)
        self.user.first_pet_created_at = fixed_timestamp
        self.user.save(update_fields=['first_pet_created_at'])

        self._create_pet('second-pet')
        self.user.refresh_from_db()

        self.assertEqual(self.user.first_pet_created_at, fixed_timestamp)


class LifecycleEngagementReminderCommandTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        post_save.disconnect(receiver=claim_invites_when_user_updates, sender=User)

    @classmethod
    def tearDownClass(cls):
        post_save.connect(receiver=claim_invites_when_user_updates, sender=User)
        super().tearDownClass()

    def _create_user(self, email: str, joined_hours_ago: int, first_pet_created_at=None):
        user = User.objects.create_user(
            username=email,
            email=email,
            password='testpass123',
            phone='7000000000',
            first_name='Lifecycle',
            last_name='User',
        )
        joined_at = timezone.now() - timedelta(hours=joined_hours_ago)
        User.objects.filter(id=user.id).update(
            date_joined=joined_at,
            first_pet_created_at=first_pet_created_at,
        )
        user.refresh_from_db()
        return user

    def _campaign_count(self, user: User):
        return Notification.objects.filter(
            user=user,
            type='system_message',
            extra_data__campaign_key='lifecycle_profile_setup',
        ).count()

    @patch('pets.management.commands.send_lifecycle_engagement_reminders._send_push_if_allowed', return_value=False)
    def test_no_pet_onboarding_reminder_not_sent_before_24_hours(self, _mock_push):
        user = self._create_user('new-owner@example.com', joined_hours_ago=23)

        call_command('send_lifecycle_engagement_reminders')

        self.assertEqual(self._campaign_count(user), 0)

    @patch('pets.management.commands.send_lifecycle_engagement_reminders._send_push_if_allowed', return_value=False)
    def test_no_pet_onboarding_reminder_sent_after_24_hours_when_under_cap(self, _mock_push):
        user = self._create_user('eligible-owner@example.com', joined_hours_ago=26)

        call_command('send_lifecycle_engagement_reminders')

        self.assertEqual(self._campaign_count(user), 1)

    @patch('pets.management.commands.send_lifecycle_engagement_reminders._send_push_if_allowed', return_value=False)
    def test_no_pet_onboarding_reminder_not_sent_after_three_reminders(self, _mock_push):
        user = self._create_user('capped-owner@example.com', joined_hours_ago=48)

        for index in range(3):
            Notification.objects.create(
                user=user,
                type='system_message',
                title=f'Reminder {index + 1}',
                message='Existing lifecycle reminder',
                extra_data={'campaign_key': 'lifecycle_profile_setup'},
                event_key=f'lifecycle_profile_setup:seed:{user.id}:{index}',
            )

        call_command('send_lifecycle_engagement_reminders')

        self.assertEqual(self._campaign_count(user), 3)

    @patch('pets.management.commands.send_lifecycle_engagement_reminders._send_push_if_allowed', return_value=False)
    def test_no_pet_onboarding_reminder_not_sent_after_first_pet_was_created(self, _mock_push):
        first_pet_created_at = timezone.now() - timedelta(days=3)
        user = self._create_user(
            'has-pet-history@example.com',
            joined_hours_ago=72,
            first_pet_created_at=first_pet_created_at,
        )

        call_command('send_lifecycle_engagement_reminders')

        self.assertEqual(self._campaign_count(user), 0)


class ScheduledReminderTaskWrapperTests(SimpleTestCase):
    @patch('pets.tasks.call_command')
    def test_run_lifecycle_engagement_reminders_calls_management_command(self, mocked_call_command):
        run_lifecycle_engagement_reminders()
        mocked_call_command.assert_called_once_with('send_lifecycle_engagement_reminders')

    @patch('pets.tasks.call_command')
    def test_run_auto_manage_requests_calls_management_command(self, mocked_call_command):
        run_auto_manage_requests()
        mocked_call_command.assert_called_once_with('auto_manage_requests')

    @patch('pets.tasks.call_command')
    def test_run_daily_unread_email_reminders_calls_management_command(self, mocked_call_command):
        run_daily_unread_email_reminders()
        mocked_call_command.assert_called_once_with('send_daily_reminders')


class LifecycleScheduleConfigurationTests(SimpleTestCase):
    def test_celery_timezone_follows_project_timezone(self):
        self.assertEqual(settings.CELERY_TIMEZONE, settings.TIME_ZONE)

    def test_celery_beat_schedule_includes_new_reminder_jobs(self):
        beat_schedule = settings.CELERY_BEAT_SCHEDULE
        self.assertIn('lifecycle-engagement-reminders-hourly', beat_schedule)
        self.assertIn('auto-manage-requests-hourly', beat_schedule)
        self.assertIn('daily-unread-email-reminders', beat_schedule)

        self.assertEqual(
            beat_schedule['lifecycle-engagement-reminders-hourly']['task'],
            'pets.tasks.run_lifecycle_engagement_reminders',
        )
        self.assertEqual(
            beat_schedule['auto-manage-requests-hourly']['task'],
            'pets.tasks.run_auto_manage_requests',
        )
        self.assertEqual(
            beat_schedule['daily-unread-email-reminders']['task'],
            'pets.tasks.run_daily_unread_email_reminders',
        )

        scheduled_tasks = {item.get('task') for item in beat_schedule.values()}
        self.assertNotIn('pets.tasks.send_pending_breeding_reminders', scheduled_tasks)


class ChatOtherPetDisplayTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        post_save.disconnect(receiver=claim_invites_when_user_updates, sender=User)

    @classmethod
    def tearDownClass(cls):
        post_save.connect(receiver=claim_invites_when_user_updates, sender=User)
        super().tearDownClass()

    def setUp(self):
        self.factory = APIRequestFactory()
        self.user_a = User.objects.create_user(
            username='requester1',
            email='requester@example.com',
            password='testpass123',
            phone='1000000000',
            first_name='Requester',
            last_name='User',
        )
        self.user_b = User.objects.create_user(
            username='receiver1',
            email='receiver@example.com',
            password='testpass123',
            phone='2000000000',
            first_name='Receiver',
            last_name='User',
        )
        self.breed = Breed.objects.create(name='Chat Breed', pet_type='cats')

        self.pet_a = Pet.objects.create(
            owner=self.user_a,
            name='Pet A',
            pet_type='cats',
            breed=self.breed,
            age_months=12,
            gender='M',
            description='Pet A desc',
            main_image=self._test_image('pet_a.jpg'),
            status='available',
            location='Riyadh',
            is_free=True,
        )
        self.pet_b = Pet.objects.create(
            owner=self.user_b,
            name='Pet B',
            pet_type='cats',
            breed=self.breed,
            age_months=10,
            gender='F',
            description='Pet B desc',
            main_image=self._test_image('pet_b.jpg'),
            status='available',
            location='Riyadh',
            is_free=True,
        )

        self.breeding_request = BreedingRequest.objects.create(
            target_pet=self.pet_b,
            requester_pet=self.pet_a,
            requester=self.user_a,
            receiver=self.user_b,
            contact_phone='1234567890',
            status='approved',
        )
        self.chat_room = ChatRoom.objects.create(breeding_request=self.breeding_request)

    def _test_image(self, name: str):
        return SimpleUploadedFile(name, b'\xff\xd8\xff', content_type='image/jpeg')

    def _serialize_list(self, user: User):
        request = self.factory.get('/api/pets/chat/rooms/')
        force_authenticate(request, user=user)
        return ChatRoomListSerializer(self.chat_room, context={'request': request}).data

    def _serialize_context(self, user: User):
        request = self.factory.get(f'/api/pets/chat/rooms/{self.chat_room.id}/context/')
        force_authenticate(request, user=user)
        return ChatContextSerializer(self.chat_room, context={'request': request}).data['chat_context']

    def test_requester_sees_target_pet_as_other_pet(self):
        data = self._serialize_list(self.user_a)
        self.assertEqual(data['pet_name'], self.pet_b.name)
        self.assertEqual(data['pet_image'], self.pet_b.main_image.url)

        ctx = self._serialize_context(self.user_a)
        self.assertEqual(ctx['pet']['id'], self.pet_b.id)
        self.assertEqual(ctx['pet']['main_image'], self.pet_b.main_image.url)

    def test_target_owner_sees_requester_pet_as_other_pet(self):
        data = self._serialize_list(self.user_b)
        self.assertEqual(data['pet_name'], self.pet_a.name)
        self.assertEqual(data['pet_image'], self.pet_a.main_image.url)

        ctx = self._serialize_context(self.user_b)
        self.assertEqual(ctx['pet']['id'], self.pet_a.id)
        self.assertEqual(ctx['pet']['main_image'], self.pet_a.main_image.url)
