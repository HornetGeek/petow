from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import PushDevice, User
from .models import Breed, Pet, ReferralAttribution, ReferralCode, PointsTransaction, PointsWallet
from .sharing import claim_referral, qualify_referral_for_pet
from .points import award_referral_points, reject_referral


class ReferralQualificationTests(TestCase):
    def setUp(self):
        self.referrer = User.objects.create_user(
            username='referrer', email='referrer@example.com', password='password123')
        self.new_user = User.objects.create_user(
            username='new', email='new@example.com', password='password123')
        self.code = ReferralCode.objects.create(user=self.referrer)
        self.breed = Breed.objects.create(name='Referral Cat', pet_type='cats')

    def make_pet(self, owner=None):
        return Pet.objects.create(
            owner=owner or self.new_user, name='Milo', pet_type='cats', breed=self.breed,
            age_months=12, gender='M', description='A friendly cat',
            hosting_preference='flexible', status='available_for_adoption',
            location='Cairo', is_free=True, main_image='pets/main/test.jpg')

    @override_settings(PETOW_POINTS_ENABLED=True)
    def test_signup_only_captures_and_first_pet_qualifies_once_without_points(self):
        attribution = claim_referral(self.new_user, self.code.code)
        self.assertEqual(attribution.status, 'pending')
        self.assertIsNone(attribution.qualified_at)
        self.assertEqual(attribution.original_pet_id, None)
        self.assertEqual(claim_referral(self.new_user, self.code.code).pk, attribution.pk)
        self.assertEqual(PointsTransaction.objects.count(), 0)

        pet = self.make_pet()
        qualify_referral_for_pet(self.new_user, pet)
        attribution.refresh_from_db()
        self.assertEqual(attribution.status, 'qualified')
        qualified_at = attribution.qualified_at
        qualify_referral_for_pet(self.new_user, pet)
        attribution.refresh_from_db()
        self.assertEqual(attribution.qualified_at, qualified_at)
        self.assertEqual(PointsTransaction.objects.count(), 0)

    def test_old_attribution_is_rejected_when_first_pet_is_created(self):
        attribution = claim_referral(self.new_user, self.code.code)
        ReferralAttribution.objects.filter(pk=attribution.pk).update(
            captured_at=timezone.now() - timedelta(days=31))
        qualify_referral_for_pet(self.new_user, self.make_pet())
        attribution.refresh_from_db()
        self.assertEqual(attribution.status, 'rejected')
        self.assertEqual(attribution.rejection_reason, 'window_expired')
        self.assertIsNone(attribution.qualified_at)

    def test_self_referral_and_existing_account_are_not_attributed(self):
        self.assertIsNone(claim_referral(self.referrer, self.code.code))
        self.new_user.date_joined = timezone.now() - timedelta(days=2)
        self.new_user.save(update_fields=['date_joined'])
        self.assertIsNone(claim_referral(self.new_user, self.code.code))

    def test_second_code_cannot_replace_first_attribution(self):
        other = User.objects.create_user(
            username='other', email='other@example.com', password='password123')
        other_code = ReferralCode.objects.create(user=other)
        first = claim_referral(self.new_user, self.code.code)
        self.assertIsNone(claim_referral(self.new_user, other_code.code))
        self.assertEqual(ReferralAttribution.objects.get(pk=first.pk).referrer, self.referrer)

    def test_deactivated_account_cannot_qualify(self):
        attribution = claim_referral(self.new_user, self.code.code)
        self.new_user.is_active = False
        self.new_user.save(update_fields=['is_active'])
        qualify_referral_for_pet(self.new_user, self.make_pet())
        attribution.refresh_from_db()
        self.assertEqual(attribution.status, 'rejected')
        self.assertEqual(attribution.rejection_reason, 'deleted_account')

    def test_reused_device_is_rejected(self):
        attribution = claim_referral(self.new_user, self.code.code)
        PushDevice.objects.create(user=self.referrer, device_id='same-install', token='token-1')
        PushDevice.objects.create(user=self.new_user, device_id='same-install', token='token-2')
        qualify_referral_for_pet(self.new_user, self.make_pet())
        attribution.refresh_from_db()
        self.assertEqual(attribution.status, 'rejected')
        self.assertEqual(attribution.rejection_reason, 'repeat_device')

    def test_reused_installation_stays_detectable_without_push_token(self):
        other = User.objects.create_user(
            username='other-install', email='other-install@example.com', password='password123')
        claim_referral(other, self.code.code, device_id='shared-installation-123')
        attribution = claim_referral(
            self.new_user, self.code.code, device_id='shared-installation-123')
        qualify_referral_for_pet(self.new_user, self.make_pet())
        attribution.refresh_from_db()
        self.assertEqual(attribution.status, 'rejected')
        self.assertEqual(attribution.rejection_reason, 'repeat_device')

    def test_hard_deleted_referred_account_keeps_rejection_audit(self):
        attribution = claim_referral(self.new_user, self.code.code)
        user_id = self.new_user.pk
        self.new_user.delete()
        attribution.refresh_from_db()
        self.assertIsNone(attribution.referred_user)
        self.assertEqual(attribution.referred_user_id_at_capture, user_id)
        self.assertEqual(attribution.status, 'rejected')
        self.assertEqual(attribution.rejection_reason, 'deleted_account')

    @override_settings(PETOW_POINTS_ENABLED=True)
    def test_only_qualified_cohort_referral_earns_once(self):
        attribution = claim_referral(self.new_user, self.code.code)
        self.assertFalse(award_referral_points(attribution.pk))
        qualify_referral_for_pet(self.new_user, self.make_pet())
        self.assertFalse(award_referral_points(attribution.pk))
        with override_settings(PETOW_POINTS_COHORT_IDS=str(self.referrer.pk)):
            self.assertTrue(award_referral_points(attribution.pk))
            self.assertFalse(award_referral_points(attribution.pk))
        self.assertEqual(PointsWallet.objects.get(user=self.referrer).balance, 1)
        self.assertEqual(PointsTransaction.objects.filter(referral_attribution=attribution).count(), 1)

    @override_settings(PETOW_POINTS_ENABLED=True)
    def test_rejected_referral_never_earns_and_reversal_is_idempotent(self):
        attribution = claim_referral(self.new_user, self.code.code)
        qualify_referral_for_pet(self.new_user, self.make_pet())
        with override_settings(PETOW_POINTS_COHORT_IDS=str(self.referrer.pk)):
            self.assertTrue(award_referral_points(attribution.pk))
            self.assertTrue(reject_referral(attribution.pk, 'fraud_review'))
            self.assertFalse(reject_referral(attribution.pk, 'fraud_review'))
            self.assertFalse(award_referral_points(attribution.pk))
        self.assertEqual(PointsWallet.objects.get(user=self.referrer).balance, 0)
        self.assertEqual(list(PointsTransaction.objects.filter(
            referral_attribution=attribution).values_list('amount', flat=True)), [1, -1])

    @override_settings(PETOW_POINTS_ENABLED=True)
    def test_deleting_referred_account_reverses_its_point(self):
        attribution = claim_referral(self.new_user, self.code.code)
        qualify_referral_for_pet(self.new_user, self.make_pet())
        with override_settings(PETOW_POINTS_COHORT_IDS=str(self.referrer.pk)):
            award_referral_points(attribution.pk)
        self.new_user.delete()
        attribution.refresh_from_db()
        self.assertEqual(attribution.status, 'rejected')
        self.assertEqual(PointsWallet.objects.get(user=self.referrer).balance, 0)

    @override_settings(PETOW_POINTS_ENABLED=True)
    def test_legacy_credit_is_not_awarded_again(self):
        attribution = claim_referral(self.new_user, self.code.code)
        qualify_referral_for_pet(self.new_user, self.make_pet())
        wallet = PointsWallet.objects.create(user=self.referrer, balance=1)
        PointsTransaction.objects.create(
            wallet=wallet, referral_attribution=attribution, amount=1,
            reason='referral_signup', idempotency_key=f'referral:{self.new_user.pk}')
        with override_settings(PETOW_POINTS_COHORT_IDS=str(self.referrer.pk)):
            self.assertFalse(award_referral_points(attribution.pk))
        self.assertEqual(PointsTransaction.objects.count(), 1)

    @override_settings(PETOW_POINTS_ENABLED=True)
    def test_wallet_endpoint_shows_only_owners_ledger(self):
        from rest_framework.test import APIClient
        attribution = claim_referral(self.new_user, self.code.code)
        qualify_referral_for_pet(self.new_user, self.make_pet())
        with override_settings(PETOW_POINTS_COHORT_IDS=str(self.referrer.pk)):
            award_referral_points(attribution.pk)
        client = APIClient()
        client.force_authenticate(user=self.referrer)
        response = client.get('/api/pets/referrals/wallet/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['balance'], 1)
        self.assertEqual(response.data['activity']['results'][0]['amount'], 1)
        self.assertNotIn('referred_user', response.data['activity']['results'][0])
        client.force_authenticate(user=self.new_user)
        response = client.get('/api/pets/referrals/wallet/')
        self.assertEqual(response.data['balance'], 0)
        self.assertEqual(response.data['activity']['results'], [])

    @override_settings(PETOW_POINTS_ENABLED=True)
    def test_daily_reconciliation_backfills_qualified_cohort(self):
        from .share_tasks import reconcile_referral_points
        attribution = claim_referral(self.new_user, self.code.code)
        qualify_referral_for_pet(self.new_user, self.make_pet())
        with override_settings(PETOW_POINTS_COHORT_IDS=str(self.referrer.pk)):
            self.assertEqual(reconcile_referral_points(), 1)
            self.assertEqual(reconcile_referral_points(), 0)
        self.assertEqual(PointsWallet.objects.get(user=self.referrer).balance, 1)

    def test_audit_reverses_rejected_legacy_credit_once(self):
        attribution = claim_referral(self.new_user, self.code.code)
        ReferralAttribution.objects.filter(pk=attribution.pk).update(
            status='rejected', rejection_reason='legacy_action_unverified',
            rejected_at=timezone.now())
        wallet = PointsWallet.objects.create(user=self.referrer, balance=1)
        PointsTransaction.objects.create(
            wallet=wallet, referral_attribution=attribution, amount=1,
            reason='referral_signup', idempotency_key=f'referral:{self.new_user.pk}')
        output = StringIO()
        call_command('audit_referral_points', stdout=output)
        self.assertEqual(PointsWallet.objects.get(pk=wallet.pk).balance, 1)
        call_command('audit_referral_points', '--apply', stdout=output)
        call_command('audit_referral_points', '--apply', stdout=output)
        self.assertEqual(PointsWallet.objects.get(pk=wallet.pk).balance, 0)
        self.assertEqual(PointsTransaction.objects.filter(wallet=wallet).count(), 2)

    def test_pending_legacy_credit_is_reversed_then_earned_on_qualification(self):
        attribution = claim_referral(self.new_user, self.code.code)
        wallet = PointsWallet.objects.create(user=self.referrer, balance=1)
        PointsTransaction.objects.create(
            wallet=wallet, referral_attribution=attribution, amount=1,
            reason='referral_signup', idempotency_key=f'referral:{self.new_user.pk}')
        call_command('audit_referral_points', '--apply', stdout=StringIO())
        attribution.refresh_from_db()
        self.assertEqual(attribution.status, 'pending')
        self.assertEqual(PointsWallet.objects.get(pk=wallet.pk).balance, 0)
        qualify_referral_for_pet(self.new_user, self.make_pet())
        with override_settings(PETOW_POINTS_ENABLED=True,
                               PETOW_POINTS_COHORT_IDS=str(self.referrer.pk)):
            self.assertTrue(award_referral_points(attribution.pk))
            self.assertFalse(award_referral_points(attribution.pk))
        self.assertEqual(PointsWallet.objects.get(pk=wallet.pk).balance, 1)
        self.assertEqual(list(PointsTransaction.objects.filter(wallet=wallet).values_list(
            'amount', flat=True)), [1, -1, 1])

    @override_settings(PETOW_POINTS_ENABLED=True)
    def test_soft_deleting_referrer_forfeits_balance(self):
        from rest_framework.test import APIClient
        attribution = claim_referral(self.new_user, self.code.code)
        qualify_referral_for_pet(self.new_user, self.make_pet())
        with override_settings(PETOW_POINTS_COHORT_IDS=str(self.referrer.pk)):
            award_referral_points(attribution.pk)
        client = APIClient()
        client.force_authenticate(user=self.referrer)
        response = client.delete('/api/accounts/profile/')
        self.assertEqual(response.status_code, 200)
        self.referrer.refresh_from_db()
        self.assertFalse(self.referrer.is_active)
        self.assertEqual(PointsWallet.objects.get(user=self.referrer).balance, 0)
        self.assertEqual(sum(PointsTransaction.objects.filter(
            wallet__user=self.referrer).values_list('amount', flat=True)), 0)
