import base64
import shutil
import tempfile
from io import StringIO
from datetime import date, time
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient, APIRequestFactory

from pets.models import Breed, Notification, NotificationOutbox, Pet

from .models import (
    Clinic,
    ClinicProduct,
    ClinicClientRecord,
    ClinicPatientDocument,
    ClinicPatientNote,
    ClinicPatientRecord,
    ClinicService,
    ClinicStaff,
    StorefrontBooking,
    StorefrontBookingProposal,
    StorefrontBookingTimeline,
    VeterinaryAppointment,
    VeterinarySession,
)
from .views import ClinicMapMarkersView, ClinicStorefrontBookingViewSet


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

    def test_booking_for_update_does_not_use_nullable_select_related_joins(self):
        factory = APIRequestFactory()
        request = factory.post(
            reverse('clinic-storefront-bookings-accept', kwargs={'public_id': self.booking.public_id}),
            {},
            format='json',
        )
        request.user = self.staff
        view = ClinicStorefrontBookingViewSet()
        view.request = request
        view.action = 'accept'
        view.kwargs = {'public_id': self.booking.public_id}

        booking = view._get_booking_for_update(self.booking.public_id)

        self.assertEqual(booking, self.booking)
        self.assertFalse(booking._state.fields_cache)

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

    def test_public_app_booking_copies_service_currency(self):
        self.service.currency = 'USD'
        self.service.save(update_fields=['currency'])

        response = self.client.post(
            reverse('clinic-storefront-bookings', kwargs={'clinic_id': self.clinic.id}),
            {
                'service_id': self.service.id,
                'customer_name': 'Mona',
                'customer_phone': '01022222222',
                'pet_name': None,
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
        self.assertEqual(booking.quoted_currency, 'USD')
        self.assertEqual(response.data['quoted_currency'], 'USD')

    def test_public_app_booking_auto_confirm_links_appointment(self):
        self.client.force_authenticate(None)
        customer = User.objects.create_user(
            username='linked-customer@example.com',
            email='linked-customer@example.com',
            password='pass12345',
            user_type='pet_owner',
            phone='01044444444',
        )
        breed = Breed.objects.create(name='Persian', pet_type='cats')
        pet = Pet.objects.create(
            owner=customer,
            name='Lolo',
            pet_type='cats',
            breed=breed,
            age_months=18,
            gender='F',
            description='Friendly cat',
            hosting_preference='flexible',
            main_image=SimpleUploadedFile('cat.jpg', b'\xff\xd8\xff', content_type='image/jpeg'),
            location='Cairo',
            is_free=True,
        )
        owner = ClinicClientRecord.objects.create(
            clinic=self.clinic,
            full_name='Mona',
            phone='01044444444',
            email='linked-customer@example.com',
        )
        ClinicPatientRecord.objects.create(
            clinic=self.clinic,
            owner=owner,
            linked_user=customer,
            linked_pet=pet,
            name='Lolo',
            species='cats',
            breed='Persian',
        )
        self.client.force_authenticate(customer)

        response = self.client.post(
            reverse('clinic-storefront-bookings', kwargs={'clinic_id': self.clinic.id}),
            {
                'service_id': self.service.id,
                'customer_name': 'Mona',
                'customer_phone': '01044444444',
                'customer_email': 'linked-customer@example.com',
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
        self.assertEqual(booking.status, 'accepted')
        self.assertIsNotNone(booking.confirmed_appointment_id)
        self.assertEqual(booking.confirmed_appointment.pet, pet)
        self.assertEqual(booking.confirmed_appointment.owner, customer)
        self.assertIsNotNone(booking.confirmed_appointment.clinic_patient_id)
        self.assertEqual(booking.confirmed_appointment.clinic_patient.linked_pet, pet)
        self.assertTrue(
            StorefrontBookingTimeline.objects.filter(
                booking=booking,
                event_type='appointment_scheduled',
            ).exists()
        )

    def test_public_app_booking_auto_confirm_creates_patient_for_linked_pet(self):
        self.client.force_authenticate(None)
        customer = User.objects.create_user(
            username='new-linked-customer@example.com',
            email='new-linked-customer@example.com',
            password='pass12345',
            user_type='pet_owner',
            phone='01055555555',
        )
        breed = Breed.objects.create(name='Siamese', pet_type='cats')
        pet = Pet.objects.create(
            owner=customer,
            name='Misho',
            pet_type='cats',
            breed=breed,
            age_months=9,
            gender='M',
            description='Playful cat',
            hosting_preference='flexible',
            main_image=SimpleUploadedFile('misho.jpg', b'\xff\xd8\xff', content_type='image/jpeg'),
            location='Cairo',
            is_free=True,
        )
        self.client.force_authenticate(customer)

        response = self.client.post(
            reverse('clinic-storefront-bookings', kwargs={'clinic_id': self.clinic.id}),
            {
                'service_id': self.service.id,
                'customer_name': 'Mona',
                'customer_phone': '01055555555',
                'customer_email': 'new-linked-customer@example.com',
                'pet_name': 'Misho',
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
        appointment = booking.confirmed_appointment
        self.assertIsNotNone(appointment.clinic_patient_id)
        self.assertEqual(appointment.clinic_patient.linked_pet, pet)
        self.assertEqual(appointment.clinic_patient.linked_user, customer)
        self.assertEqual(appointment.clinic_patient.name, 'Misho')
        self.assertEqual(ClinicPatientRecord.objects.filter(clinic=self.clinic, linked_pet=pet).count(), 1)

    def test_accept_then_schedule_booking_creates_internal_patient_appointment(self):
        response = self.client.post(
            reverse('clinic-storefront-bookings-accept', kwargs={'public_id': self.booking.public_id}),
            {},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, 'accepted')
        self.assertIsNone(self.booking.confirmed_appointment_id)
        self.assertEqual(VeterinaryAppointment.objects.count(), 0)
        self.assertTrue(
            StorefrontBookingTimeline.objects.filter(
                booking=self.booking,
                event_type='accepted',
            ).exists()
        )

        response = self.client.post(
            reverse(
                'clinic-storefront-bookings-schedule-appointment',
                kwargs={'public_id': self.booking.public_id},
            ),
            {},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, 'accepted')
        self.assertIsNotNone(self.booking.confirmed_appointment_id)
        self.assertEqual(VeterinaryAppointment.objects.count(), 1)
        appointment = VeterinaryAppointment.objects.get()
        self.assertEqual(appointment.clinic_patient.name, 'Sahab')
        self.assertEqual(appointment.scheduled_date, date(2026, 7, 3))
        self.assertEqual(appointment.scheduled_time, time(10, 0))
        self.assertTrue(
            StorefrontBookingTimeline.objects.filter(
                booking=self.booking,
                event_type='appointment_scheduled',
            ).exists()
        )

    def test_accept_with_scheduled_payload_reuses_duplicate_patient_match(self):
        owner = ClinicClientRecord.objects.create(
            clinic=self.clinic,
            full_name='Sara',
            phone=self.booking.customer_phone,
        )
        first_patient = ClinicPatientRecord.objects.create(
            clinic=self.clinic,
            owner=owner,
            name=self.booking.pet_name,
            species='cats',
        )
        ClinicPatientRecord.objects.create(
            clinic=self.clinic,
            owner=owner,
            name=self.booking.pet_name,
            species='cats',
            breed='Persian',
        )

        response = self.client.post(
            reverse('clinic-storefront-bookings-accept', kwargs={'public_id': self.booking.public_id}),
            {'scheduled_date': '2026-07-03', 'scheduled_time': '10:00:00'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, StorefrontBooking.STATUS_ACCEPTED)
        self.assertIsNotNone(self.booking.confirmed_appointment_id)
        self.assertEqual(self.booking.confirmed_appointment.clinic_patient, first_patient)

    def test_schedule_booking_reuses_duplicate_matching_appointment(self):
        owner = ClinicClientRecord.objects.create(
            clinic=self.clinic,
            full_name='Sara',
            phone=self.booking.customer_phone,
        )
        patient = ClinicPatientRecord.objects.create(
            clinic=self.clinic,
            owner=owner,
            name=self.booking.pet_name,
            species='cats',
        )
        first_appointment = VeterinaryAppointment.objects.create(
            clinic=self.clinic,
            clinic_patient=patient,
            scheduled_date=date(2026, 7, 3),
            scheduled_time=time(10, 0),
            duration_minutes=30,
            reason='حجز قديم',
            status=VeterinaryAppointment.STATUS_ACCEPTED,
        )
        VeterinaryAppointment.objects.create(
            clinic=self.clinic,
            clinic_patient=patient,
            scheduled_date=date(2026, 7, 3),
            scheduled_time=time(10, 0),
            duration_minutes=30,
            reason='حجز مكرر',
            status=VeterinaryAppointment.STATUS_ACCEPTED,
        )

        response = self.client.post(
            reverse(
                'clinic-storefront-bookings-schedule-appointment',
                kwargs={'public_id': self.booking.public_id},
            ),
            {},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.confirmed_appointment, first_appointment)
        first_appointment.refresh_from_db()
        self.assertEqual(first_appointment.reason, 'حجز متجر: تطعيم')

    def test_schedule_booking_without_pet_creates_placeholder_patient_appointment(self):
        self.booking.pet_name = None
        self.booking.pet_type = None
        self.booking.pet_breed = None
        self.booking.pet_age = None
        self.booking.save(update_fields=['pet_name', 'pet_type', 'pet_breed', 'pet_age'])

        response = self.client.post(
            reverse(
                'clinic-storefront-bookings-schedule-appointment',
                kwargs={'public_id': self.booking.public_id},
            ),
            {},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, StorefrontBooking.STATUS_ACCEPTED)
        self.assertIsNotNone(self.booking.confirmed_appointment_id)

        appointment = self.booking.confirmed_appointment
        self.assertEqual(appointment.status, VeterinaryAppointment.STATUS_ACCEPTED)
        self.assertIsNone(appointment.pet_id)
        self.assertIsNone(appointment.owner_id)
        self.assertIsNotNone(appointment.clinic_patient_id)
        self.assertEqual(appointment.clinic_patient.name, 'حيوان Sara')
        self.assertEqual(appointment.clinic_patient.species, 'غير محدد')
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
        notification = Notification.objects.get(user=customer, type='clinic_request_accepted')
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
        self.assertEqual(self.booking.status, 'rejected')
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
        self.assertEqual(self.booking.status, 'waiting_owner')
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

    def test_catalog_create_defaults_and_accepts_currency(self):
        service_response = self.client.post(
            reverse('clinic-services-list'),
            {
                'name': 'فحص',
                'category': 'general',
                'base_price': '120.00',
                'duration_minutes': 30,
                'applicable_pet_types': ['all'],
                'requires_appointment': True,
                'is_active': True,
            },
            format='json',
        )
        self.assertEqual(service_response.status_code, 201)
        self.assertEqual(service_response.data['currency'], 'EGP')

        product_response = self.client.post(
            reverse('clinic-products-list'),
            {
                'name': 'طعام كلاب',
                'category': 'food',
                'price': '180.00',
                'currency': 'usd',
                'stock_quantity': 10,
                'low_stock_threshold': 2,
                'is_active': True,
            },
            format='json',
        )
        self.assertEqual(product_response.status_code, 201)
        self.assertEqual(product_response.data['currency'], 'USD')

    def test_catalog_rejects_invalid_currency(self):
        response = self.client.post(
            reverse('clinic-products-list'),
            {
                'name': 'طعام كلاب',
                'category': 'food',
                'price': '180.00',
                'currency': 'ZZZ',
                'stock_quantity': 10,
                'low_stock_threshold': 2,
                'is_active': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('currency', response.data)

    def test_storefront_order_rejects_mixed_product_currencies(self):
        egp_product = ClinicProduct.objects.create(
            clinic=self.clinic,
            name='طعام قطط',
            category='food',
            price=100,
            currency='EGP',
            stock_quantity=10,
        )
        usd_product = ClinicProduct.objects.create(
            clinic=self.clinic,
            name='دواء',
            category='medication',
            price=20,
            currency='USD',
            stock_quantity=10,
        )

        response = self.client.post(
            reverse('clinic-storefront-orders', kwargs={'clinic_id': self.clinic.id}),
            {
                'customer_name': 'Mona',
                'customer_phone': '01022222222',
                'items': [
                    {'product_id': egp_product.id, 'quantity': 1},
                    {'product_id': usd_product.id, 'quantity': 1},
                ],
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('currency', response.data)


class ClinicPatientProfileTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.settings_override = override_settings(MEDIA_ROOT=self.media_root)
        self.settings_override.enable()
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username='profile-staff@example.com',
            email='profile-staff@example.com',
            password='pass12345',
            user_type='clinic_staff',
        )
        self.clinic = Clinic.objects.create(
            owner=self.staff,
            name='Profile Clinic',
            address='Cairo',
            phone='01000000000',
            opening_hours='9-5',
            services='Care',
        )
        ClinicStaff.objects.create(user=self.staff, clinic=self.clinic, role='owner', is_primary=True)
        self.owner = ClinicClientRecord.objects.create(
            clinic=self.clinic,
            full_name='أحمد',
            phone='01011111111',
            email='owner@example.com',
        )
        self.patient = ClinicPatientRecord.objects.create(
            clinic=self.clinic,
            owner=self.owner,
            name='لولو',
            species='dogs',
            breed='Golden Retriever',
            age_text='٢ سنة',
            gender='female',
            weight_kg='25.00',
            blood_type='A+',
            status='active',
            notes='Needs calm handling',
        )
        VeterinaryAppointment.objects.create(
            clinic=self.clinic,
            clinic_patient=self.patient,
            appointment_type='checkup',
            scheduled_date=date(2026, 7, 1),
            scheduled_time=time(10, 0),
            duration_minutes=30,
            reason='فحص عام',
            notes='Stable',
            status='completed',
            diagnosis='صحة جيدة',
            treatment='لا يوجد',
        )
        VeterinaryAppointment.objects.create(
            clinic=self.clinic,
            clinic_patient=self.patient,
            appointment_type='vaccination',
            scheduled_date=date(2026, 7, 2),
            scheduled_time=time(11, 0),
            duration_minutes=30,
            reason='تطعيم',
            status='completed',
        )
        ClinicPatientNote.objects.create(
            clinic=self.clinic,
            patient=self.patient,
            text='ملاحظة قديمة',
            created_by=self.staff,
        )
        self.client.force_authenticate(self.staff)

    def tearDown(self):
        self.settings_override.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)

    def test_patient_profile_returns_complete_detail_payload(self):
        response = self.client.get(reverse('clinic-patients-profile', kwargs={'pk': self.patient.id}))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['name'], 'لولو')
        self.assertEqual(response.data['weight_kg'], '25.00')
        self.assertEqual(response.data['blood_type'], 'A+')
        self.assertEqual(response.data['stats']['blood_type'], 'A+')
        self.assertEqual(len(response.data['medical_records']), 2)
        self.assertEqual(len(response.data['vaccinations']), 1)
        self.assertEqual(response.data['notes_list'][0]['text'], 'ملاحظة قديمة')

    def test_patient_profile_rejects_cross_clinic_patient(self):
        other_staff = User.objects.create_user(
            username='other-profile-staff@example.com',
            email='other-profile-staff@example.com',
            password='pass12345',
            user_type='clinic_staff',
        )
        other_clinic = Clinic.objects.create(
            owner=other_staff,
            name='Other Clinic',
            address='Giza',
            phone='01022222222',
            opening_hours='9-5',
            services='Care',
        )
        ClinicStaff.objects.create(user=other_staff, clinic=other_clinic, role='owner', is_primary=True)
        self.client.force_authenticate(other_staff)

        response = self.client.get(reverse('clinic-patients-profile', kwargs={'pk': self.patient.id}))

        self.assertEqual(response.status_code, 404)

    def test_create_patient_note(self):
        response = self.client.post(
            reverse('clinic-patients-notes', kwargs={'pk': self.patient.id}),
            {'text': 'ملاحظة جديدة'},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            ClinicPatientNote.objects.filter(patient=self.patient, text='ملاحظة جديدة').exists()
        )

    def test_create_patient_medical_record(self):
        response = self.client.post(
            reverse('clinic-patients-medical-records', kwargs={'pk': self.patient.id}),
            {
                'appointment_type': 'checkup',
                'scheduled_date': '2026-07-08',
                'scheduled_time': '14:30',
                'reason': 'فحص عام جديد',
                'diagnosis': 'صحة جيدة',
                'treatment': 'متابعة بعد شهر',
                'next_appointment': '2026-08-08',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        appointment = VeterinaryAppointment.objects.get(reason='فحص عام جديد')
        self.assertEqual(appointment.clinic, self.clinic)
        self.assertEqual(appointment.clinic_patient, self.patient)
        self.assertEqual(appointment.status, 'completed')
        self.assertEqual(appointment.diagnosis, 'صحة جيدة')
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.last_visit, date(2026, 7, 8))
        self.assertEqual(self.patient.next_appointment, date(2026, 8, 8))

        profile = self.client.get(reverse('clinic-patients-profile', kwargs={'pk': self.patient.id}))
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.data['medical_records'][0]['reason'], 'فحص عام جديد')

    def test_create_patient_medical_record_requires_clinical_text(self):
        response = self.client.post(
            reverse('clinic-patients-medical-records', kwargs={'pk': self.patient.id}),
            {
                'appointment_type': 'checkup',
                'scheduled_date': '2026-07-08',
                'scheduled_time': '14:30',
                'reason': 'فحص عام',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)

    def _completed_session_payload(self, **overrides):
        payload = {
            'appointment_type': 'checkup',
            'scheduled_date': '2026-07-08',
            'scheduled_time': '14:30',
            'main_complaint': 'قيء',
            'vitals': {'weight': {'status': 'checked', 'value': '25'}},
            'physical_exam': {'general_condition': 'normal'},
            'physical_exam_notes': 'الفحص مستقر',
            'diagnosis': 'التهاب بسيط',
            'services_performed': 'حقنة ومتابعة',
            'home_care_instructions': 'راحة وسوائل',
        }
        payload.update(overrides)
        return payload

    def test_complete_patient_session_creates_completed_visit(self):
        response = self.client.post(
            reverse('clinic-patients-complete-session', kwargs={'pk': self.patient.id}),
            self._completed_session_payload(next_appointment_date='2026-08-08'),
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        session = VeterinarySession.objects.get(id=response.data['id'])
        appointment = session.appointment
        self.assertEqual(session.clinic_patient, self.patient)
        self.assertEqual(appointment.clinic_patient, self.patient)
        self.assertEqual(appointment.status, 'completed')
        self.assertEqual(appointment.scheduled_date, date(2026, 7, 8))
        self.assertEqual(appointment.scheduled_time, time(14, 30))
        self.assertEqual(appointment.next_appointment, date(2026, 8, 8))
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.last_visit, date(2026, 7, 8))
        self.assertEqual(self.patient.next_appointment, date(2026, 8, 8))

    def test_complete_patient_session_accepts_blank_follow_up_date(self):
        response = self.client.post(
            reverse('clinic-patients-complete-session', kwargs={'pk': self.patient.id}),
            self._completed_session_payload(next_appointment_date=''),
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        session = VeterinarySession.objects.get(id=response.data['id'])
        self.assertIsNone(session.next_appointment_date)
        self.assertIsNone(session.appointment.next_appointment)

    def test_complete_patient_session_invalid_date_returns_400(self):
        response = self.client.post(
            reverse('clinic-patients-complete-session', kwargs={'pk': self.patient.id}),
            self._completed_session_payload(scheduled_date='not-a-date'),
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(VeterinarySession.objects.count(), 0)

    def test_complete_patient_session_rejects_non_veterinarian_provider(self):
        non_vet = User.objects.create_user(
            username='non-vet@example.com',
            email='non-vet@example.com',
            password='pass12345',
            user_type='clinic_staff',
        )
        ClinicStaff.objects.create(user=non_vet, clinic=self.clinic, role='assistant')

        response = self.client.post(
            reverse('clinic-patients-complete-session', kwargs={'pk': self.patient.id}),
            self._completed_session_payload(care_provider=non_vet.id),
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('care_provider', response.data)
        self.assertEqual(VeterinarySession.objects.count(), 0)

    def test_create_patient_accepts_age_months_integer(self):
        response = self.client.post(
            reverse('clinic-patients-list'),
            {
                'name': 'روكي',
                'species': 'dogs',
                'breed': 'Golden Retriever',
                'age_months': 18,
                'gender': 'M',
                'status': 'active',
                'owner_name': 'سارة',
                'owner_phone': '01033333333',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        patient = ClinicPatientRecord.objects.get(name='روكي')
        self.assertEqual(patient.age_months, 18)
        self.assertEqual(patient.age_text, '1 year 6 months')
        self.assertEqual(response.data['age_months'], 18)
        self.assertEqual(response.data['ageMonths'], 18)
        self.assertEqual(response.data['age'], '1 year 6 months')

    def test_update_patient_prefers_age_months_over_legacy_age_text(self):
        response = self.client.patch(
            reverse('clinic-patients-detail', kwargs={'pk': self.patient.id}),
            {
                'owner_name': self.owner.full_name,
                'age_months': 7,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.age_months, 7)
        self.assertEqual(self.patient.age_text, '7 months')
        self.assertEqual(response.data['age'], '7 months')

    def test_create_patient_still_accepts_legacy_age_string(self):
        response = self.client.post(
            reverse('clinic-patients-list'),
            {
                'name': 'لونا',
                'species': 'cats',
                'breed': 'Persian',
                'age': 'سنتين',
                'gender': 'F',
                'status': 'active',
                'owner_name': 'منى',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        patient = ClinicPatientRecord.objects.get(name='لونا')
        self.assertIsNone(patient.age_months)
        self.assertEqual(patient.age_text, 'سنتين')
        self.assertEqual(response.data['age'], 'سنتين')

    def test_create_appointment_with_app_pet_creates_clinic_patient_record(self):
        owner = User.objects.create_user(
            username='appointment-owner@example.com',
            email='appointment-owner@example.com',
            password='pass12345',
            user_type='pet_owner',
            phone='01077777777',
        )
        breed = Breed.objects.create(name='Appointment Breed', pet_type='dogs')
        pet = Pet.objects.create(
            owner=owner,
            name='Buddy',
            pet_type='dogs',
            breed=breed,
            age_months=14,
            gender='M',
            description='Clinic appointment pet',
            hosting_preference='flexible',
            main_image=SimpleUploadedFile('buddy.jpg', b'\xff\xd8\xff', content_type='image/jpeg'),
            location='Cairo',
            is_free=True,
        )

        response = self.client.post(
            reverse('clinic-appointments-list'),
            {
                'pet': pet.id,
                'owner': owner.id,
                'appointment_type': 'checkup',
                'scheduled_date': '2026-07-09',
                'scheduled_time': '14:30',
                'duration_minutes': 30,
                'reason': 'فحص عام',
                'status': 'ACCEPTED',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        appointment = VeterinaryAppointment.objects.get(id=response.data['id'])
        self.assertIsNotNone(appointment.clinic_patient_id)
        self.assertEqual(appointment.clinic_patient.linked_pet, pet)
        self.assertEqual(appointment.clinic_patient.linked_user, owner)
        self.assertEqual(appointment.clinic_patient.owner.email, owner.email)

    def test_backfill_clinic_patient_links_updates_pet_only_appointments(self):
        owner = User.objects.create_user(
            username='backfill-owner@example.com',
            email='backfill-owner@example.com',
            password='pass12345',
            user_type='pet_owner',
            phone='01088888888',
        )
        breed = Breed.objects.create(name='Backfill Breed', pet_type='cats')
        pet = Pet.objects.create(
            owner=owner,
            name='Nono',
            pet_type='cats',
            breed=breed,
            age_months=20,
            gender='F',
            description='Backfill pet',
            hosting_preference='flexible',
            main_image=SimpleUploadedFile('nono.jpg', b'\xff\xd8\xff', content_type='image/jpeg'),
            location='Cairo',
            is_free=True,
        )
        first = VeterinaryAppointment.objects.create(
            clinic=self.clinic,
            pet=pet,
            owner=owner,
            appointment_type='checkup',
            scheduled_date=date(2026, 7, 10),
            scheduled_time=time(10, 0),
            duration_minutes=30,
            reason='فحص',
            status=VeterinaryAppointment.STATUS_ACCEPTED,
        )
        second = VeterinaryAppointment.objects.create(
            clinic=self.clinic,
            pet=pet,
            owner=owner,
            appointment_type='vaccination',
            scheduled_date=date(2026, 7, 11),
            scheduled_time=time(11, 0),
            duration_minutes=30,
            reason='تطعيم',
            status=VeterinaryAppointment.STATUS_ACCEPTED,
        )

        dry_run = StringIO()
        call_command('backfill_clinic_patient_links', clinic_id=self.clinic.id, stdout=dry_run)
        first.refresh_from_db()
        self.assertIsNone(first.clinic_patient_id)
        self.assertIn('dry-run: checked=2', dry_run.getvalue())

        applied = StringIO()
        call_command('backfill_clinic_patient_links', clinic_id=self.clinic.id, apply=True, stdout=applied)
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertIsNotNone(first.clinic_patient_id)
        self.assertEqual(first.clinic_patient, second.clinic_patient)
        self.assertEqual(first.clinic_patient.linked_pet, pet)
        self.assertIn('applied: checked=2', applied.getvalue())

    def test_upload_patient_document(self):
        upload = SimpleUploadedFile('record.txt', b'profile record', content_type='text/plain')

        response = self.client.post(
            reverse('clinic-patients-documents', kwargs={'pk': self.patient.id}),
            {
                'title': 'تحليل دم',
                'category': 'lab_result',
                'file': upload,
                'notes': 'طبيعي',
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, 201)
        document = ClinicPatientDocument.objects.get(patient=self.patient)
        self.assertEqual(document.title, 'تحليل دم')
        self.assertEqual(document.category, 'lab_result')
