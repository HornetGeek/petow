from copy import deepcopy
from unittest.mock import patch

from django.conf import settings
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .google_maps_service import GoogleMapsServiceError
from .models import User


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
