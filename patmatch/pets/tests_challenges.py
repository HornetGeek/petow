import base64
import shutil
import tempfile
from datetime import timedelta
from io import BytesIO
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.db.models.signals import post_save
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User
from clinics.signals import claim_invites_when_user_updates
from .models import Breed, ChallengeEntry, ChallengeReaction, ChallengeReport, DailyChallenge, Pet, UserBlock

PNG_BYTES = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lZdEwQAAAABJRU5ErkJggg=='
)

CAIRO = ZoneInfo('Africa/Cairo')


class ChallengeMediaMixin:
    _user_seq = 0

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

    def _make_user(self, username, **kwargs):
        ChallengeMediaMixin._user_seq += 1
        email = kwargs.pop('email', f'test-{ChallengeMediaMixin._user_seq}@challenge.test')
        return User.objects.create_user(username=username, email=email, password='pass', **kwargs)

    def _image(self, name='entry.jpg', content_type='image/jpeg'):
        img = Image.new('RGB', (10, 10), color=(200, 100, 50))
        buf = BytesIO()
        img.save(buf, format='JPEG', quality=85)
        buf.seek(0)
        return SimpleUploadedFile(name, buf.read(), content_type=content_type)

    def _make_pet(self, owner, name='TestPet'):
        breed = Breed.objects.create(name=f'{name}-breed', pet_type='cats')
        return Pet.objects.create(
            owner=owner, name=name, pet_type='cats', breed=breed,
            age_months=12, gender='M', description='desc',
            main_image=self._image('pet.png'), status='available',
            location='Cairo', is_free=True,
        )

    def _make_entry(self, challenge, user, **overrides):
        defaults = {'image': self._image(f'entry_{user.id}.png')}
        defaults.update(overrides)
        return ChallengeEntry.objects.create(challenge=challenge, user=user, **defaults)


class SchedulingTests(ChallengeMediaMixin, TestCase):
    def setUp(self):
        self.user = self._make_user('scheduler')
        now = timezone.now()
        self.active = DailyChallenge.objects.create(
            slug='active', title='Active', description='desc',
            starts_at=now - timedelta(hours=1), ends_at=now + timedelta(hours=1),
            is_published=True,
        )

    def test_cairo_date_boundary(self):
        start = timezone.now().astimezone(CAIRO).replace(hour=10, minute=0, second=0, microsecond=0)
        utc_start = start.astimezone(timezone.utc)
        second = DailyChallenge(
            slug='same-day', title='Same day', description='desc',
            starts_at=utc_start, ends_at=utc_start + timedelta(hours=2),
            is_published=True,
        )
        with self.assertRaises(ValidationError):
            second.full_clean()

    def test_upcoming_in_current_response(self):
        now = timezone.now()
        DailyChallenge.objects.create(
            slug='future', title='Future', description='desc',
            starts_at=now + timedelta(hours=2), ends_at=now + timedelta(hours=4),
            is_published=True,
        )
        client = APIClient()
        data = client.get('/api/pets/challenges/current/').data
        self.assertIsNotNone(data['upcoming'])
        self.assertEqual(data['upcoming']['slug'], 'future')

    def test_state_field_transitions(self):
        now = timezone.now()
        client = APIClient()

        upcoming = DailyChallenge.objects.create(
            slug='upcoming', title='Up', description='desc',
            starts_at=now + timedelta(hours=1), ends_at=now + timedelta(hours=3),
            is_published=True,
        )
        self.assertEqual(client.get(f'/api/pets/challenges/{upcoming.id}/').data['state'], 'upcoming')
        self.assertEqual(client.get(f'/api/pets/challenges/{self.active.id}/').data['state'], 'active')

        self.active.ends_at = now - timedelta(seconds=1)
        self.active.save()
        self.assertEqual(client.get(f'/api/pets/challenges/{self.active.id}/').data['state'], 'completed')

    def test_before_start_rejects_entry(self):
        now = timezone.now()
        future = DailyChallenge.objects.create(
            slug='future-active', title='Future', description='desc',
            starts_at=now + timedelta(hours=1), ends_at=now + timedelta(hours=3),
            is_published=True,
        )
        client = APIClient()
        client.force_authenticate(self.user)
        resp = client.post(
            f'/api/pets/challenges/{future.id}/entries/create/',
            {'image': self._image()}, format='multipart',
        )
        self.assertEqual(resp.status_code, 409)

    def test_after_end_rejects_entry(self):
        now = timezone.now()
        self.active.ends_at = now - timedelta(seconds=1)
        self.active.save()
        client = APIClient()
        client.force_authenticate(self.user)
        resp = client.post(
            f'/api/pets/challenges/{self.active.id}/entries/create/',
            {'image': self._image()}, format='multipart',
        )
        self.assertEqual(resp.status_code, 409)


