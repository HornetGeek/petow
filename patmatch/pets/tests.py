from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from django.db.models.signals import post_save
from rest_framework.test import APIRequestFactory

from accounts.models import User
from .models import Breed, Pet, Notification
from .notifications import notify_new_pet_added
from clinics.signals import claim_invites_when_user_updates
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
            last_name='User'
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
        request = self.factory.get('/api/pets/map/markers/', {
            'bbox': '30,30,31,31',
            'zoom': '12',
            'user_lat': '30.0',
        })
        response = self.view(request)
        self.assertEqual(response.status_code, 400)
