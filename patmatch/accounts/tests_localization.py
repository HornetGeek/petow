from unittest.mock import patch

from django.db import IntegrityError
from django.test import SimpleTestCase
from django.urls import reverse
from django.utils import translation
from django.utils.translation import gettext
from rest_framework.test import APITestCase

from .models import PushDevice, User


class ArabicCatalogTests(SimpleTestCase):
    def test_arabic_catalog_and_english_source(self):
        with translation.override('ar'):
            self.assertEqual(gettext('Email is required.'), 'البريد الإلكتروني مطلوب.')
        with translation.override('en'):
            self.assertEqual(gettext('Email is required.'), 'Email is required.')


class PushDeviceLanguageApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='localized-device',
            email='localized-device@example.com',
            password='testpass123',
            phone='1000000099',
        )
        self.client.force_authenticate(self.user)
        self.url = reverse('accounts:update_notification_token')

    def test_registration_persists_account_and_device_language(self):
        response = self.client.post(
            self.url,
            {
                'fcm_token': 'english-device-token',
                'device_id': 'installation-1',
                'platform': 'android',
                'app_type': 'petmatch_mobile',
                'language': 'en',
            },
            format='json',
            HTTP_ACCEPT_LANGUAGE='en',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['code'], 'push_device_registered')
        self.user.refresh_from_db()
        self.assertEqual(self.user.preferred_language, 'en')
        device = PushDevice.objects.get(user=self.user, device_id='installation-1')
        self.assertEqual(device.language, 'en')
        self.assertTrue(device.is_active)

    def test_logout_cleanup_deactivates_only_selected_installation(self):
        first = PushDevice.objects.create(
            user=self.user, device_id='installation-1', token='token-1', language='ar'
        )
        second = PushDevice.objects.create(
            user=self.user, device_id='installation-2', token='token-2', language='en'
        )

        response = self.client.delete(
            self.url,
            {'device_id': 'installation-1', 'app_type': 'petmatch_mobile'},
            format='json',
            HTTP_ACCEPT_LANGUAGE='en',
        )

        self.assertEqual(response.status_code, 200)
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertFalse(first.is_active)
        self.assertTrue(second.is_active)

    def test_last_device_logout_clears_legacy_push_fallback(self):
        self.user.fcm_token = 'token-1'
        self.user.save(update_fields=['fcm_token'])
        PushDevice.objects.create(
            user=self.user, device_id='installation-1', token='token-1', language='ar'
        )

        response = self.client.delete(
            self.url,
            {'device_id': 'installation-1', 'app_type': 'petmatch_mobile'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.fcm_token)

    def test_unsupported_language_returns_stable_code(self):
        response = self.client.post(
            self.url,
            {'fcm_token': 'token', 'device_id': 'device', 'language': 'fr'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'unsupported_language')

    def test_token_moves_between_app_installations_with_the_same_device_id(self):
        PushDevice.objects.create(
            user=self.user,
            device_id='shared-installation',
            app_type='clinic_mobile',
            token='shared-token',
            language='ar',
        )

        response = self.client.post(
            self.url,
            {
                'fcm_token': 'shared-token',
                'device_id': 'shared-installation',
                'app_type': 'petmatch_mobile',
                'language': 'en',
            },
            format='json',
            HTTP_ACCEPT_LANGUAGE='en',
        )

        self.assertEqual(response.status_code, 200)
        devices = PushDevice.objects.filter(token='shared-token')
        self.assertEqual(devices.count(), 1)
        self.assertEqual(devices.get().app_type, 'petmatch_mobile')

    @patch('accounts.views.PushDevice.objects.update_or_create')
    def test_failed_device_write_rolls_back_user_and_token_reassignment(self, update_mock):
        previous_owner = User.objects.create_user(
            username='previous-token-owner',
            email='previous-token-owner@example.com',
            password='testpass123',
            phone='1000000199',
        )
        previous_device = PushDevice.objects.create(
            user=previous_owner,
            device_id='previous-installation',
            token='reassigned-token',
            language='ar',
        )
        self.user.fcm_token = 'original-token'
        self.user.preferred_language = 'ar'
        self.user.save(update_fields=['fcm_token', 'preferred_language'])
        update_mock.side_effect = IntegrityError('simulated device failure')

        response = self.client.post(
            self.url,
            {
                'fcm_token': 'reassigned-token',
                'device_id': 'new-installation',
                'app_type': 'petmatch_mobile',
                'language': 'en',
            },
            format='json',
            HTTP_ACCEPT_LANGUAGE='en',
        )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data['code'], 'push_device_update_failed')
        self.user.refresh_from_db()
        self.assertEqual(self.user.fcm_token, 'original-token')
        self.assertEqual(self.user.preferred_language, 'ar')
        self.assertTrue(PushDevice.objects.filter(pk=previous_device.pk).exists())
