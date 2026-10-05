from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('clinics', '0016_rename_clinics_cli_categor_95832a_idx_clinics_cli_categor_56a3a0_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='storefrontbooking',
            name='customer_user',
            field=models.ForeignKey(blank=True, help_text='المستخدم صاحب الطلب عند إنشائه من التطبيق', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='storefront_bookings', to=settings.AUTH_USER_MODEL),
        ),
    ]
