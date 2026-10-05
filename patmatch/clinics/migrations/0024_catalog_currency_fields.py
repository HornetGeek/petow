from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinics', '0023_clinicpatientrecord_age_months'),
    ]

    operations = [
        migrations.AddField(
            model_name='clinicproduct',
            name='currency',
            field=models.CharField(default='EGP', max_length=3),
        ),
        migrations.AddField(
            model_name='clinicservice',
            name='currency',
            field=models.CharField(default='EGP', help_text='عملة السعر حسب كود ISO 4217', max_length=3),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='quoted_currency',
            field=models.CharField(default='EGP', max_length=3),
        ),
        migrations.AddField(
            model_name='storefrontorder',
            name='currency',
            field=models.CharField(default='EGP', max_length=3),
        ),
    ]
