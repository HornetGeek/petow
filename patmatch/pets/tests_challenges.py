from datetime import timedelta
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from .models import DailyChallenge, ChallengeEntry, ChallengeReaction


class DailyChallengeTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='challenger', email='challenger@example.test', password='testpass123')
        now = timezone.now()
        self.challenge = DailyChallenge.objects.create(slug='test-photo', title='صورة اليوم', description='ورّينا صورة لطيفة',
            starts_at=now - timedelta(hours=1), ends_at=now + timedelta(hours=1), is_published=True)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_current_and_archive_boundaries(self):
        self.assertEqual(self.client.get('/api/pets/challenges/current/').data['current']['id'], self.challenge.id)
        self.challenge.ends_at = timezone.now() - timedelta(seconds=1)
        self.challenge.save()
        self.assertIsNone(self.client.get('/api/pets/challenges/current/').data['current'])
        self.assertEqual(self.client.get('/api/pets/challenges/archives/').data[0]['id'], self.challenge.id)

    def test_overlapping_schedule_rejected(self):
        second = DailyChallenge(slug='overlap', title='تاني', description='وصف', starts_at=self.challenge.starts_at,
            ends_at=self.challenge.ends_at, is_published=True)
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            second.full_clean()

    def test_one_reaction_per_user(self):
        from django.core.files.base import ContentFile
        entry = ChallengeEntry.objects.create(challenge=self.challenge, user=self.user, image=ContentFile(b'placeholder', name='test.jpg'))
        ChallengeReaction.objects.create(entry=entry, user=self.user)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ChallengeReaction.objects.create(entry=entry, user=self.user)
