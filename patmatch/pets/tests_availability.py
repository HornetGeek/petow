from datetime import timedelta
from unittest.mock import patch
from django.db import transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from .models import Pet, Breed, AdoptionRequest, BreedingRequest, PetAvailabilityFollowUp, Notification, NotificationOutbox
from .availability import run_checks, record_response, check_data
from .serializers import PetSerializer, AdoptionRequestCreateSerializer, BreedingRequestSerializer
from .saved_searches import build_pet_saved_search_queryset
from .models import SavedSearch


@override_settings(PET_AVAILABILITY_ENABLED=True, PET_AVAILABILITY_AUTO_PAUSE=True,
                   PET_AVAILABILITY_ROLLOUT_PERCENT=100)
class AvailabilityTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='availability-owner', email='owner-availability@example.com', password='test')
        self.other = User.objects.create_user(username='availability-other', email='other-availability@example.com', password='test')
        self.breed = Breed.objects.create(name='Availability breed', pet_type='cats')
        self.pet = self.make_pet(self.owner)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.now = timezone.now()

    def make_pet(self, owner, **kwargs):
        values = dict(owner=owner, breed=self.breed, name='Luna', age_months=12,
                      pet_type='cats', gender='F', description='Pet', location='Cairo',
                      main_image='pets/test.jpg', status='available')
        values.update(kwargs)
        return Pet.objects.create(**values)

    def answer(self, **kwargs):
        return self.client.post(f'/api/pets/{self.pet.pk}/availability/',
                                {'expected_status': self.pet.status, **kwargs}, format='json')

    def adoption(self):
        self.pet.status = 'available_for_adoption'
        self.pet.save(update_fields=['status'])
        req = AdoptionRequest.objects.create(pet=self.pet, adopter=self.other,
            adopter_name='Adopter', adopter_age=25, family_members=1)
        req.approve()
        self.pet.refresh_from_db()
        return req

    def test_new_pet_is_not_falsely_confirmed(self):
        self.assertIsNone(self.pet.availability_confirmed_at)
        self.assertAlmostEqual((self.pet.availability_check_due_at - self.now).total_seconds(), 30*86400, delta=3)

    def test_legacy_inventory_gets_full_grace(self):
        Pet.objects.filter(pk=self.pet.pk).update(availability_check_due_at=None,
            created_at=self.now-timedelta(days=500))
        run_checks(self.now)
        self.pet.refresh_from_db()
        self.assertEqual(self.pet.availability_check_due_at, self.now)
        self.assertIsNone(self.pet.discovery_paused_at)
        self.assertIsNone(self.pet.availability_confirmed_at)
        self.assertEqual(Notification.objects.filter(type='pet_availability_check').count(), 1)

    def test_30_37_44_day_schedule_and_deduplication(self):
        due = self.now + timedelta(days=30)
        Pet.objects.filter(pk=self.pet.pk).update(availability_check_due_at=due)
        for when, count in [(due-timedelta(seconds=1),0), (due,1), (due,1),
                            (due+timedelta(days=7)-timedelta(seconds=1),1), (due+timedelta(days=7),2)]:
            with patch('django.utils.timezone.now', return_value=when):
                run_checks(when)
            self.assertEqual(Notification.objects.filter(type='pet_availability_check').count(), count)
        run_checks(due+timedelta(days=14)-timedelta(seconds=1))
        self.pet.refresh_from_db()
        self.assertIsNone(self.pet.discovery_paused_at)
        run_checks(due+timedelta(days=14))
        self.pet.refresh_from_db()
        self.assertIsNotNone(self.pet.discovery_paused_at)
        self.assertEqual(self.pet.status, 'available')

    def test_confirm_restores_and_resolves_checks(self):
        Pet.objects.filter(pk=self.pet.pk).update(discovery_paused_at=self.now,
                                                 availability_check_due_at=self.now-timedelta(days=20))
        result = self.answer(action='confirm')
        self.assertEqual(result.status_code, 200)
        self.pet.refresh_from_db()
        self.assertIsNone(self.pet.discovery_paused_at)
        self.assertIsNotNone(self.pet.availability_confirmed_at)
        self.assertGreater(self.pet.availability_check_due_at, self.now+timedelta(days=29))
        run_checks(self.now+timedelta(days=1))
        self.pet.refresh_from_db()
        self.assertIsNone(self.pet.discovery_paused_at)

    def test_permission_and_stale_status(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.answer(action='confirm').status_code, 404)
        self.client.force_authenticate(self.owner)
        Pet.objects.filter(pk=self.pet.pk).update(status='adopted')
        self.assertEqual(self.answer(action='confirm').status_code, 400)
        self.pet.refresh_from_db()
        self.assertEqual(self.pet.status, 'adopted')

    def test_snooze_survives_devices_without_confirming(self):
        Pet.objects.filter(pk=self.pet.pk).update(availability_check_due_at=self.now)
        self.assertEqual(len(self.client.get('/api/pets/availability-checks/').data['checks']), 1)
        self.assertEqual(self.answer(action='later').status_code, 200)
        self.assertEqual(self.client.get('/api/pets/availability-checks/').data['checks'], [])
        self.pet.refresh_from_db()
        self.assertIsNone(self.pet.availability_confirmed_at)
        self.assertEqual(self.pet.availability_check_due_at, self.now)
        self.assertTrue(self.client.get(f'/api/pets/{self.pet.pk}/availability/').data['check']['due'])

    def test_adoption_approval_is_pending_and_followup_at_3_and_7_days(self):
        req = self.adoption()
        self.assertEqual(self.pet.status, 'adoption_pending')
        followup = PetAvailabilityFollowUp.objects.get(pet=self.pet)
        self.assertFalse(check_data(self.pet, followup.approved_at+timedelta(days=3)-timedelta(seconds=1))['due'])
        for days, expected in [(3, 1), (3, 1), (7, 2)]:
            now = followup.approved_at+timedelta(days=days)
            with patch('django.utils.timezone.now', return_value=now):
                run_checks(now)
            self.assertEqual(Notification.objects.filter(type='pet_availability_check').count(), expected)
        req.save() # Repeated approval save must not reset its schedule.
        self.assertEqual(PetAvailabilityFollowUp.objects.filter(pet=self.pet).count(), 1)
        self.assertEqual(PetAvailabilityFollowUp.objects.get(pet=self.pet).approved_at, followup.approved_at)

    def test_arranging_acknowledges_without_available_badge(self):
        req = self.adoption()
        response = self.answer(action='arranging')
        self.assertEqual(response.status_code, 200)
        self.pet.refresh_from_db(); req.refresh_from_db()
        self.assertEqual(self.pet.status, 'adoption_pending')
        self.assertEqual(req.status, 'approved')
        self.assertIsNone(self.pet.availability_confirmed_at)
        self.assertFalse(PetAvailabilityFollowUp.objects.filter(pet=self.pet, resolved_at__isnull=True).exists())

    def test_complete_reuses_existing_adoption_completion(self):
        req = self.adoption()
        self.assertEqual(self.answer(action='complete', request_id=req.pk).status_code, 200)
        req.refresh_from_db(); self.pet.refresh_from_db()
        self.assertEqual(req.status, 'completed')
        self.assertEqual(self.pet.status, 'adopted')
        self.assertIsNone(self.pet.availability_check_due_at)
        self.assertFalse(PetAvailabilityFollowUp.objects.filter(pet=self.pet, resolved_at__isnull=True).exists())

    def test_cannot_complete_another_pets_adoption(self):
        self.adoption()
        self.assertEqual(self.answer(action='complete', request_id=999999).status_code, 400)
        self.pet.refresh_from_db()
        self.assertEqual(self.pet.status, 'adoption_pending')

    def test_breeding_approval_checks_both_owners_and_updates_one(self):
        other_pet = self.make_pet(self.other, gender='M')
        req = BreedingRequest.objects.create(target_pet=self.pet, requester_pet=other_pet,
            requester=self.other, receiver=self.owner, status='approved', contact_phone='123')
        self.assertEqual(PetAvailabilityFollowUp.objects.filter(request_id=req.pk, request_kind='breeding').count(), 2)
        self.assertEqual(self.answer(action='status', status='mating').status_code, 200)
        self.pet.refresh_from_db(); other_pet.refresh_from_db()
        self.assertEqual(self.pet.status, 'mating')
        self.assertEqual(other_pet.status, 'available')
        self.assertTrue(PetAvailabilityFollowUp.objects.filter(pet=other_pet, resolved_at__isnull=True).exists())

    def test_paused_pets_hidden_from_discovery_but_detail_and_my_pets_survive(self):
        Pet.objects.filter(pk=self.pet.pk).update(discovery_paused_at=self.now)
        result = self.client.get('/api/pets/?status=available')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data['results'], [])
        self.assertEqual(self.client.get(f'/api/pets/{self.pet.pk}/').status_code, 200)
        self.assertEqual(self.client.get('/api/pets/my/').status_code, 200)
        saved = SavedSearch(user=self.other, name='Pets', target_type='pet', filters={})
        self.assertFalse(build_pet_saved_search_queryset(saved).filter(pk=self.pet.pk).exists())

    def test_paused_adoption_rejected_by_request_validation(self):
        self.pet.status = 'available_for_adoption'
        self.pet.discovery_paused_at = self.now
        from rest_framework.test import APIRequestFactory, force_authenticate
        from types import SimpleNamespace
        serializer = AdoptionRequestCreateSerializer(context={'request': SimpleNamespace(user=self.other)})
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError): serializer.validate_pet(self.pet)

    def test_freshness_fields_cannot_be_forged_in_regular_edit(self):
        serializer = PetSerializer(self.pet, data={'availability_confirmed_at': self.now.isoformat(),
            'availability_check_due_at': self.now.isoformat(), 'discovery_paused_at': None}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save(); self.pet.refresh_from_db()
        self.assertIsNone(self.pet.availability_confirmed_at)
        self.assertGreater(self.pet.availability_check_due_at, self.now)

    @override_settings(PET_AVAILABILITY_ENABLED=False)
    def test_rollout_disabled_does_not_pause_or_prompt(self):
        Pet.objects.filter(pk=self.pet.pk).update(availability_check_due_at=self.now-timedelta(days=90))
        self.assertEqual(run_checks()['paused'], 0)
        self.assertFalse(self.client.get('/api/pets/availability-checks/').data['enabled'])
        self.assertEqual(self.answer(action='confirm').status_code, 403)

    @override_settings(PET_AVAILABILITY_AUTO_PAUSE=False)
    def test_reminders_can_roll_out_before_auto_pause(self):
        Pet.objects.filter(pk=self.pet.pk).update(availability_check_due_at=self.now-timedelta(days=90))
        run_checks(self.now)
        self.pet.refresh_from_db()
        self.assertIsNone(self.pet.discovery_paused_at)

    def test_resolved_push_is_cancelled_and_deep_link_is_correct(self):
        from .availability import deliver_check_push
        from .push_targets import build_mobile_deep_link
        Pet.objects.filter(pk=self.pet.pk).update(availability_check_due_at=self.now)
        run_checks(self.now)
        event = NotificationOutbox.objects.get(event_type='pet_availability_push')
        self.assertEqual(build_mobile_deep_link('pet_availability_check', {'pet_id': self.pet.pk}),
                         f'petow://pet-availability?pet_id={self.pet.pk}')
        self.answer(action='confirm')
        with patch('pets.notifications.deliver_outbox_notification_push') as deliver:
            deliver_check_push(event.object_id, event.payload)
            deliver.assert_not_called()

    def test_late_auto_pause_activation_grants_grace_instead_of_hiding_immediately(self):
        Pet.objects.filter(pk=self.pet.pk).update(availability_check_due_at=self.now-timedelta(days=90))
        with override_settings(PET_AVAILABILITY_AUTO_PAUSE=False):
            run_checks(self.now)
        run_checks(self.now+timedelta(days=1))
        self.pet.refresh_from_db()
        self.assertIsNone(self.pet.discovery_paused_at)
        self.assertEqual(self.pet.availability_check_due_at, self.now+timedelta(days=1))

    def test_malformed_answers_return_400(self):
        for answer in [dict(action='status', status=[]), dict(action='complete', request_id='bad'),
                       dict(action='complete'), dict(action='status'), dict(action='unexpected')]:
            self.assertEqual(self.answer(**answer).status_code, 400)
        self.pet.refresh_from_db()
        self.assertIsNone(self.pet.availability_confirmed_at)

    def test_map_and_adoption_discovery_exclude_paused_pets(self):
        from django.contrib.gis.geos import Point
        Pet.objects.filter(pk=self.pet.pk).update(location_point=Point(31.2, 30.0))
        path = '/api/pets/map/markers/?bbox=30,29,32,31&zoom=14&cluster=false&status=available'
        self.assertEqual(self.client.get(path).data['meta']['total_matched'], 1)
        Pet.objects.filter(pk=self.pet.pk).update(discovery_paused_at=self.now)
        self.assertEqual(self.client.get(path).data['meta']['total_matched'], 0)
        Pet.objects.filter(pk=self.pet.pk).update(status='available_for_adoption')
        self.assertEqual(self.client.get('/api/pets/adoption/pets/').data, [])

    def test_paused_breeding_pet_rejected_by_request_validation(self):
        from types import SimpleNamespace
        from rest_framework.exceptions import ValidationError
        other_pet = self.make_pet(self.other, gender='M')
        self.pet.discovery_paused_at = self.now
        serializer = BreedingRequestSerializer(context={'request': SimpleNamespace(user=self.other)})
        with self.assertRaises(ValidationError):
            serializer.validate({'target_pet': self.pet, 'requester_pet': other_pet})

    def test_multiple_approvals_produce_one_owner_notification(self):
        self.adoption()
        second = AdoptionRequest.objects.create(pet=self.pet, adopter=self.other,
            adopter_name='Adopter', adopter_age=25, family_members=1)
        second.approve()
        self.assertEqual(PetAvailabilityFollowUp.objects.filter(pet=self.pet).count(), 2)
        run_checks(self.now + timedelta(days=4))
        run_checks(self.now + timedelta(days=4))
        self.assertEqual(Notification.objects.filter(type='pet_availability_check').count(), 1)
        self.answer(action='arranging')
        self.assertFalse(PetAvailabilityFollowUp.objects.filter(pet=self.pet, resolved_at__isnull=True).exists())

    def test_quiet_hours_defer_without_consuming_retry_budget(self):
        from .tasks import process_notification_outbox_event
        Pet.objects.filter(pk=self.pet.pk).update(availability_check_due_at=self.now)
        run_checks(self.now)
        event = NotificationOutbox.objects.get(event_type='pet_availability_push')
        with patch('pets.notifications._should_deliver_push', return_value=(False, 'quiet_hours_active', None)):
            result = process_notification_outbox_event(event.pk)
        self.assertEqual(result['status'], 'deferred')
        event.refresh_from_db()
        self.assertEqual(event.attempts, 0)
        self.assertEqual(event.status, 'pending')
        self.assertGreater(event.next_attempt_at, self.now)

    def test_approval_does_not_clear_an_existing_discovery_pause(self):
        req = self.adoption()
        Pet.objects.filter(pk=self.pet.pk).update(discovery_paused_at=self.now)
        # The request still holds the old related pet instance from before the pause.
        req.complete()
        self.pet.refresh_from_db()
        self.assertEqual(self.pet.discovery_paused_at, self.now)

    def test_external_adoption_can_be_recorded_without_a_platform_request(self):
        self.pet.status = 'available_for_adoption'
        self.pet.save(update_fields=['status'])
        self.assertEqual(self.answer(action='status', status='adopted').status_code, 200)
        self.pet.refresh_from_db()
        self.assertEqual(self.pet.status, 'adopted')
        self.assertIsNone(self.pet.availability_check_due_at)

    def test_external_adoption_cannot_bypass_an_approved_request(self):
        self.adoption()
        self.assertEqual(self.answer(action='status', status='adopted').status_code, 400)
        self.pet.refresh_from_db()
        self.assertEqual(self.pet.status, 'adoption_pending')

    def test_legacy_inactivity_job_does_not_overwrite_rollout_pet_status(self):
        from django.core.management import call_command
        for _ in range(3):
            AdoptionRequest.objects.create(pet=self.pet, adopter=self.other,
                adopter_name='Adopter', adopter_age=25, family_members=1, status='rejected',
                admin_notes='auto_rejected_due_to_inactivity')
        call_command('auto_manage_requests')
        self.pet.refresh_from_db()
        self.assertEqual(self.pet.status, 'available')


from django.test import TransactionTestCase


@override_settings(PET_AVAILABILITY_ENABLED=True, PET_AVAILABILITY_AUTO_PAUSE=True,
                   PET_AVAILABILITY_ROLLOUT_PERCENT=100)
class AvailabilityConcurrencyTests(TransactionTestCase):
    def test_confirmation_and_expiry_cannot_leave_a_confirmed_pet_paused(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from django.db import close_old_connections
        owner = User.objects.create_user(username='race-owner', password='test')
        breed = Breed.objects.create(name='Race breed', pet_type='cats')
        pet = Pet.objects.create(owner=owner, breed=breed, name='Race', age_months=12,
                                 status='available', gender='F')
        now = timezone.now()
        Pet.objects.filter(pk=pet.pk).update(availability_check_due_at=now-timedelta(days=14))
        due = now-timedelta(days=14)
        warning = Notification.objects.create(user=owner, related_pet=pet,
            type='pet_availability_check', title='Final warning', message='Confirm availability',
            event_key=f'pet_availability:{pet.pk}:freshness:{due.isoformat()}:final',
            extra_data={'notice_en': 'Your listing will be paused.'})
        Notification.objects.filter(pk=warning.pk).update(created_at=now-timedelta(days=7))
        barrier = Barrier(2)

        def confirm():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                with transaction.atomic():
                    locked = Pet.objects.select_for_update().get(pk=pet.pk)
                    record_response(locked, now)
            finally:
                close_old_connections()

        def expire():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                run_checks(now)
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(confirm), executor.submit(expire)]
            for future in futures:
                future.result(timeout=20)
        pet.refresh_from_db()
        self.assertIsNone(pet.discovery_paused_at)
        self.assertEqual(pet.availability_confirmed_at, now)
