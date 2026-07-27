import base64
import shutil
import tempfile
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.conf import settings
from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.db.models.signals import post_save
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from accounts.models import User, UserNotificationSettings
from clinics.models import Clinic, ClinicService, StorefrontBooking
from clinics.signals import claim_invites_when_user_updates

from .email_notifications import send_adoption_request_email, send_daily_unread_messages_reminder
from .models import AdoptionRequest, Breed, BreedingRequest, ChatRoom, EmailReminderDispatch, EngagementEvent, Notification, NotificationDeliveryAttempt, NotificationOutbox, Pet, PetLike, SavedSearch, SavedSearchMatch, Story, StoryReaction, StoryReport, StoryView
from .notification_events import enqueue_notification_event
from .notifications import notify_adoption_request_received, notify_breeding_request_received, notify_new_adoption_pet, notify_new_pet_added
from .serializers import ChatContextSerializer, ChatRoomListSerializer, PetListSerializer, PetSerializer
from .tasks import (
    process_notification_outbox_event,
    run_auto_manage_requests,
    run_daily_unread_email_reminders,
    run_lifecycle_engagement_reminders,
)
from .views import PetMapMarkersView, chat_room_by_firebase_id, upload_chat_image


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


class PetEngagementSerializerRegressionTests(TestCase):
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
        self.owner = User.objects.create_user(
            username='engagement-owner',
            email='engagement-owner@example.com',
            password='testpass123',
            phone='1000000001',
            first_name='Engagement',
            last_name='Owner',
        )
        self.viewer = User.objects.create_user(
            username='engagement-viewer',
            email='engagement-viewer@example.com',
            password='testpass123',
            phone='1000000002',
            first_name='Engagement',
            last_name='Viewer',
        )
        self.breed = Breed.objects.create(name='Engagement Breed', pet_type='cats')
        self.pet = Pet.objects.create(
            owner=self.owner,
            name='Engagement Cat',
            pet_type='cats',
            breed=self.breed,
            age_months=14,
            gender='F',
            description='Serializer regression pet',
            hosting_preference='flexible',
            main_image=SimpleUploadedFile('engagement.jpg', b'\xff\xd8\xff', content_type='image/jpeg'),
            status='available_for_adoption',
            location='Riyadh',
            latitude=Decimal('24.71360000'),
            longitude=Decimal('46.67530000'),
            is_free=True,
        )

    def _request(self):
        request = self.factory.get('/api/pets/')
        request.user = self.viewer
        return request

    def test_pet_list_serializer_engagement_fields_without_annotation(self):
        data = PetListSerializer(
            self.pet,
            context={'request': self._request(), 'liked_pet_ids': set()},
        ).data

        self.assertEqual(data['likes_count'], 0)
        self.assertFalse(data['is_liked'])

    def test_pet_list_serializer_engagement_fields_with_annotation(self):
        PetLike.objects.create(user=self.viewer, pet=self.pet)
        pet = Pet.objects.annotate(likes_count=Count('liked_by', distinct=True)).get(pk=self.pet.pk)

        data = PetListSerializer(
            pet,
            context={'request': self._request(), 'liked_pet_ids': {self.pet.id}},
        ).data

        self.assertEqual(data['likes_count'], 1)
        self.assertTrue(data['is_liked'])

    def test_pet_detail_serializer_engagement_fields(self):
        pet = Pet.objects.annotate(likes_count=Count('liked_by', distinct=True)).get(pk=self.pet.pk)

        data = PetSerializer(
            pet,
            context={'request': self._request(), 'liked_pet_ids': set()},
        ).data

        self.assertEqual(data['likes_count'], 0)
        self.assertFalse(data['is_liked'])


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


