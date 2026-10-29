"""Audit historical point data; optionally repair rejected credits and backfill a pilot."""
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Sum

from pets.models import PointsTransaction, PointsWallet, ReferralAttribution, RewardRedemption
from pets.points import (
    PointsLedgerError, award_referral_points, points_enabled_for,
    reject_referral, reverse_pending_legacy_credit,
)


class Command(BaseCommand):
    help = 'Audit referral point ledgers. --apply reverses rejected legacy credits and backfills the enabled cohort.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true')

    def handle(self, *args, **options):
        if RewardRedemption.objects.exists():
            raise CommandError('Existing redemptions require manual review before point rollout')
        errors = []
        for wallet in PointsWallet.objects.all().iterator():
            total = wallet.transactions.aggregate(value=Sum('amount'))['value'] or 0
            if total != wallet.balance:
                errors.append(f'wallet {wallet.pk}: balance {wallet.balance}, ledger {total}')
        for entry in PointsTransaction.objects.filter(reason='referral_signup').select_related(
                'wallet', 'referral_attribution').iterator():
            attribution = entry.referral_attribution
            if not attribution or attribution.referrer_id != entry.wallet.user_id or entry.amount != 1:
                errors.append(f'legacy credit {entry.pk}: missing or invalid attribution')
        for entry in PointsTransaction.objects.filter(reason='qualified_referral').select_related(
                'wallet', 'referral_attribution').iterator():
            attribution = entry.referral_attribution
            if not attribution or attribution.referrer_id != entry.wallet.user_id or entry.amount != 1:
                errors.append(f'qualified credit {entry.pk}: missing or invalid attribution')
        if errors:
            raise CommandError('Point audit failed:\n' + '\n'.join(errors[:30]))
        self.stdout.write('Wallet balances and legacy referral credits are consistent.')
        pending_legacy_credits = sum(
            1 for item in ReferralAttribution.objects.filter(
                status='pending', point_transactions__reason='referral_signup').distinct().iterator()
            if not item.point_transactions.filter(reason='legacy_credit_reversal').exists())
        rejected_credits = 0
        for item in ReferralAttribution.objects.filter(
                status='rejected', point_transactions__amount__gt=0).distinct().iterator():
            active_legacy = (item.point_transactions.filter(reason='referral_signup').exists() and
                             not item.point_transactions.filter(reason='legacy_credit_reversal').exists())
            active_qualified = (item.point_transactions.filter(reason='qualified_referral').exists() and
                                not item.point_transactions.filter(reason='referral_reversal').exists())
            rejected_credits += int(active_legacy or active_qualified)
        qualified_credits = ReferralAttribution.objects.filter(
            status='qualified', point_transactions__amount__gt=0).distinct().count()
        eligible_uncredited = 0
        for item in ReferralAttribution.objects.filter(status='qualified').iterator():
            if not points_enabled_for(item.referrer_id):
                continue
            if item.point_transactions.filter(reason='qualified_referral').exists():
                continue
            if (item.point_transactions.filter(reason='referral_signup').exists() and
                    not item.point_transactions.filter(reason='legacy_credit_reversal').exists()):
                continue
            eligible_uncredited += 1
        self.stdout.write(
            f'Pending legacy credits: {pending_legacy_credits}; rejected referrals with credits: {rejected_credits}; '
            f'existing qualified credits: {qualified_credits}; '
            f'eligible uncredited referrals: {eligible_uncredited}.')
        if not options['apply']:
            self.stdout.write('Dry run only. Use --apply after reviewing the pilot cohort.')
            return
        reversed_count = 0
        pending_reversed = 0
        awarded_count = 0
        try:
            pending_ids = ReferralAttribution.objects.filter(
                status='pending', point_transactions__reason='referral_signup',
            ).distinct().values_list('pk', flat=True)
            for attribution_id in pending_ids.iterator():
                pending_reversed += int(reverse_pending_legacy_credit(attribution_id))
            rejected_ids = ReferralAttribution.objects.filter(
                status='rejected', point_transactions__amount__gt=0,
            ).distinct().values_list('pk', flat=True)
            for attribution_id in rejected_ids.iterator():
                reversed_count += int(reject_referral(attribution_id, 'fraud_review'))
            qualified_ids = ReferralAttribution.objects.filter(
                status='qualified').values_list('pk', 'referrer_id')
            for attribution_id, referrer_id in qualified_ids.iterator():
                if points_enabled_for(referrer_id):
                    awarded_count += int(award_referral_points(attribution_id))
        except PointsLedgerError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(
            f'Reversed {pending_reversed} pending legacy credits and {reversed_count} rejected credits; '
            f'awarded {awarded_count} qualified referrals.')
