"""Qualified referral points. All balance changes go through this ledger."""
from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from accounts.models import User

from .models import PointsTransaction, PointsWallet, ReferralAttribution


class PointsLedgerError(RuntimeError):
    pass


def points_enabled_for(user_id):
    if not getattr(settings, 'PETOW_POINTS_ENABLED', False):
        return False
    raw = getattr(settings, 'PETOW_POINTS_COHORT_IDS', '')
    ids = raw if isinstance(raw, (list, tuple, set)) else str(raw).split(',')
    return str(user_id) in {str(value).strip() for value in ids}


def _legacy_key(attribution):
    return f'referral:{attribution.referred_user_id_at_capture}'


def _legacy_reversal_key(attribution):
    return f'legacy-referral-reversal:{attribution.pk}'


def _reverse_credit(attribution, credit, key, reason):
    if PointsTransaction.objects.filter(idempotency_key=key).exists():
        return False
    wallet = PointsWallet.objects.select_for_update().get(pk=credit.wallet_id)
    closed_wallet = PointsTransaction.objects.filter(
        wallet=wallet, idempotency_key=f'account-closed:{attribution.referrer_id}').exists()
    if wallet.balance < credit.amount and closed_wallet:
        # This balance was already forfeited when the referrer closed their account.
        return False
    if wallet.balance < credit.amount:
        raise PointsLedgerError('Insufficient balance for referral reversal')
    PointsTransaction.objects.create(
        wallet=wallet, referral_attribution=attribution,
        amount=-credit.amount, reason=reason, idempotency_key=key)
    PointsWallet.objects.filter(pk=wallet.pk).update(balance=F('balance') - credit.amount)
    return True


@transaction.atomic
def award_referral_points(attribution_id):
    """Credit one point once. Legacy signup credits must be audited first."""
    candidate = ReferralAttribution.objects.filter(pk=attribution_id).values('referrer_id').first()
    if not candidate or not points_enabled_for(candidate['referrer_id']):
        return False
    referrer = User.objects.select_for_update().filter(pk=candidate['referrer_id']).first()
    if not referrer or not referrer.is_active:
        return False
    attribution = ReferralAttribution.objects.select_for_update().filter(pk=attribution_id).first()
    if (not attribution or attribution.referrer_id != referrer.pk or
            attribution.status != 'qualified' or not attribution.referred_user_id or
            not User.objects.filter(pk=attribution.referred_user_id, is_active=True).exists()):
        return False
    if PointsTransaction.objects.filter(
            referral_attribution=attribution, reason='qualified_referral').exists():
        return False
    legacy = PointsTransaction.objects.filter(idempotency_key=_legacy_key(attribution)).first()
    if legacy:
        if legacy.referral_attribution_id != attribution.pk:
            raise PointsLedgerError('Unlinked legacy referral credit; run the ledger audit')
        if not PointsTransaction.objects.filter(
                idempotency_key=_legacy_reversal_key(attribution)).exists():
            return False
    wallet, _ = PointsWallet.objects.get_or_create(user=referrer)
    wallet = PointsWallet.objects.select_for_update().get(pk=wallet.pk)
    PointsTransaction.objects.create(
        wallet=wallet, referral_attribution=attribution, amount=1,
        reason='qualified_referral', idempotency_key=f'qualified-referral:{attribution.pk}')
    PointsWallet.objects.filter(pk=wallet.pk).update(balance=F('balance') + 1)
    return True


@transaction.atomic
def reject_referral(attribution_id, reason):
    """Reject an attribution and compensate any prior credit exactly once."""
    if reason not in {'fraud_review', 'deleted_account'}:
        raise ValueError('Unsupported referral rejection reason')
    candidate = ReferralAttribution.objects.filter(pk=attribution_id).values('referrer_id').first()
    if not candidate:
        return False
    User.objects.select_for_update().get(pk=candidate['referrer_id'])
    attribution = ReferralAttribution.objects.select_for_update().get(pk=attribution_id)
    was_rejected = attribution.status == 'rejected'
    credit = PointsTransaction.objects.filter(
        referral_attribution=attribution, reason='qualified_referral').first()
    reversal_key = f'referral-reversal:{attribution.pk}'
    reversal_reason = 'referral_reversal'
    legacy = PointsTransaction.objects.filter(idempotency_key=_legacy_key(attribution)).first()
    if legacy and legacy.referral_attribution_id != attribution.pk:
        raise PointsLedgerError('Unlinked legacy referral credit; run the ledger audit')
    if not credit and legacy and not PointsTransaction.objects.filter(
            idempotency_key=_legacy_reversal_key(attribution)).exists():
        credit = legacy
        reversal_key = _legacy_reversal_key(attribution)
        reversal_reason = 'legacy_credit_reversal'
    reversed_now = False
    if credit:
        reversed_now = _reverse_credit(
            attribution, credit, reversal_key, reversal_reason)
    if not was_rejected:
        attribution.status = 'rejected'
        attribution.rejected_at = timezone.now()
        attribution.rejection_reason = reason
        attribution.save(update_fields=['status', 'rejected_at', 'rejection_reason'])
    return not was_rejected or reversed_now


@transaction.atomic
def reverse_pending_legacy_credit(attribution_id):
    """Remove a signup-time credit while leaving its referral window open."""
    candidate = ReferralAttribution.objects.filter(pk=attribution_id).values('referrer_id').first()
    if not candidate:
        return False
    User.objects.select_for_update().get(pk=candidate['referrer_id'])
    attribution = ReferralAttribution.objects.select_for_update().get(pk=attribution_id)
    if attribution.status != 'pending':
        return False
    credit = PointsTransaction.objects.filter(idempotency_key=_legacy_key(attribution)).first()
    if not credit:
        return False
    if credit.referral_attribution_id != attribution.pk:
        raise PointsLedgerError('Unlinked legacy referral credit; run the ledger audit')
    return _reverse_credit(attribution, credit, _legacy_reversal_key(attribution),
                           'legacy_credit_reversal')


@transaction.atomic
def forfeit_user_points(user_id):
    """Close a referrer's wallet during soft account deletion."""
    user = User.objects.select_for_update().get(pk=user_id)
    wallet = PointsWallet.objects.select_for_update().filter(user=user).first()
    if not wallet or not wallet.balance:
        return False
    PointsTransaction.objects.create(
        wallet=wallet, amount=-wallet.balance, reason='account_closed',
        idempotency_key=f'account-closed:{user_id}')
    wallet.balance = 0
    wallet.save(update_fields=['balance'])
    return True
