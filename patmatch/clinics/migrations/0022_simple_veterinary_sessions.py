from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def forwards_statuses(apps, schema_editor):
    StorefrontBooking = apps.get_model('clinics', 'StorefrontBooking')
    VeterinaryAppointment = apps.get_model('clinics', 'VeterinaryAppointment')

    booking_map = {
        'new': 'PENDING',
        'waiting_owner': 'PENDING',
        'counter_proposed': 'PENDING',
        'accepted': 'ACCEPTED',
        'confirmed': 'ACCEPTED',
        'in_progress': 'IN_SESSION',
        'rejected': 'REFUSED',
        'completed': 'COMPLETED',
        'cancelled': 'CANCELLED',
    }
    appointment_map = {
        'scheduled': 'ACCEPTED',
        'rescheduled': 'ACCEPTED',
        'completed': 'COMPLETED',
        'cancelled': 'CANCELLED',
    }
    for old, new in booking_map.items():
        StorefrontBooking.objects.filter(status=old).update(status=new)
    for old, new in appointment_map.items():
        VeterinaryAppointment.objects.filter(status=old).update(status=new)


def backwards_statuses(apps, schema_editor):
    StorefrontBooking = apps.get_model('clinics', 'StorefrontBooking')
    VeterinaryAppointment = apps.get_model('clinics', 'VeterinaryAppointment')

    booking_map = {
        'PENDING': 'new',
        'ACCEPTED': 'accepted',
        'IN_SESSION': 'in_progress',
        'REFUSED': 'rejected',
        'COMPLETED': 'completed',
        'CANCELLED': 'cancelled',
        'NO_SHOW': 'cancelled',
    }
    appointment_map = {
        'PENDING': 'scheduled',
        'ACCEPTED': 'scheduled',
        'IN_SESSION': 'scheduled',
        'REFUSED': 'cancelled',
        'COMPLETED': 'completed',
        'CANCELLED': 'cancelled',
        'NO_SHOW': 'cancelled',
    }
    for old, new in booking_map.items():
        StorefrontBooking.objects.filter(status=old).update(status=new)
    for old, new in appointment_map.items():
        VeterinaryAppointment.objects.filter(status=old).update(status=new)


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('clinics', '0021_storefront_booking_ticket_workflow'),
    ]

    operations = [
        migrations.RunPython(forwards_statuses, backwards_statuses),
        migrations.AlterField(
            model_name='storefrontbooking',
            name='status',
            field=models.CharField(
                choices=[
                    ('PENDING', 'قيد الانتظار'),
                    ('ACCEPTED', 'مقبول'),
                    ('REFUSED', 'مرفوض'),
                    ('IN_SESSION', 'داخل الجلسة'),
                    ('COMPLETED', 'مكتمل'),
                    ('CANCELLED', 'ملغي'),
                    ('NO_SHOW', 'لم يحضر'),
                ],
                default='PENDING',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='veterinaryappointment',
            name='status',
            field=models.CharField(
                choices=[
                    ('PENDING', 'قيد الانتظار'),
                    ('ACCEPTED', 'مقبول'),
                    ('REFUSED', 'مرفوض'),
                    ('IN_SESSION', 'داخل الجلسة'),
                    ('COMPLETED', 'مكتمل'),
                    ('CANCELLED', 'ملغي'),
                    ('NO_SHOW', 'لم يحضر'),
                ],
                default='ACCEPTED',
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name='VeterinarySession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('care_provider_name', models.CharField(blank=True, max_length=200)),
                ('session_date', models.DateField()),
                ('session_started_at', models.DateTimeField()),
                ('session_ended_at', models.DateTimeField(blank=True, null=True)),
                ('service_type', models.CharField(blank=True, max_length=60)),
                ('main_complaint', models.TextField(blank=True)),
                ('symptoms', models.TextField(blank=True)),
                ('symptoms_duration', models.CharField(blank=True, max_length=120)),
                ('owner_notes', models.TextField(blank=True)),
                ('previous_treatment', models.TextField(blank=True)),
                ('current_medications', models.TextField(blank=True)),
                ('allergies', models.TextField(blank=True)),
                ('vitals', models.JSONField(blank=True, default=dict)),
                ('physical_exam', models.JSONField(blank=True, default=dict)),
                ('physical_exam_notes', models.TextField(blank=True)),
                ('diagnosis', models.TextField(blank=True)),
                ('provisional_diagnosis', models.TextField(blank=True)),
                ('case_severity', models.CharField(blank=True, choices=[('low', 'بسيطة'), ('medium', 'متوسطة'), ('high', 'خطيرة'), ('emergency', 'طارئة')], max_length=20)),
                ('doctor_notes', models.TextField(blank=True)),
                ('services_performed', models.TextField(blank=True)),
                ('medications', models.JSONField(blank=True, default=list)),
                ('lab_tests_requested', models.TextField(blank=True)),
                ('imaging_requested', models.TextField(blank=True)),
                ('attachments', models.JSONField(blank=True, default=list)),
                ('home_care_instructions', models.TextField(blank=True)),
                ('food_instructions', models.TextField(blank=True)),
                ('warning_signs', models.TextField(blank=True)),
                ('follow_up_needed', models.BooleanField(default=False)),
                ('next_appointment_date', models.DateField(blank=True, null=True)),
                ('owner_summary_sent_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('appointment', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='session', to='clinics.veterinaryappointment')),
                ('care_provider', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='provided_veterinary_sessions', to=settings.AUTH_USER_MODEL)),
                ('clinic', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='veterinary_sessions', to='clinics.clinic')),
                ('clinic_patient', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='veterinary_sessions', to='clinics.clinicpatientrecord')),
                ('owner', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='clinic_pet_sessions', to=settings.AUTH_USER_MODEL)),
                ('pet', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='clinic_sessions', to='pets.pet')),
            ],
            options={
                'verbose_name': 'جلسة بيطرية',
                'verbose_name_plural': 'الجلسات البيطرية',
                'ordering': ['-session_started_at'],
            },
        ),
    ]
