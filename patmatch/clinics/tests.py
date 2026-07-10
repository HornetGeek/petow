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
        self.assertTrue(
            StorefrontBookingTimeline.objects.filter(
                booking=booking,
                event_type='appointment_scheduled',
            ).exists()
        )

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
