from decimal import Decimal
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db.models.signals import post_save
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIRequestFactory

from accounts.models import User
from clinics.signals import claim_invites_when_user_updates

from .models import AdoptionRequest, Breed, Notification, NotificationOutbox, Pet
from .notification_events import enqueue_notification_event
from .notifications import notify_new_pet_added
from .tasks import process_notification_outbox_event
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
