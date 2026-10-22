from django.conf import settings
from django.db import migrations, models
from django.utils import timezone
import django.db.models.deletion


def reset_signup_qualification(apps, schema_editor):
    Attribution = apps.get_model('pets', 'ReferralAttribution')
    Pet = apps.get_model('pets', 'Pet')
    for attribution in Attribution.objects.select_related('share', 'referred_user').iterator():
        attribution.referred_user_id_at_capture = attribution.referred_user_id
        attribution.original_pet_id = attribution.share.pet_id if attribution.share_id else None
        attribution.captured_at = attribution.referred_user.date_joined
        prior_pet_exists = Pet.objects.filter(owner_id=attribution.referred_user_id).exists()
        attribution.status = 'rejected' if prior_pet_exists else 'pending'
        attribution.qualified_at = None
        if prior_pet_exists:
            attribution.rejected_at = timezone.now()
            attribution.rejection_reason = 'legacy_action_unverified'
        attribution.save(update_fields=[
            'referred_user_id_at_capture', 'original_pet_id', 'captured_at', 'status',
            'qualified_at', 'rejected_at', 'rejection_reason'])


class Migration(migrations.Migration):
    dependencies = [('pets', '0041_share_caption')]

    operations = [
        migrations.AddField(
            model_name='referralattribution', name='referred_user_id_at_capture',
            field=models.PositiveBigIntegerField(default=0), preserve_default=False),
        migrations.AddField(
            model_name='referralattribution', name='original_pet_id',
            field=models.PositiveBigIntegerField(blank=True, null=True)),
        migrations.AddField(
            model_name='referralattribution', name='device_digest',
            field=models.CharField(blank=True, db_index=True, max_length=64, null=True)),
        migrations.AddField(
            model_name='referralattribution', name='status',
            field=models.CharField(choices=[('pending', 'Pending'), ('qualified', 'Qualified'), ('rejected', 'Rejected')], db_index=True, default='pending', max_length=12)),
        migrations.AddField(
            model_name='referralattribution', name='captured_at',
            field=models.DateTimeField(db_index=True, default=timezone.now)),
        migrations.AddField(
            model_name='referralattribution', name='rejected_at',
            field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(
            model_name='referralattribution', name='rejection_reason',
            field=models.CharField(blank=True, max_length=32)),
        migrations.AlterField(
            model_name='referralattribution', name='qualified_at',
            field=models.DateTimeField(blank=True, null=True)),
        migrations.AlterField(
            model_name='referralattribution', name='referred_user',
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                       related_name='referral_attribution', to=settings.AUTH_USER_MODEL)),
        migrations.RunPython(reset_signup_qualification, migrations.RunPython.noop),
    ]