class PermissionTests(ChallengeMediaMixin, TestCase):
    def setUp(self):
        now = timezone.now()
        self.challenge = DailyChallenge.objects.create(
            slug='perm', title='Perm', description='desc',
            starts_at=now - timedelta(hours=1), ends_at=now + timedelta(hours=1),
            is_published=True,
        )
        self.owner = self._make_user('perm-owner')
        self.other = self._make_user('perm-other')
        self.entry = self._make_entry(self.challenge, self.owner)

    def test_unauthenticated_cannot_create_entry(self):
        client = APIClient()
        resp = client.post(
            f'/api/pets/challenges/{self.challenge.id}/entries/create/',
            {'image': self._image()}, format='multipart',
        )
        self.assertIn(resp.status_code, [401, 403])

    def test_unauthenticated_cannot_react(self):
        client = APIClient()
        self.assertIn(client.put(f'/api/pets/challenge-entries/{self.entry.id}/reaction/').status_code, [401, 403])

    def test_unauthenticated_cannot_report(self):
        client = APIClient()
        resp = client.post(
            f'/api/pets/challenge-entries/{self.entry.id}/report/',
            {'reason': 'inappropriate'}, format='json',
        )
        self.assertIn(resp.status_code, [401, 403])

    def test_unauthenticated_cannot_delete(self):
        client = APIClient()
        self.assertEqual(client.delete(f'/api/pets/challenge-entries/{self.entry.id}/').status_code, 401)

    def test_cannot_delete_others_entry(self):
        client = APIClient()
        client.force_authenticate(self.other)
        self.assertEqual(client.delete(f'/api/pets/challenge-entries/{self.entry.id}/').status_code, 403)


class IdempotencyTests(ChallengeMediaMixin, TestCase):
    def setUp(self):
        now = timezone.now()
        self.challenge = DailyChallenge.objects.create(
            slug='idempotent', title='Idem', description='desc',
            starts_at=now - timedelta(hours=1), ends_at=now + timedelta(hours=1),
            is_published=True,
        )
        self.user = self._make_user('idem-user')
        self.other = self._make_user('idem-other')
        self.other_entry = self._make_entry(self.challenge, self.other)

    def test_repeated_create_returns_same_entry(self):
        client = APIClient()
        client.force_authenticate(self.user)
        first = client.post(
            f'/api/pets/challenges/{self.challenge.id}/entries/create/',
            {'image': self._image('first.png'), 'caption': 'first'}, format='multipart',
        )
        self.assertEqual(first.status_code, 201)
        second = client.post(
            f'/api/pets/challenges/{self.challenge.id}/entries/create/',
            {'image': self._image('second.png'), 'caption': 'second'}, format='multipart',
        )
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data['id'], first.data['id'])
        self.assertEqual(ChallengeEntry.objects.filter(challenge=self.challenge, user=self.user).count(), 1)

    def test_repeated_report_is_idempotent(self):
        client = APIClient()
        client.force_authenticate(self.user)
        first = client.post(
            f'/api/pets/challenge-entries/{self.other_entry.id}/report/',
            {'reason': 'spam'}, format='json',
        )
        self.assertEqual(first.status_code, 201)
        second = client.post(
            f'/api/pets/challenge-entries/{self.other_entry.id}/report/',
            {'reason': 'spam'}, format='json',
        )
        self.assertEqual(second.status_code, 201)
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(ChallengeReport.objects.filter(entry=self.other_entry, reporter=self.user).count(), 1)

    def test_concurrent_create_does_not_duplicate(self):
        client = APIClient()
        client.force_authenticate(self.user)
        resp = client.post(
            f'/api/pets/challenges/{self.challenge.id}/entries/create/',
            {'image': self._image('concurrent.png')}, format='multipart',
        )
        self.assertEqual(resp.status_code, 201)
        ChallengeEntry.objects.filter(challenge=self.challenge, user=self.user).delete()
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ChallengeEntry.objects.create(
                    challenge=self.challenge, user=self.user,
                    image=self._image('race1.png'),
                )
                ChallengeEntry.objects.create(
                    challenge=self.challenge, user=self.user,
                    image=self._image('race2.png'),
                )


