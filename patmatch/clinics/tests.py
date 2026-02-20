from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from .views import ClinicMapMarkersView


class ClinicMapMarkersValidationTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = ClinicMapMarkersView.as_view()

    def test_bbox_is_required(self):
        request = self.factory.get('/api/clinics/map/markers/', {'zoom': '10'})
        response = self.view(request)
        self.assertEqual(response.status_code, 400)
        self.assertIn('bbox', str(response.data.get('error', '')))

    def test_zoom_is_required(self):
        request = self.factory.get('/api/clinics/map/markers/', {'bbox': '30,30,31,31'})
        response = self.view(request)
        self.assertEqual(response.status_code, 400)
        self.assertIn('zoom', str(response.data.get('error', '')))

    def test_user_coordinates_must_be_paired(self):
        request = self.factory.get('/api/clinics/map/markers/', {
            'bbox': '30,30,31,31',
            'zoom': '10',
            'user_lng': '31.0',
        })
        response = self.view(request)
        self.assertEqual(response.status_code, 400)
