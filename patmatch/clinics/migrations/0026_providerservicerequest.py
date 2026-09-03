import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('clinics', '0025_merge_clinic_catalog_currency_and_index_renames'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProviderServiceRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('public_id', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('request_kind', models.CharField(choices=[('new_business', 'نشاط جديد'), ('existing_listing', 'نشاط موجود على Petow')], default='new_business', max_length=24)),
                ('business_name', models.CharField(max_length=200)),
                ('whatsapp_phone', models.CharField(max_length=30)),
                ('normalized_whatsapp', models.CharField(db_index=True, max_length=20)),
                ('service_groups', models.JSONField(default=list)),
                ('address', models.CharField(max_length=300)),
                ('latitude', models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ('longitude', models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ('consented_at', models.DateTimeField()),
                ('status', models.CharField(choices=[('new', 'جديد'), ('contacted', 'تم التواصل'), ('qualified', 'مؤهل'), ('converted', 'تمت الإضافة'), ('closed', 'مغلق')], default='new', max_length=20)),
                ('close_reason', models.CharField(blank=True, default='', max_length=80)),
                ('internal_notes', models.TextField(blank=True, default='')),
                ('possible_duplicate', models.BooleanField(default=False)),
                ('contacted_at', models.DateTimeField(blank=True, null=True)),
                ('converted_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('converted_clinic', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='converted_provider_service_requests', to='clinics.clinic')),
                ('existing_clinic', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='provider_service_requests_as_existing', to='clinics.clinic')),
                ('requester', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='provider_service_requests', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'طلب إضافة مقدم خدمة',
                'verbose_name_plural': 'طلبات إضافة مقدمي الخدمات',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='providerservicerequest',
            index=models.Index(fields=['status', '-created_at'], name='clinic_provider_status_idx'),
        ),
        migrations.AddIndex(
            model_name='providerservicerequest',
            index=models.Index(fields=['requester', '-created_at'], name='clinic_provider_user_idx'),
        ),
        migrations.AddConstraint(
            model_name='providerservicerequest',
            constraint=models.UniqueConstraint(
                condition=models.Q(status__in=('new', 'contacted', 'qualified')),
                fields=('requester',),
                name='clinic_provider_one_open_per_user',
            ),
        ),
    ]