class MediaValidationTests(ChallengeMediaMixin, TestCase):
    def setUp(self):
        now = timezone.now()
        self.challenge = DailyChallenge.objects.create(
            slug='media', title='Media', description='desc',
            starts_at=now - timedelta(hours=1), ends_at=now + timedelta(hours=1),
            is_published=True,
        )
        self.user = self._make_user('media-user')

    def _post(self, image_file):
        client = APIClient()
        client.force_authenticate(self.user)
        return client.post(
            f'/api/pets/challenges/{self.challenge.id}/entries/create/',
            {'image': image_file}, format='multipart',
        )

    def test_wrong_content_type_rejected(self):
        resp = self._post(SimpleUploadedFile('entry.gif', b'GIF89a', content_type='image/gif'))
        self.assertEqual(resp.status_code, 400)

    def test_oversized_image_rejected(self):
        fake = SimpleUploadedFile('big.jpg', b'\x00' * (6 * 1024 * 1024), content_type='image/jpeg')
        resp = self._post(fake)
        self.assertEqual(resp.status_code, 400)

    def test_corrupted_image_rejected(self):
        resp = self._post(SimpleUploadedFile('bad.jpg', b'not-an-image', content_type='image/jpeg'))
        self.assertEqual(resp.status_code, 400)


class GalleryAndModerationTests(ChallengeMediaMixin, TestCase):
    def setUp(self):
        now = timezone.now()
        self.challenge = DailyChallenge.objects.create(
            slug='gallery', title='Gallery', description='desc',
            starts_at=now - timedelta(hours=1), ends_at=now + timedelta(hours=1),
            is_published=True,
        )
        self.viewer = self._make_user('gallery-viewer')
        self.author_a = self._make_user('author-a')
        self.author_b = self._make_user('author-b')
        self.author_c = self._make_user('author-c')
        self.entry_a = self._make_entry(self.challenge, self.author_a)
        self.entry_b = self._make_entry(self.challenge, self.author_b)
        self.entry_c = self._make_entry(self.challenge, self.author_c)

    def test_hidden_entries_excluded_from_gallery(self):
        self.entry_a.is_hidden = True
        self.entry_a.save()
        client = APIClient()
        client.force_authenticate(self.viewer)
        resp = client.get(f'/api/pets/challenges/{self.challenge.id}/entries/')
        ids = {item['id'] for item in resp.data['results']}
        self.assertNotIn(self.entry_a.id, ids)
        self.assertIn(self.entry_b.id, ids)

    def test_deleted_entries_excluded_from_gallery(self):
        self.entry_a.deleted_at = timezone.now()
        self.entry_a.save()
        client = APIClient()
        client.force_authenticate(self.viewer)
        resp = client.get(f'/api/pets/challenges/{self.challenge.id}/entries/')
        ids = {item['id'] for item in resp.data['results']}
        self.assertNotIn(self.entry_a.id, ids)

    def test_blocked_user_entries_excluded(self):
        UserBlock.objects.create(blocker=self.viewer, blocked=self.author_a)
        client = APIClient()
        client.force_authenticate(self.viewer)
        resp = client.get(f'/api/pets/challenges/{self.challenge.id}/entries/')
        ids = {item['id'] for item in resp.data['results']}
        self.assertNotIn(self.entry_a.id, ids)
        self.assertIn(self.entry_b.id, ids)

    def test_participant_count_excludes_hidden_deleted_blocked(self):
        self.entry_a.is_hidden = True
        self.entry_a.save()
        self.entry_b.deleted_at = timezone.now()
        self.entry_b.save()
        UserBlock.objects.create(blocker=self.viewer, blocked=self.author_c)
        client = APIClient()
        client.force_authenticate(self.viewer)
        data = client.get(f'/api/pets/challenges/{self.challenge.id}/').data
        self.assertEqual(data['participant_count'], 0)


