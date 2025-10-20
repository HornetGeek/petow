from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.db.models.signals import post_save

from accounts.models import User
from .models import Breed, Pet, Notification
from .notifications import notify_new_pet_added
from clinics.signals import claim_invites_when_user_updates


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
