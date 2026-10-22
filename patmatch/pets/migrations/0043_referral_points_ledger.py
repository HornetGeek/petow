from django.db import migrations, models
import django.db.models.deletion


def link_legacy_referral_credits(apps, schema_editor):
    Attribution = apps.get_model('pets', 'ReferralAttribution')
    Transaction = apps.get_model('pets', 'PointsTransaction')
    for entry in Transaction.objects.filter(
            reason='referral_signup', idempotency_key__startswith='referral:').iterator():
        try:
            referred_user_id = int(entry.idempotency_key.split(':', 1)[1])
        except ValueError:
            continue
        attribution = Attribution.objects.filter(
            referred_user_id_at_capture=referred_user_id,
            referrer_id=entry.wallet.user_id,
        ).first()
        if attribution:
            Transaction.objects.filter(pk=entry.pk).update(referral_attribution_id=attribution.pk)


class Migration(migrations.Migration):
    dependencies = [('pets', '0042_referral_qualification')]

    operations = [
        migrations.AddField(
            model_name='pointstransaction', name='referral_attribution',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                                    related_name='point_transactions', to='pets.referralattribution')),
        migrations.AddConstraint(
            model_name='pointstransaction',
            constraint=models.CheckConstraint(check=~models.Q(amount=0), name='nonzero_points_transaction')),
        migrations.RunPython(link_legacy_referral_credits, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='pointstransaction',
            constraint=models.UniqueConstraint(fields=('referral_attribution',), condition=models.Q(reason='qualified_referral'),
                                               name='unique_referral_credit')),
    ]