class ReactionLifecycleTests(ChallengeMediaMixin, TestCase):
    def setUp(self):
        now = timezone.now()
        self.challenge = DailyChallenge.objects.create(
            slug='reaction', title='React', description='desc',
            starts_at=now - timedelta(hours=1), ends_at=now + timedelta(hours=1),
            is_published=True,
        )
        self.user = self._make_user('react-user')
        self.other = self._make_user('react-other')
        self.entry = self._make_entry(self.challenge, self.other)

    def test_put_creates_reaction(self):
        client = APIClient()
        client.force_authenticate(self.user)
        resp = client.put(f'/api/pets/challenge-entries/{self.entry.id}/reaction/')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['reacted'])
        self.assertEqual(resp.data['reaction_count'], 1)
        self.assertTrue(ChallengeReaction.objects.filter(entry=self.entry, user=self.user).exists())

    def test_delete_removes_reaction(self):
        ChallengeReaction.objects.create(entry=self.entry, user=self.user)
        client = APIClient()
        client.force_authenticate(self.user)
        resp = client.delete(f'/api/pets/challenge-entries/{self.entry.id}/reaction/')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data['reacted'])
        self.assertEqual(resp.data['reaction_count'], 0)
        self.assertFalse(ChallengeReaction.objects.filter(entry=self.entry, user=self.user).exists())

    def test_count_updates_correctly(self):
        client = APIClient()
        client.force_authenticate(self.user)
        client.put(f'/api/pets/challenge-entries/{self.entry.id}/reaction/')
        resp = client.get(f'/api/pets/challenge-entries/{self.entry.id}/')
        self.assertEqual(resp.data['reaction_count'], 1)
        self.assertTrue(resp.data['reacted'])
        client.delete(f'/api/pets/challenge-entries/{self.entry.id}/reaction/')
        resp = client.get(f'/api/pets/challenge-entries/{self.entry.id}/')
        self.assertEqual(resp.data['reaction_count'], 0)
        self.assertFalse(resp.data['reacted'])


