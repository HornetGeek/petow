from django.db import migrations, models
from django.db.models import OuterRef, Subquery


def backfill_first_pet_created_at(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    Pet = apps.get_model('pets', 'Pet')

    earliest_pet_created_at = (
        Pet.objects.filter(owner_id=OuterRef('pk'))
        .order_by('created_at')
        .values('created_at')[:1]
    )

    User.objects.filter(first_pet_created_at__isnull=True).update(
        first_pet_created_at=Subquery(earliest_pet_created_at)
    )


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0017_usernotificationsettings_allow_reminder_email'),
        ('pets', '0030_emailreminderdispatch'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='first_pet_created_at',
            field=models.DateTimeField(
                blank=True,
                help_text='تاريخ إنشاء أول حيوان للمستخدم (لاستخدامه في حملات onboarding)',
                null=True,
            ),
        ),
        migrations.RunPython(backfill_first_pet_created_at, migrations.RunPython.noop),
    ]