class StoryApiTests(TestCase):
    PNG_BYTES = base64.b64decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lZdEwQAAAABJRU5ErkJggg=='
    )

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        post_save.disconnect(receiver=claim_invites_when_user_updates, sender=User)
        cls._media_dir = tempfile.mkdtemp()
        cls._override = override_settings(MEDIA_ROOT=cls._media_dir)
        cls._override.enable()

    @classmethod
    def tearDownClass(cls):
        cls._override.disable()
        shutil.rmtree(cls._media_dir, ignore_errors=True)
        post_save.connect(receiver=claim_invites_when_user_updates, sender=User)
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username='story-owner',
            email='story-owner@example.com',
            password='testpass123',
            phone='1111111111',
            first_name='Story',
            last_name='Owner',
        )
        self.viewer = User.objects.create_user(
            username='story-viewer',
            email='story-viewer@example.com',
            password='testpass123',
            phone='2222222222',
            first_name='Story',
            last_name='Viewer',
        )
        self.breed = Breed.objects.create(name='Story Breed', pet_type='cats')
        self.pet = Pet.objects.create(
            owner=self.owner,
            name='Story Pet',
            pet_type='cats',
            breed=self.breed,
            age_months=8,
            gender='F',
            description='Story pet',
            main_image=self._image('pet.png'),
            status='available',
            location='Riyadh',
            is_free=True,
        )
        self.other_pet = Pet.objects.create(
            owner=self.viewer,
            name='Other Pet',
            pet_type='cats',
            breed=self.breed,
            age_months=9,
            gender='M',
            description='Other pet',
            main_image=self._image('other_pet.png'),
            status='available',
            location='Riyadh',
            is_free=True,
        )

    def _image(self, name='story.png', content_type='image/png'):
        return SimpleUploadedFile(name, self.PNG_BYTES, content_type=content_type)

    def _story(self, author=None, **overrides):
        defaults = {
            'author': author or self.viewer,
            'image': self._image(f"story_{Story.objects.count() + 1}.png"),
            'caption': 'Active story',
            'expires_at': timezone.now() + timedelta(hours=1),
        }
        defaults.update(overrides)
        return Story.objects.create(**defaults)

    @staticmethod
    def _results(response):
        data = response.data
        return data.get('results', data) if isinstance(data, dict) else data

    def test_create_story_with_owned_pet(self):
        self.client.force_authenticate(self.owner)

        response = self.client.post(
            '/api/pets/stories/',
            {'image': self._image('create.png'), 'caption': '  صباح الخير  ', 'pet': self.pet.id},
            format='multipart',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['caption'], 'صباح الخير')
        self.assertEqual(response.data['pet']['id'], self.pet.id)
        self.assertTrue(response.data['is_mine'])
        self.assertTrue(response.data['has_viewed'])
        story = Story.objects.get(id=response.data['id'])
        self.assertEqual(story.author, self.owner)
        self.assertGreater(story.expires_at, timezone.now() + timedelta(hours=23))

    def test_create_story_rejects_unowned_pet(self):
        self.client.force_authenticate(self.owner)

        response = self.client.post(
            '/api/pets/stories/',
            {'image': self._image('unowned.png'), 'pet': self.other_pet.id},
            format='multipart',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('pet', response.data)

    def test_create_story_rejects_non_photo_upload(self):
        self.client.force_authenticate(self.owner)
        text_file = SimpleUploadedFile('story.txt', b'not-image', content_type='text/plain')

        response = self.client.post(
            '/api/pets/stories/',
            {'image': text_file},
            format='multipart',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('image', response.data)

    def test_list_excludes_hidden_deleted_and_expired_stories(self):
        active_story = self._story(author=self.viewer)
        hidden_story = self._story(author=self.viewer, is_hidden=True)
        deleted_story = self._story(author=self.viewer, deleted_at=timezone.now())
        expired_story = self._story(
            author=self.viewer,
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        self.client.force_authenticate(self.owner)

        response = self.client.get('/api/pets/stories/')

        self.assertEqual(response.status_code, 200)
        ids = {item['id'] for item in self._results(response)}
        self.assertIn(active_story.id, ids)
        self.assertNotIn(hidden_story.id, ids)
        self.assertNotIn(deleted_story.id, ids)
        self.assertNotIn(expired_story.id, ids)

    def test_list_marks_viewed_and_mine_flags(self):
        own_story = self._story(author=self.owner)
        other_story = self._story(author=self.viewer)
        StoryView.objects.create(story=other_story, user=self.owner)
        self.client.force_authenticate(self.owner)

        response = self.client.get('/api/pets/stories/')

        self.assertEqual(response.status_code, 200)
        by_id = {item['id']: item for item in self._results(response)}
        self.assertTrue(by_id[own_story.id]['is_mine'])
        self.assertTrue(by_id[own_story.id]['has_viewed'])
        self.assertFalse(by_id[other_story.id]['is_mine'])
        self.assertTrue(by_id[other_story.id]['has_viewed'])
        self.assertEqual(by_id[other_story.id]['author']['full_name'], 'Story Viewer')

    def test_delete_soft_deletes_only_owner_story(self):
        story = self._story(author=self.owner)
        self.client.force_authenticate(self.viewer)

        forbidden = self.client.delete(f'/api/pets/stories/{story.id}/')

        self.assertEqual(forbidden.status_code, 404)

        self.client.force_authenticate(self.owner)
        response = self.client.delete(f'/api/pets/stories/{story.id}/')

        self.assertEqual(response.status_code, 204)
        story.refresh_from_db()
        self.assertIsNotNone(story.deleted_at)

    def test_mark_story_viewed_is_idempotent(self):
        story = self._story(author=self.viewer)
        self.client.force_authenticate(self.owner)

        first = self.client.post(f'/api/pets/stories/{story.id}/view/')
        second = self.client.post(f'/api/pets/stories/{story.id}/view/')

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(StoryView.objects.filter(story=story, user=self.owner).count(), 1)
        self.assertEqual(
            EngagementEvent.objects.filter(
                user=self.owner,
                story=story,
                event_type=EngagementEvent.EVENT_STORY_VIEW,
            ).count(),
            1,
        )

    def test_story_reaction_is_single_active_reaction_and_visible_to_owner(self):
        story = self._story(author=self.viewer)
        self.client.force_authenticate(self.owner)

        first = self.client.post(
            f'/api/pets/stories/{story.id}/react/',
            {'reaction': StoryReaction.REACTION_HEART},
            format='json',
        )
        second = self.client.post(
            f'/api/pets/stories/{story.id}/react/',
            {'reaction': StoryReaction.REACTION_INTERESTED},
            format='json',
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data['my_reaction'], StoryReaction.REACTION_INTERESTED)
        self.assertEqual(second.data['reaction_count'], 1)
        self.assertEqual(StoryReaction.objects.filter(story=story, user=self.owner).count(), 1)
        self.assertEqual(
            StoryReaction.objects.get(story=story, user=self.owner).reaction,
            StoryReaction.REACTION_INTERESTED,
        )

        list_response = self.client.get('/api/pets/stories/')
        by_id = {item['id']: item for item in self._results(list_response)}
        self.assertEqual(by_id[story.id]['my_reaction'], StoryReaction.REACTION_INTERESTED)
        self.assertEqual(by_id[story.id]['reactions_summary'][StoryReaction.REACTION_INTERESTED], 1)

        self.client.force_authenticate(self.viewer)
        owner_response = self.client.get(f'/api/pets/stories/{story.id}/reactions/')
        blocked = self.client.post(
            f'/api/pets/stories/{story.id}/react/',
            {'reaction': StoryReaction.REACTION_HEART},
            format='json',
        )

        self.assertEqual(owner_response.status_code, 200)
        self.assertEqual(owner_response.data['count'], 1)
        self.assertEqual(owner_response.data['results'][0]['user']['id'], self.owner.id)
        self.assertEqual(blocked.status_code, 400)

    def test_story_reaction_can_be_removed(self):
        story = self._story(author=self.viewer)
        StoryReaction.objects.create(
            story=story,
            user=self.owner,
            reaction=StoryReaction.REACTION_HEART,
        )
        self.client.force_authenticate(self.owner)

        response = self.client.delete(f'/api/pets/stories/{story.id}/react/')

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['my_reaction'])
        self.assertEqual(response.data['reaction_count'], 0)
        self.assertFalse(StoryReaction.objects.filter(story=story, user=self.owner).exists())

    def test_report_story_is_duplicate_safe_and_blocks_own_story(self):
        other_story = self._story(author=self.viewer)
        own_story = self._story(author=self.owner)
        self.client.force_authenticate(self.owner)

        first = self.client.post(
            f'/api/pets/stories/{other_story.id}/report/',
            {'reason': StoryReport.REASON_SPAM, 'details': 'ad'},
            format='json',
        )
        second = self.client.post(
            f'/api/pets/stories/{other_story.id}/report/',
            {'reason': StoryReport.REASON_OTHER, 'details': 'still visible'},
            format='json',
        )
        blocked = self.client.post(
            f'/api/pets/stories/{own_story.id}/report/',
            {'reason': StoryReport.REASON_OTHER},
            format='json',
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(StoryReport.objects.filter(story=other_story, reporter=self.owner).count(), 1)
        report = StoryReport.objects.get(story=other_story, reporter=self.owner)
        self.assertEqual(report.reason, StoryReport.REASON_OTHER)


class PetEngagementApiTests(TestCase):
    PNG_BYTES = StoryApiTests.PNG_BYTES

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        post_save.disconnect(receiver=claim_invites_when_user_updates, sender=User)
        cls._media_dir = tempfile.mkdtemp()
        cls._override = override_settings(MEDIA_ROOT=cls._media_dir)
        cls._override.enable()

    @classmethod
    def tearDownClass(cls):
        cls._override.disable()
        shutil.rmtree(cls._media_dir, ignore_errors=True)
        post_save.connect(receiver=claim_invites_when_user_updates, sender=User)
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username='pet-like-owner',
            email='pet-like-owner@example.com',
            password='testpass123',
            phone='3333333333',
            first_name='Pet',
            last_name='Owner',
        )
        self.viewer = User.objects.create_user(
            username='pet-like-viewer',
            email='pet-like-viewer@example.com',
            password='testpass123',
            phone='4444444444',
            first_name='Pet',
            last_name='Viewer',
        )
        self.breed = Breed.objects.create(name='Like Breed', pet_type='dogs')
        self.pet = Pet.objects.create(
            owner=self.owner,
            name='Like Pet',
            pet_type='dogs',
            breed=self.breed,
            age_months=16,
            gender='M',
            description='Likeable pet',
            main_image=self._image('like_pet.png'),
            status='available',
            location='Riyadh',
            is_free=True,
        )

    def _image(self, name='pet.png', content_type='image/png'):
        return SimpleUploadedFile(name, self.PNG_BYTES, content_type=content_type)

    def test_toggle_pet_like_updates_state_count_and_serializer_fields(self):
        self.client.force_authenticate(self.viewer)

        first = self.client.post(
            f'/api/pets/{self.pet.id}/toggle-like/',
            {'source': EngagementEvent.SOURCE_PET_DETAILS},
            format='json',
        )
        detail = self.client.get(f'/api/pets/{self.pet.id}/')
        second = self.client.post(
            f'/api/pets/{self.pet.id}/toggle-like/',
            {'source': EngagementEvent.SOURCE_PET_DETAILS},
            format='json',
        )

        self.assertEqual(first.status_code, 200)
        self.assertTrue(first.data['is_liked'])
        self.assertEqual(first.data['likes_count'], 1)
        self.assertTrue(detail.data['is_liked'])
        self.assertEqual(detail.data['likes_count'], 1)
        self.assertEqual(PetLike.objects.filter(pet=self.pet, user=self.viewer).count(), 0)
        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.data['is_liked'])
        self.assertEqual(second.data['likes_count'], 0)
        self.assertTrue(
            EngagementEvent.objects.filter(
                user=self.viewer,
                pet=self.pet,
                event_type=EngagementEvent.EVENT_PET_LIKE,
            ).exists()
        )

    def test_create_engagement_event_records_conversion_action(self):
        self.client.force_authenticate(self.viewer)

        response = self.client.post(
            '/api/pets/engagement-events/',
            {
                'event_type': EngagementEvent.EVENT_CTA_TAP,
                'source': EngagementEvent.SOURCE_PET_DETAILS,
                'target_type': EngagementEvent.TARGET_PET,
                'pet_id': self.pet.id,
                'metadata': {'cta': 'طلب تزاوج'},
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        event = EngagementEvent.objects.get(id=response.data['id'])
        self.assertEqual(event.user, self.viewer)
        self.assertEqual(event.pet, self.pet)
        self.assertEqual(event.metadata['cta'], 'طلب تزاوج')


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


class AdoptionRequestUniquenessTests(TestCase):
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
            phone='5100000000',
            first_name='Adoption',
            last_name='Owner',
        )
        self.adopter = User.objects.create_user(
            username='adoption-user',
            email='adoption-user@example.com',
            password='testpass123',
            phone='5200000000',
            first_name='Adoption',
            last_name='User',
        )
        self.breed = Breed.objects.create(name='Constraint Breed', pet_type='cats')
        self.pet = Pet.objects.create(
            owner=self.owner,
            name='Constraint Cat',
            pet_type='cats',
            breed=self.breed,
            age_months=12,
            gender='F',
            description='Friendly cat',
            hosting_preference='flexible',
            main_image=SimpleUploadedFile('constraint.jpg', b'\xff\xd8\xff', content_type='image/jpeg'),
            status='available_for_adoption',
            location='Riyadh',
            latitude=Decimal('24.7136'),
            longitude=Decimal('46.6753'),
            is_free=True,
        )

    def _create_adoption_request(self, status='pending'):
        return AdoptionRequest.objects.create(
            adopter=self.adopter,
            pet=self.pet,
            adopter_name='Adoption User',
            adopter_email='adoption-user@example.com',
            adopter_phone='5200000000',
            adopter_age=31,
            adopter_occupation='Engineer',
            adopter_address='Riyadh',
            status=status,
        )

    def test_pending_requests_are_unique_per_adopter_and_pet(self):
        self._create_adoption_request(status='pending')

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self._create_adoption_request(status='pending')

    def test_rejected_history_can_have_multiple_attempts(self):
        first = self._create_adoption_request(status='rejected')
        second = self._create_adoption_request(status='rejected')

        self.assertNotEqual(first.id, second.id)
        self.assertEqual(
            AdoptionRequest.objects.filter(
                adopter=self.adopter,
                pet=self.pet,
                status='rejected',
            ).count(),
            2,
        )

    @patch('pets.management.commands.auto_manage_requests.send_system_message')
    def test_auto_manage_can_reject_pending_request_with_rejected_history(self, mocked_system_message):
        self._create_adoption_request(status='rejected')
        pending = self._create_adoption_request(status='pending')
        AdoptionRequest.objects.filter(id=pending.id).update(
            created_at=timezone.now() - timedelta(days=8),
        )

        call_command('auto_manage_requests')

        pending.refresh_from_db()
        self.assertEqual(pending.status, 'rejected')
        self.assertIn('auto_rejected_due_to_inactivity', pending.admin_notes)
        self.assertEqual(
            AdoptionRequest.objects.filter(
                adopter=self.adopter,
                pet=self.pet,
                status='rejected',
            ).count(),
            2,
        )
        self.assertEqual(mocked_system_message.call_count, 1)


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
        self.outsider = User.objects.create_user(
            username='outsider1',
            email='outsider@example.com',
            password='testpass123',
            phone='3000000000',
            first_name='Outside',
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

    def test_upload_chat_image_requires_authentication(self):
        request = self.factory.post(
            '/api/pets/chat/upload-image/',
            {
                'chat_id': self.chat_room.firebase_chat_id,
                'image': self._test_image('chat_upload.jpg'),
            },
            format='multipart',
        )

        response = upload_chat_image(request)

        self.assertIn(response.status_code, [401, 403])

    def test_upload_chat_image_rejects_non_participant(self):
        request = self.factory.post(
            '/api/pets/chat/upload-image/',
            {
                'chat_id': self.chat_room.firebase_chat_id,
                'image': self._test_image('chat_upload.jpg'),
            },
            format='multipart',
        )
        force_authenticate(request, user=self.outsider)

        response = upload_chat_image(request)

        self.assertEqual(response.status_code, 403)

    @patch('pets.views.default_storage.url', return_value='/media/chat_images/chat_upload.jpg')
    @patch('pets.views.default_storage.save', return_value='chat_images/chat_upload.jpg')
    def test_upload_chat_image_allows_participant(self, _mock_save, _mock_url):
        request = self.factory.post(
            '/api/pets/chat/upload-image/',
            {
                'chat_id': self.chat_room.firebase_chat_id,
                'image': self._test_image('chat_upload.jpg'),
            },
            format='multipart',
        )
        force_authenticate(request, user=self.user_a)

        response = upload_chat_image(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['image_url'], '/media/chat_images/chat_upload.jpg')

    def test_inactive_chat_can_be_fetched_by_participant_via_firebase_id(self):
        self.chat_room.archive()
        request = self.factory.get(f'/api/pets/chat/firebase/{self.chat_room.firebase_chat_id}/')
        force_authenticate(request, user=self.user_a)

        response = chat_room_by_firebase_id(request, self.chat_room.firebase_chat_id)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['is_active'])

    def test_inactive_chat_still_blocks_non_participant_via_firebase_id(self):
        self.chat_room.archive()
        request = self.factory.get(f'/api/pets/chat/firebase/{self.chat_room.firebase_chat_id}/')
        force_authenticate(request, user=self.outsider)

        response = chat_room_by_firebase_id(request, self.chat_room.firebase_chat_id)

        self.assertEqual(response.status_code, 403)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class RequestCenterSavedSearchDigestTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        post_save.disconnect(receiver=claim_invites_when_user_updates, sender=User)

    @classmethod
    def tearDownClass(cls):
        post_save.connect(receiver=claim_invites_when_user_updates, sender=User)
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username='request-owner',
            email='request-owner@example.com',
            password='testpass123',
            phone='+201000000001',
            first_name='Owner',
            last_name='Requests',
        )
        self.requester = User.objects.create_user(
            username='request-user',
            email='request-user@example.com',
            password='testpass123',
            phone='+201000000002',
            first_name='Requester',
            last_name='User',
        )
        self.breed = Breed.objects.create(name='Digest Breed', pet_type='cats')
        self.owner_pet = self._pet(self.owner, 'Owner Cat', 'F', 'available_for_adoption')
        self.requester_pet = self._pet(self.requester, 'Requester Cat', 'M', 'available')
        self.target_pet = self._pet(self.owner, 'Target Cat', 'F', 'available')
        self.adoption_request = AdoptionRequest.objects.create(
            adopter=self.requester,
            pet=self.owner_pet,
            adopter_name='Requester User',
            adopter_email=self.requester.email,
            adopter_phone=self.requester.phone,
            adopter_age=30,
            adopter_occupation='Tester',
            adopter_address='Cairo',
            housing_type='apartment',
            family_members=2,
            experience_level='basic',
            time_availability='high',
            reason_for_adoption='Ready',
            family_agreement=True,
            agrees_to_follow_up=True,
            agrees_to_vet_care=True,
            agrees_to_training=True,
            status='pending',
        )
        self.breeding_request = BreedingRequest.objects.create(
            target_pet=self.target_pet,
            requester_pet=self.requester_pet,
            requester=self.requester,
            receiver=self.owner,
            message='Can we meet?',
            contact_phone=self.requester.phone,
            status='pending',
        )
        self.chat_room = ChatRoom.objects.create(breeding_request=self.breeding_request)
        Notification.objects.create(
            user=self.owner,
            type='chat_message_received',
            title='رسالة جديدة',
            message='مرحبا',
            related_chat_room=self.chat_room,
        )
        self.clinic = Clinic.objects.create(
            owner=self.owner,
            name='Digest Clinic',
            address='Cairo',
            city='Cairo',
            phone='+201000000003',
            opening_hours='9-5',
            services='Care',
            is_active=True,
        )

        self.service = ClinicService.objects.create(
            clinic=self.clinic,
            name='Grooming',
            category='grooming',
            applicable_pet_types=['cats'],
            base_price=Decimal('50.00'),
            is_active=True,
        )

    @patch('pets.notifications._send_push_if_allowed', return_value=True)
    @patch('pets.notifications.send_breeding_request_email')
    def test_breeding_opt_out_skips_notification_record(self, mock_email, mock_push):
        self.owner.notify_breeding_requests = False
        self.owner.save(update_fields=['notify_breeding_requests'])

        result = notify_breeding_request_received(self.breeding_request)

        self.assertIsNone(result)
        self.assertFalse(
            Notification.objects.filter(
                user=self.owner,
                type='breeding_request_received',
                related_breeding_request=self.breeding_request,
            ).exists()
        )
        self.assertEqual(mock_push.call_count, 0)
        self.assertEqual(mock_email.call_count, 0)

    @patch('pets.notifications._send_push_if_allowed', return_value=True)
    @patch('pets.notifications.send_adoption_request_email')
    def test_adoption_opt_out_skips_notification_record(self, mock_email, mock_push):
        self.owner.notify_adoption_pets = False
        self.owner.save(update_fields=['notify_adoption_pets'])

        result = notify_adoption_request_received(self.adoption_request)

        self.assertIsNone(result)
        self.assertFalse(
            Notification.objects.filter(
                user=self.owner,
                type='adoption_request_received',
                related_pet=self.owner_pet,
            ).exists()
        )
        self.assertEqual(mock_push.call_count, 0)
        self.assertEqual(mock_email.call_count, 0)

    def _image(self, name):
        return SimpleUploadedFile(name, b'\xff\xd8\xff', content_type='image/jpeg')

    def _pet(self, owner, name, gender, status):
        return Pet.objects.create(
            owner=owner,
            name=name,
            pet_type='cats',
            breed=self.breed,
            age_months=12,
            gender=gender,
            description='Friendly',
            hosting_preference='flexible',
            main_image=self._image(f'{name}.jpg'),
            status=status,
            location='Cairo',
            is_free=True,
        )

    def test_request_center_aggregates_user_items_only(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get('/api/pets/request-center/')

        self.assertEqual(response.status_code, 200)
        kinds = {item['kind'] for item in response.data['results']}
        self.assertIn('adoption_received', kinds)
        self.assertIn('breeding_received', kinds)
        self.assertIn('chat_unread', kinds)
        self.assertTrue(any(item['requires_action'] for item in response.data['results']))

    def test_pending_adoption_chat_create_is_idempotent_and_context_has_viewer_role(self):
        self.client.force_authenticate(self.owner)
        response = self.client.post(
            '/api/pets/chat/create/',
            {'adoption_request_id': self.adoption_request.id},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['context']['viewer_role'], 'owner')
        self.assertEqual(response.data['context']['adoption_request']['status'], 'pending')

        second_response = self.client.post(
            '/api/pets/chat/create/',
            {'adoption_request_id': self.adoption_request.id},
            format='json',
        )

        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(
            second_response.data['chat_room']['id'],
            response.data['chat_room']['id'],
        )

        self.client.force_authenticate(self.requester)
        context_response = self.client.get(
            f"/api/pets/chat/rooms/{response.data['chat_room']['id']}/context/"
        )

        self.assertEqual(context_response.status_code, 200)
        self.assertEqual(context_response.data['chat_context']['viewer_role'], 'requester')

    def test_pending_breeding_chat_create_is_allowed_and_unrelated_user_is_rejected(self):
        target_pet = self._pet(self.owner, 'Second Target Cat', 'F', 'available')
        requester_pet = self._pet(self.requester, 'Second Requester Cat', 'M', 'available')
        breeding_request = BreedingRequest.objects.create(
            target_pet=target_pet,
            requester_pet=requester_pet,
            requester=self.requester,
            receiver=self.owner,
            message='Another match?',
            contact_phone=self.requester.phone,
            status='pending',
        )

        self.client.force_authenticate(self.requester)
        response = self.client.post(
            '/api/pets/chat/create/',
            {'breeding_request_id': breeding_request.id},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['context']['viewer_role'], 'requester')
        self.assertEqual(response.data['context']['breeding_request']['status'], 'pending')

        unrelated = User.objects.create_user(
            username='unrelated-chat-user',
            email='unrelated-chat@example.com',
            password='testpass123',
            phone='+201000000099',
        )
        self.client.force_authenticate(unrelated)
        rejected_response = self.client.post(
            '/api/pets/chat/create/',
            {'breeding_request_id': breeding_request.id},
            format='json',
        )

        self.assertEqual(rejected_response.status_code, 400)

    def test_chat_room_status_is_generic_for_adoption_and_breeding(self):
        self.client.force_authenticate(self.owner)
        adoption_create = self.client.post(
            '/api/pets/chat/create/',
            {'adoption_request_id': self.adoption_request.id},
            format='json',
        )
        adoption_status = self.client.get(
            f"/api/pets/chat/rooms/{adoption_create.data['chat_room']['id']}/status/"
        )
        breeding_status = self.client.get(f'/api/pets/chat/rooms/{self.chat_room.id}/status/')

        self.assertEqual(adoption_status.status_code, 200)
        self.assertEqual(adoption_status.data['request_kind'], 'adoption')
        self.assertEqual(adoption_status.data['request_status'], 'pending')
        self.assertEqual(adoption_status.data['chat_status'], 'pending')
        self.assertEqual(adoption_status.data['viewer_role'], 'owner')

        self.assertEqual(breeding_status.status_code, 200)
        self.assertEqual(breeding_status.data['request_kind'], 'breeding')
        self.assertEqual(breeding_status.data['request_status'], 'pending')
        self.assertEqual(breeding_status.data['chat_status'], 'pending')
        self.assertEqual(breeding_status.data['viewer_role'], 'owner')

    def test_saved_search_crud_and_preview(self):
        self.client.force_authenticate(self.owner)
        payload = {
            'name': 'قطط للتبني في القاهرة',
            'target_type': 'adoption_pet',
            'filters': {'pet_type': 'cats', 'location': 'Cairo'},
            'city': 'Cairo',
            'alerts_enabled': True,
        }
        create_response = self.client.post('/api/pets/saved-searches/', payload, format='json')

        self.assertEqual(create_response.status_code, 201)
        saved_id = create_response.data['id']
        preview_response = self.client.get(f'/api/pets/saved-searches/{saved_id}/preview/')

        self.assertEqual(preview_response.status_code, 200)
        self.assertGreaterEqual(preview_response.data['count'], 0)

        delete_response = self.client.delete(f'/api/pets/saved-searches/{saved_id}/')
        self.assertEqual(delete_response.status_code, 204)
        self.assertFalse(SavedSearch.objects.get(id=saved_id).is_active)

    def test_unsaved_preview_and_home_digest(self):
        self.client.force_authenticate(self.owner)
        saved_search = SavedSearch.objects.create(
            user=self.owner,
            name='خدمات تنظيف',
            target_type='service',
            filters={'group': 'grooming'},
            city='Cairo',
        )
        SavedSearchMatch.objects.create(
            saved_search=saved_search,
            target_type='service',
            target_id=self.service.id,
        )

        preview_response = self.client.post(
            '/api/pets/saved-searches/preview/',
            {'target_type': 'service', 'filters': {'category': 'grooming'}, 'city': 'Cairo'},
            format='json',
        )
        digest_response = self.client.get('/api/pets/home/digest/')

        self.assertEqual(preview_response.status_code, 200)
        self.assertEqual(digest_response.status_code, 200)
        module_keys = {module['key'] for module in digest_response.data['modules']}
        self.assertIn('pending_actions', module_keys)
        self.assertIn('saved_search_matches', module_keys)

    def test_storefront_booking_links_authenticated_user(self):
        self.client.force_authenticate(self.requester)
        response = self.client.post(
            f'/api/clinics/storefront/{self.clinic.id}/bookings/',
            {
                'service_id': self.service.id,
                'customer_name': 'Requester User',
                'customer_phone': self.requester.phone,
                'customer_email': self.requester.email,
                'request_type': 'inquiry',
                'contact_channel': 'app',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        booking = StorefrontBooking.objects.get(public_id=response.data['public_id'])
        self.assertEqual(booking.customer_user, self.requester)