class EntryLifecycleTests(ChallengeMediaMixin, TestCase):
    def setUp(self):
        now = timezone.now()
        self.challenge = DailyChallenge.objects.create(
            slug='lifecycle', title='Life', description='desc',
            starts_at=now - timedelta(hours=1), ends_at=now + timedelta(hours=1),
            is_published=True,
        )
        self.owner = self._make_user('life-owner')
        self.viewer = self._make_user('life-viewer')
        self.entry = self._make_entry(self.challenge, self.owner)

    def test_soft_delete_sets_deleted_at(self):
        client = APIClient()
        client.force_authenticate(self.owner)
        resp = client.delete(f'/api/pets/challenge-entries/{self.entry.id}/')
        self.assertEqual(resp.status_code, 204)
        self.entry.refresh_from_db()
        self.assertIsNotNone(self.entry.deleted_at)

    def test_soft_delete_frees_slot_for_resubmission(self):
        client = APIClient()
        client.force_authenticate(self.owner)
        client.delete(f'/api/pets/challenge-entries/{self.entry.id}/')
        resp = client.post(
            f'/api/pets/challenges/{self.challenge.id}/entries/create/',
            {'image': self._image('resubmit.png')}, format='multipart',
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(
            ChallengeEntry.objects.filter(challenge=self.challenge, user=self.owner, deleted_at__isnull=True).count(),
            1,
        )

    def test_visible_entry_returns_200(self):
        client = APIClient()
        client.force_authenticate(self.viewer)
        resp = client.get(f'/api/pets/challenge-entries/{self.entry.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['id'], self.entry.id)

    def test_missing_entry_returns_404(self):
        client = APIClient()
        self.assertEqual(client.get('/api/pets/challenge-entries/99999/').status_code, 404)

    def test_detail_returns_my_entry_when_user_has_entry(self):
        my_entry = self._make_entry(self.challenge, self.viewer)
        client = APIClient()
        client.force_authenticate(self.viewer)
        data = client.get(f'/api/pets/challenges/{self.challenge.id}/').data
        self.assertIsNotNone(data['my_entry'])
        self.assertEqual(data['my_entry']['id'], my_entry.id)


class PaginationTests(ChallengeMediaMixin, TestCase):
    def setUp(self):
        now = timezone.now()
        self.challenge = DailyChallenge.objects.create(
            slug='paginated', title='Pag', description='desc',
            starts_at=now - timedelta(hours=1), ends_at=now + timedelta(hours=1),
            is_published=True,
        )
        self.user = self._make_user('page-user')
        for i in range(25):
            u = self._make_user(f'page-{i}')
            self._make_entry(self.challenge, u)

    def test_cursor_pagination_returns_next_token(self):
        client = APIClient()
        client.force_authenticate(self.user)
        resp = client.get(f'/api/pets/challenges/{self.challenge.id}/entries/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['results']), 20)
        self.assertIsNotNone(resp.data['next'])
        resp2 = client.get(resp.data['next'])
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(len(resp2.data['results']), 5)
        self.assertIsNone(resp2.data['next'])


class ReportValidationTests(ChallengeMediaMixin, TestCase):
    def setUp(self):
        now = timezone.now()
        self.challenge = DailyChallenge.objects.create(
            slug='report', title='Report', description='desc',
            starts_at=now - timedelta(hours=1), ends_at=now + timedelta(hours=1),
            is_published=True,
        )
        self.reporter = self._make_user('reporter')
        self.author = self._make_user('report-author')
        self.entry = self._make_entry(self.challenge, self.author)

    def test_valid_reason_creates_report(self):
        client = APIClient()
        client.force_authenticate(self.reporter)
        resp = client.post(
            f'/api/pets/challenge-entries/{self.entry.id}/report/',
            {'reason': 'inappropriate', 'details': 'test'}, format='json',
        )
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(ChallengeReport.objects.filter(entry=self.entry, reporter=self.reporter).exists())

    def test_invalid_reason_returns_400(self):
        client = APIClient()
        client.force_authenticate(self.reporter)
        resp = client.post(
            f'/api/pets/challenge-entries/{self.entry.id}/report/',
            {'reason': 'nonsense'}, format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_cannot_report_own_entry(self):
        client = APIClient()
        client.force_authenticate(self.author)
        resp = client.post(
            f'/api/pets/challenge-entries/{self.entry.id}/report/',
            {'reason': 'spam'}, format='json',
        )
        self.assertEqual(resp.status_code, 404)


class ChallengeDetailTests(ChallengeMediaMixin, TestCase):
    def setUp(self):
        now = timezone.now()
        self.challenge = DailyChallenge.objects.create(
            slug='detail', title='Detail', description='desc',
            starts_at=now - timedelta(hours=1), ends_at=now + timedelta(hours=1),
            is_published=True,
        )
        self.unpublished = DailyChallenge.objects.create(
            slug='draft', title='Draft', description='desc',
        )

    def test_nonexistent_challenge_returns_404(self):
        client = APIClient()
        self.assertEqual(client.get('/api/pets/challenges/99999/').status_code, 404)

    def test_unpublished_challenge_returns_404(self):
        client = APIClient()
        self.assertEqual(client.get(f'/api/pets/challenges/{self.unpublished.id}/').status_code, 404)

    def test_disabled_challenge_returns_404(self):
        self.challenge.is_disabled = True
        self.challenge.save()
        client = APIClient()
        self.assertEqual(client.get(f'/api/pets/challenges/{self.challenge.id}/').status_code, 404)

    def test_archives_returns_completed_only(self):
        now = timezone.now()
        self.challenge.ends_at = now - timedelta(hours=1)
        self.challenge.save()
        client = APIClient()
        data = client.get('/api/pets/challenges/archives/').data
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['id'], self.challenge.id)

    def test_entries_404_for_nonexistent_challenge(self):
        client = APIClient()
        self.assertEqual(client.get('/api/pets/challenges/99999/entries/').status_code, 404)
