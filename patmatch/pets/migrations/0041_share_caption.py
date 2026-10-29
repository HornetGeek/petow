from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('pets', '0040_petsharevisit')]

    operations = [
        migrations.RemoveConstraint(model_name='petshareasset', name='unique_pet_share_asset'),
        migrations.AddField(model_name='petshareasset', name='content_hash', field=models.CharField(blank=True, default='', max_length=64)),
        migrations.AddField(model_name='petshareasset', name='caption', field=models.CharField(blank=True, default='', max_length=140)),
        migrations.AddConstraint(model_name='petshareasset', constraint=models.UniqueConstraint(fields=('share', 'template', 'format', 'revision', 'content_hash'), name='unique_pet_share_asset')),
    ]
