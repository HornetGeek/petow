import base64
import shutil
import tempfile
from datetime import date, time
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient, APIRequestFactory

from pets.models import Notification, NotificationOutbox

from .models import (
    Clinic,
    ClinicProduct,
    ClinicService,
    ClinicStaff,
    StorefrontBooking,
    StorefrontBookingProposal,
    VeterinaryAppointment,
)
from .views import ClinicMapMarkersView


User = get_user_model()


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

    @patch('clinics.views.Polygon.from_bbox', side_effect=RuntimeError('boom'))
    def test_service_category_failures_return_json_500(self, _from_bbox):
        request = self.factory.get('/api/clinics/map/markers/', {
            'bbox': '30,30,31,31',
            'zoom': '10',
            'service_category': 'general,vaccination,diagnostic',
        })
        response = self.view(request)
        self.assertEqual(response.status_code, 500)
        self.assertEqual(
            response.data.get('error'),
            'تعذر تحميل الخدمات على الخريطة. حاول مرة أخرى لاحقاً.',
        )
        self.assertEqual(response.data.get('release_marker'), 'clinic-map-json-error-v2')


class StorefrontBookingWorkflowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username='staff@example.com',
            email='staff@example.com',
            password='pass12345',
            user_type='clinic_staff',
        )
        self.clinic = Clinic.objects.create(
            owner=self.staff,
            name='Petow Clinic',
            address='Cairo',
            phone='01000000000',
            opening_hours='9-5',
            services='Vaccination',
        )
        ClinicStaff.objects.create(user=self.staff, clinic=self.clinic, role='owner', is_primary=True)
        self.service = ClinicService.objects.create(
            clinic=self.clinic,
            name='تطعيم',
            category='vaccination',
            applicable_pet_types=['cats'],
            base_price=250,
            duration_minutes=30,
        )
        self.booking = StorefrontBooking.objects.create(
            clinic=self.clinic,
            service=self.service,
            customer_name='Sara',
            customer_phone='01011111111',
            pet_name='Sahab',
            pet_type='cats',
            pet_breed='Persian',
            pet_age='2 years',
            preferred_date=date(2026, 7, 3),
            preferred_time=time(10, 0),
            quoted_price=250,
        )
        self.client.force_authenticate(self.staff)

    def test_public_app_booking_notifies_clinic_staff(self):
        self.client.force_authenticate(None)
        customer = User.objects.create_user(
            username='customer@example.com',
            email='customer@example.com',
            password='pass12345',
            user_type='pet_owner',
            phone='01022222222',
        )
        self.client.force_authenticate(customer)

        response = self.client.post(
            reverse('clinic-storefront-bookings', kwargs={'clinic_id': self.clinic.id}),
            {
                'service_id': self.service.id,
                'customer_name': 'Mona',
                'customer_phone': '01022222222',
                'pet_name': 'Lolo',
                'preferred_date': '2026-07-05',
                'preferred_time': '12:00',
                'request_type': 'appointment',
                'contact_channel': 'app',
                'source': 'PetMatchMobile',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        booking = StorefrontBooking.objects.get(public_id=response.data['public_id'])
        self.assertEqual(booking.customer_user, customer)
        notification = Notification.objects.get(user=self.staff, type='clinic_booking_new')
        self.assertEqual(notification.extra_data['app_type'], 'clinic_app')
        self.assertEqual(notification.extra_data['booking_public_id'], str(booking.public_id))
        self.assertTrue(
            NotificationOutbox.objects.filter(
                event_type=NotificationOutbox.EVENT_CLINIC_BOOKING_PUSH,
                object_id=notification.id,
            ).exists()
        )

    def test_accept_booking_creates_internal_patient_appointment(self):
        response = self.client.post(
            reverse('clinic-storefront-bookings-accept', kwargs={'public_id': self.booking.public_id}),
            {},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, 'confirmed')
        self.assertIsNotNone(self.booking.confirmed_appointment_id)
        self.assertEqual(VeterinaryAppointment.objects.count(), 1)
        appointment = VeterinaryAppointment.objects.get()
        self.assertEqual(appointment.clinic_patient.name, 'Sahab')
        self.assertEqual(appointment.scheduled_date, date(2026, 7, 3))
        self.assertEqual(appointment.scheduled_time, time(10, 0))

    def test_accept_booking_notifies_customer_with_push_outbox(self):
        customer = User.objects.create_user(
            username='booking-customer@example.com',
            email='booking-customer@example.com',
            password='pass12345',
            user_type='pet_owner',
            phone='01033333333',
        )
        self.booking.customer_user = customer
        self.booking.save(update_fields=['customer_user'])

        response = self.client.post(
            reverse('clinic-storefront-bookings-accept', kwargs={'public_id': self.booking.public_id}),
            {},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        notification = Notification.objects.get(user=customer, type='clinic_booking_confirmed')
        self.assertEqual(notification.extra_data['app_type'], 'petmatch_mobile')
        self.assertEqual(notification.extra_data['booking_public_id'], str(self.booking.public_id))
        self.assertTrue(
            NotificationOutbox.objects.filter(
                event_type=NotificationOutbox.EVENT_CLINIC_BOOKING_PUSH,
                object_id=notification.id,
            ).exists()
        )

    def test_reject_booking_stores_reason(self):
        response = self.client.post(
            reverse('clinic-storefront-bookings-reject', kwargs={'public_id': self.booking.public_id}),
            {'reason': 'الوقت غير متاح'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, 'cancelled')
        self.assertEqual(self.booking.cancelled_reason, 'الوقت غير متاح')
        self.assertEqual(VeterinaryAppointment.objects.count(), 0)

    def test_propose_time_creates_pending_counter_proposal(self):
        response = self.client.post(
            reverse('clinic-storefront-bookings-propose-time', kwargs={'public_id': self.booking.public_id}),
            {
                'proposed_date': '2026-07-04',
                'proposed_time': '11:30',
                'duration_minutes': 45,
                'note': 'هذا الموعد أفضل للطبيب',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, 'counter_proposed')
        proposal = StorefrontBookingProposal.objects.get(booking=self.booking)
        self.assertEqual(proposal.status, StorefrontBookingProposal.STATUS_PENDING)
        self.assertEqual(proposal.proposed_by, self.staff)


class ClinicProductImageUploadTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.settings_override = override_settings(MEDIA_ROOT=self.media_root)
        self.settings_override.enable()
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username='product-staff@example.com',
            email='product-staff@example.com',
            password='pass12345',
            user_type='clinic_staff',
        )
        self.clinic = Clinic.objects.create(
            owner=self.staff,
            name='Product Clinic',
            address='Cairo',
            phone='01000000000',
            opening_hours='9-5',
            services='Products',
        )
        ClinicStaff.objects.create(user=self.staff, clinic=self.clinic, role='owner', is_primary=True)
        self.client.force_authenticate(self.staff)

    def tearDown(self):
        self.settings_override.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)

    def test_product_upload_stores_image_in_images_list(self):
        image_bytes = base64.b64decode(
            'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
        )
        upload = SimpleUploadedFile('food.gif', image_bytes, content_type='image/gif')

        response = self.client.post(
            reverse('clinic-products-list'),
            {
                'name': 'طعام قطط',
                'category': 'food',
                'price': '180.00',
                'stock_quantity': 10,
                'low_stock_threshold': 2,
                'is_active': 'true',
                'product_image': upload,
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, 201)
        product = ClinicProduct.objects.get()
        self.assertEqual(product.clinic, self.clinic)
        self.assertEqual(len(product.images), 1)
        self.assertIn('/media/products/', product.images[0])
