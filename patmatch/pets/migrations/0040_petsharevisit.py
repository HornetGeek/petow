from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('pets', '0039_backfill_public_pet_sharing'),
    ]

    operations = [
        migrations.CreateModel(
            name='PetShareVisit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('visitor_digest', models.CharField(max_length=64)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('share', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='visits', to='pets.petshare')),
            ],
        ),
        migrations.AddConstraint(
            model_name='petsharevisit',
            constraint=models.UniqueConstraint(fields=('share', 'visitor_digest'), name='unique_pet_share_visitor'),
        ),
    ]
