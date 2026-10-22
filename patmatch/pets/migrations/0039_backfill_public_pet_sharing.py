from django.db import migrations


def publish_existing_listings(apps, schema_editor):
    Pet = apps.get_model('pets', 'Pet')
    Pet.objects.filter(
        status__in=['available', 'available_for_adoption'],
        owner__is_active=True,
        main_image__isnull=False,
    ).exclude(main_image='').update(is_public=True)


class Migration(migrations.Migration):
    dependencies = [('pets', '0038_petshare_pet_is_public_rewardredemption_referralcode_and_more')]
    operations = [migrations.RunPython(publish_existing_listings, migrations.RunPython.noop)]
