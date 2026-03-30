from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.conf import settings
from django.core.cache import cache
from django.core.mail import EmailMultiAlternatives
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .brevo_email_backend import BrevoEmailBackend, BrevoSendError
from .email_delivery import EMAIL_CATEGORY_REMINDER, send_email_payload
from .email_notifications import send_password_reset_email, send_welcome_email
from .google_maps_service import GoogleMapsServiceError
from .models import MobileAppConfig, User


def build_rest_framework_override(scope_rates):
    rest_framework_settings = deepcopy(settings.REST_FRAMEWORK)
    merged_rates = dict(rest_framework_settings.get('DEFAULT_THROTTLE_RATES', {}))
    merged_rates.update(scope_rates)
    rest_framework_settings['DEFAULT_THROTTLE_RATES'] = merged_rates
    return rest_framework_settings


class BaseMapsProxyTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='maps-user',
            email='maps-user@example.com',
            password='testpass123',
            first_name='Maps',
            last_name='Tester',
            phone='1234567890',
        )
        self.autocomplete_url = reverse('accounts:maps_autocomplete')
        self.geocode_url = reverse('accounts:maps_geocode')
        self.reverse_geocode_url = reverse('accounts:maps_reverse_geocode')

    def authenticate(self):
        self.client.force_authenticate(self.user)


