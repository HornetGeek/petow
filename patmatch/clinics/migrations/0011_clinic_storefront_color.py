from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('clinics', '0010_storefront_orders_and_bookings'),
    ]

    operations = [
        migrations.AddField(
            model_name='clinic',
            name='storefront_primary_color',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
    ]
