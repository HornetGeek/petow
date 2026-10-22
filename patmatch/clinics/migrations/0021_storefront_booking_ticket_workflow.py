from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('clinics', '0020_patient_profile_fields_and_assets'),
    ]

    operations = [
        migrations.AlterField(
            model_name='storefrontbooking',
            name='status',
            field=models.CharField(
                choices=[
                    ('new', 'جديد'),
                    ('accepted', 'مقبول'),
                    ('in_progress', 'قيد المعالجة'),
                    ('waiting_owner', 'بانتظار المالك'),
                    ('rejected', 'مرفوض'),
                    ('counter_proposed', 'تم اقتراح موعد بديل'),
                    ('confirmed', 'مؤكد'),
                    ('completed', 'مكتمل'),
                    ('cancelled', 'ملغي'),
                ],
                default='new',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='assigned_staff',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='assigned_clinic_requests',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='completed_result',
            field=models.CharField(
                blank=True,
                choices=[
                    ('appointment_booked', 'تم حجز موعد'),
                    ('visit_completed', 'تمت الزيارة'),
                    ('owner_no_response', 'لم يرد المالك'),
                    ('cancelled', 'ملغي'),
                    ('rejected', 'مرفوض'),
                ],
                max_length=40,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='diagnosis',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='doctor_notes',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='internal_notes',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='linked_patient',
            field=models.ForeignKey(
                blank=True,
                help_text='ملف المريض داخل العيادة المرتبط بهذا الطلب',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='clinic_requests',
                to='clinics.clinicpatientrecord',
            ),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='price_estimate',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='storefrontbooking',
            name='treatment',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name='StorefrontBookingTimeline',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_type', models.CharField(max_length=60)),
                ('message', models.CharField(max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                (
                    'actor',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='clinic_request_timeline_events',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    'booking',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='timeline_events',
                        to='clinics.storefrontbooking',
                    ),
                ),
            ],
            options={
                'verbose_name': 'حدث طلب عيادة',
                'verbose_name_plural': 'أحداث طلبات العيادة',
                'ordering': ['created_at'],
            },
        ),
    ]