class MapsProxyAuthAndValidationTests(BaseMapsProxyTestCase):
    def test_maps_endpoints_require_authentication(self):
        requests_payloads = [
            (self.autocomplete_url, {'query': 'Riyadh'}),
            (self.geocode_url, {'place_id': 'ChIJmQJIxlVjLz4R6f6v8E4f8F4'}),
            (self.reverse_geocode_url, {'lat': 24.7136, 'lng': 46.6753}),
        ]
        for url, payload in requests_payloads:
            response = self.client.post(url, payload, format='json')
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_autocomplete_query_validation(self):
        self.authenticate()
        response = self.client.post(self.autocomplete_url, {'query': 'a'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('query', response.data)

    def test_reverse_geocode_coordinate_validation(self):
        self.authenticate()
        response = self.client.post(
            self.reverse_geocode_url,
            {'lat': 99.0, 'lng': 46.6753},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('lat', response.data)


class MapsProxyBehaviorTests(BaseMapsProxyTestCase):
    def setUp(self):
        super().setUp()
        self.authenticate()

    @patch('accounts.views.GoogleMapsService.autocomplete')
    def test_autocomplete_returns_normalized_payload(self, autocomplete_mock):
        autocomplete_mock.return_value = {
            'predictions': [
                {
                    'place_id': 'place-1',
                    'description': 'Riyadh, Saudi Arabia',
                    'main_text': 'Riyadh',
                    'secondary_text': 'Saudi Arabia',
                }
            ]
        }
        response = self.client.post(
            self.autocomplete_url,
            {'query': 'Riyadh', 'language': 'en', 'session_token': 'abc12345'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data.get('predictions', [])), 1)
        self.assertEqual(response.data['predictions'][0]['place_id'], 'place-1')
        autocomplete_mock.assert_called_once()

    @patch('accounts.views.GoogleMapsService.geocode_place')
    def test_geocode_returns_coordinates(self, geocode_mock):
        geocode_mock.return_value = {
            'address': 'Riyadh, Saudi Arabia',
            'lat': 24.7136,
            'lng': 46.6753,
        }
        response = self.client.post(
            self.geocode_url,
            {'place_id': 'ChIJmQJIxlVjLz4R6f6v8E4f8F4', 'language': 'en'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['lat'], 24.7136)
        self.assertEqual(response.data['lng'], 46.6753)

    @patch('accounts.views.GoogleMapsService.reverse_geocode')
    def test_upstream_errors_are_mapped(self, reverse_geocode_mock):
        reverse_geocode_mock.side_effect = GoogleMapsServiceError(
            'Google Maps quota exceeded',
            status_code=429,
            code='google_maps_quota_exceeded',
        )
        response = self.client.post(
            self.reverse_geocode_url,
            {'lat': 24.7136, 'lng': 46.6753},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.data.get('code'), 'google_maps_quota_exceeded')


@override_settings(
    REST_FRAMEWORK=build_rest_framework_override({'google_maps_autocomplete': '1/minute'})
)
class MapsAutocompleteThrottleTests(BaseMapsProxyTestCase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.authenticate()

    @patch('accounts.views.GoogleMapsService.autocomplete')
    def test_autocomplete_scope_is_throttled(self, autocomplete_mock):
        autocomplete_mock.return_value = {'predictions': []}

        first = self.client.post(self.autocomplete_url, {'query': 'Riyadh'}, format='json')
        second = self.client.post(self.autocomplete_url, {'query': 'Riyadh'}, format='json')

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


@override_settings(
    REST_FRAMEWORK=build_rest_framework_override({'google_maps_geocode': '1/minute'})
)
class MapsGeocodeThrottleTests(BaseMapsProxyTestCase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.authenticate()

    @patch('accounts.views.GoogleMapsService.geocode_place')
    @patch('accounts.views.GoogleMapsService.reverse_geocode')
    def test_geocode_and_reverse_geocode_share_scope(self, reverse_mock, geocode_mock):
        geocode_mock.return_value = {'address': 'Riyadh', 'lat': 24.7136, 'lng': 46.6753}
        reverse_mock.return_value = {'address': 'Riyadh', 'lat': 24.7136, 'lng': 46.6753}

        first = self.client.post(
            self.geocode_url,
            {'place_id': 'ChIJmQJIxlVjLz4R6f6v8E4f8F4'},
            format='json',
        )
        second = self.client.post(
            self.reverse_geocode_url,
            {'lat': 24.7136, 'lng': 46.6753},
            format='json',
        )

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class MobileAppConfigTests(APITestCase):
    def setUp(self):
        self.url = reverse('accounts:app_config')

    def test_app_config_returns_force_update_fields(self):
        config = MobileAppConfig.get_solo()
        config.android_min_supported_version = '1.0.16'
        config.ios_min_supported_version = '1.1.0'
        config.android_recommended_version = '1.0.18'
        config.ios_recommended_version = '1.1.2'
        config.android_store_url = 'https://play.google.com/store/apps/details?id=com.petmatchmobile'
        config.ios_store_url = 'https://apps.apple.com/app/id1234567890'
        config.save()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['android_min_supported_version'], '1.0.16')
        self.assertEqual(response.data['ios_min_supported_version'], '1.1.0')
        self.assertEqual(response.data['android_recommended_version'], '1.0.18')
        self.assertEqual(response.data['ios_recommended_version'], '1.1.2')
        self.assertEqual(
            response.data['android_store_url'],
            'https://play.google.com/store/apps/details?id=com.petmatchmobile',
        )
        self.assertEqual(
            response.data['ios_store_url'],
            'https://apps.apple.com/app/id1234567890',
        )

    def test_app_config_defaults_keep_force_update_fields_empty(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['android_min_supported_version'], '')
        self.assertEqual(response.data['ios_min_supported_version'], '')
        self.assertEqual(response.data['android_recommended_version'], '')
        self.assertEqual(response.data['ios_recommended_version'], '')
        self.assertEqual(response.data['android_store_url'], '')
        self.assertEqual(response.data['ios_store_url'], '')

    def test_mobile_app_config_get_solo_uses_non_breaking_defaults(self):
        config = MobileAppConfig.get_solo()

        self.assertEqual(config.key, 'default')
        self.assertEqual(config.android_min_supported_version, '')
        self.assertEqual(config.ios_min_supported_version, '')
        self.assertEqual(config.android_recommended_version, '')
        self.assertEqual(config.ios_recommended_version, '')
        self.assertEqual(config.android_store_url, '')
        self.assertEqual(config.ios_store_url, '')


@override_settings(DEBUG=False)
class PasswordResetOtpSecurityTests(APITestCase):
    def setUp(self):
        self.url = reverse('accounts:send_password_reset_otp')
        self.user = User.objects.create_user(
            username='reset-user',
            email='reset@example.com',
            password='testpass123',
            first_name='Reset',
            last_name='User',
            phone='1234567890',
        )

    def test_response_is_generic_for_existing_email_even_when_send_fails(self):
        with patch('accounts.views.send_password_reset_email', side_effect=RuntimeError('smtp failed')):
            response = self.client.post(self.url, {'email': self.user.email}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get('success'))
        self.assertEqual(
            response.data.get('message'),
            'إذا كان البريد الإلكتروني موجود، ستصلك رسالة بكود التحقق',
        )
        self.assertNotIn('debug_otp', response.data)

    def test_response_is_generic_for_unknown_email(self):
        response = self.client.post(self.url, {'email': 'unknown@example.com'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get('success'))
        self.assertEqual(
            response.data.get('message'),
            'إذا كان البريد الإلكتروني موجود، ستصلك رسالة بكود التحقق',
        )
        self.assertNotIn('debug_otp', response.data)

    def test_otp_value_is_not_logged(self):
        fake_otp = SimpleNamespace(otp_code='987654')
        with patch('accounts.views.PasswordResetOTP.generate_otp', return_value=fake_otp), patch(
            'accounts.views.send_password_reset_email',
            side_effect=RuntimeError('smtp failed'),
        ), self.assertLogs('accounts.views', level='ERROR') as logs:
            response = self.client.post(self.url, {'email': self.user.email}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('987654', '\n'.join(logs.output))


@override_settings(
    BREVO_API_KEY='test-api-key',
    BREVO_FROM_EMAIL='noreply@petow.app',
    BREVO_FROM_NAME='Petow',
    BREVO_REQUEST_TIMEOUT_SECONDS=5.0,
    BREVO_MAX_RETRIES=2,
    BREVO_RETRY_BACKOFF_SECONDS=0.1,
)
class BrevoEmailBackendTests(SimpleTestCase):
    def _email(self):
        return EmailMultiAlternatives(
            subject='Test Subject',
            body='Test Body',
            from_email='noreply@petow.app',
            to=['user@example.com'],
        )

    def _response(self, status_code, payload):
        response = Mock()
        response.status_code = status_code
        response.json.return_value = payload
        return response

    def test_transient_failure_retries_and_sets_message_id(self):
        backend = BrevoEmailBackend(fail_silently=False)
        email = self._email()
        transient = self._response(503, {'message': 'temporary outage'})
        success = self._response(201, {'messageId': 'brevo-msg-123'})

        with patch.object(backend._session, 'post', side_effect=[transient, success]) as post_mock, patch(
            'accounts.brevo_email_backend.time.sleep'
        ) as sleep_mock:
            sent = backend.send_messages([email])

        self.assertEqual(sent, 1)
        self.assertEqual(post_mock.call_count, 2)
        sleep_mock.assert_called_once()
        self.assertEqual(getattr(email, 'brevo_message_id', ''), 'brevo-msg-123')

    def test_invalid_payload_does_not_retry(self):
        backend = BrevoEmailBackend(fail_silently=False)
        email = self._email()
        invalid = self._response(400, {'message': 'invalid payload', 'code': 'invalid_parameter'})

        with patch.object(backend._session, 'post', return_value=invalid) as post_mock, patch(
            'accounts.brevo_email_backend.time.sleep'
        ) as sleep_mock:
            with self.assertRaises(BrevoSendError) as exc_context:
                backend.send_messages([email])

        self.assertEqual(post_mock.call_count, 1)
        sleep_mock.assert_not_called()
        self.assertEqual(exc_context.exception.classification, 'invalid_payload')


class EmailRenderingTests(SimpleTestCase):
    def _user_stub(self):
        return SimpleNamespace(
            id=501,
            email='render@example.com',
            first_name='Render',
            get_full_name=lambda: 'Render User',
        )

    @patch('accounts.email_notifications.send_email_payload', return_value=True)
    def test_welcome_email_contains_petow_brand_and_html(self, mocked_send_payload):
        send_welcome_email(self._user_stub())

        self.assertEqual(mocked_send_payload.call_count, 1)
        kwargs = mocked_send_payload.call_args.kwargs
        self.assertIn('Petow', kwargs['text_body'])
        self.assertIn('Petow', kwargs['html_body'])
        self.assertTrue(kwargs['html_body'])

    @patch('accounts.email_notifications.send_email_payload', return_value=True)
    def test_password_reset_email_contains_text_and_html(self, mocked_send_payload):
        send_password_reset_email(self._user_stub(), otp_code='123456')

        self.assertEqual(mocked_send_payload.call_count, 1)
        kwargs = mocked_send_payload.call_args.kwargs
        self.assertIn('123456', kwargs['text_body'])
        self.assertIn('123456', kwargs['html_body'])
        self.assertIn('Petow', kwargs['text_body'])

    @override_settings(DEFAULT_FROM_EMAIL='noreply@petow.app')
    @patch('accounts.email_delivery.EmailMultiAlternatives')
    def test_reminder_email_includes_list_unsubscribe_header(self, mocked_email_cls):
        mocked_email_instance = Mock()
        mocked_email_cls.return_value = mocked_email_instance

        send_email_payload(
            to_email='recipient@example.com',
            subject='Reminder',
            text_body='Reminder body',
            html_body='<p>Reminder body</p>',
            category=EMAIL_CATEGORY_REMINDER,
        )

        headers = mocked_email_instance.extra_headers
        self.assertIn('List-Unsubscribe', headers)
        self.assertIn('mailto:', headers['List-Unsubscribe'])
