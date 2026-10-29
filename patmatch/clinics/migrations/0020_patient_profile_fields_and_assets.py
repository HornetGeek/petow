from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('clinics', '0019_merge_storefront_booking_workflow'),
    ]

    operations = [
        migrations.AddField(
            model_name='clinicpatientrecord',
            name='blood_type',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='clinicpatientrecord',
            name='photo',
            field=models.ImageField(blank=True, null=True, upload_to='clinics/patients/photos/'),
        ),
        migrations.AddField(
            model_name='clinicpatientrecord',
            name='weight_kg',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=6, null=True),
        ),
        migrations.CreateModel(
            name='ClinicPatientNote',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('text', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('clinic', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='patient_notes', to='clinics.clinic')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='clinic_patient_notes', to=settings.AUTH_USER_MODEL)),
                ('patient', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='profile_notes', to='clinics.clinicpatientrecord')),
            ],
            options={
                'verbose_name': 'ملاحظة مريض عيادة',
                'verbose_name_plural': 'ملاحظات مرضى العيادة',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='ClinicPatientDocument',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=180)),
                ('category', models.CharField(choices=[('medical_record', 'سجل طبي'), ('vaccination', 'تطعيم'), ('lab_result', 'نتيجة مختبر'), ('certificate', 'شهادة'), ('other', 'أخرى')], default='other', max_length=30)),
                ('file', models.FileField(upload_to='clinics/patients/documents/')),
                ('notes', models.TextField(blank=True, null=True)),
                ('issued_at', models.DateField(blank=True, null=True)),
                ('expires_at', models.DateField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('clinic', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='patient_documents', to='clinics.clinic')),
                ('patient', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='documents', to='clinics.clinicpatientrecord')),
                ('uploaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='clinic_patient_documents', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'ملف مريض عيادة',
                'verbose_name_plural': 'ملفات مرضى العيادة',
                'ordering': ['-issued_at', '-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='clinicpatientnote',
            index=models.Index(fields=['clinic', 'patient', '-created_at'], name='clinics_cli_clinic_71d917_idx'),
        ),
        migrations.AddIndex(
            model_name='clinicpatientdocument',
            index=models.Index(fields=['clinic', 'patient', 'category'], name='clinics_cli_clinic_5a71b8_idx'),
        ),
        migrations.AddIndex(
            model_name='clinicpatientdocument',
            index=models.Index(fields=['clinic', 'patient', '-created_at'], name='clinics_cli_clinic_6b86b7_idx'),
        ),
    ]
