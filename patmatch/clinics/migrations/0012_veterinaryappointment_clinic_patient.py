from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def backfill_clinic_patient(apps, schema_editor):
    VeterinaryAppointment = apps.get_model('clinics', 'VeterinaryAppointment')
    ClinicPatientRecord = apps.get_model('clinics', 'ClinicPatientRecord')

    for appointment in VeterinaryAppointment.objects.filter(clinic_patient__isnull=True, pet__isnull=False):
        patient = ClinicPatientRecord.objects.filter(
            clinic_id=appointment.clinic_id,
            linked_pet_id=appointment.pet_id,
        ).first()
        if patient:
            appointment.clinic_patient_id = patient.id
            appointment.save(update_fields=['clinic_patient'])


class Migration(migrations.Migration):

    dependencies = [
        ('clinics', '0011_clinic_storefront_color'),
    ]

    operations = [
        migrations.AlterField(
            model_name='veterinaryappointment',
            name='owner',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='vet_appointments',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='veterinaryappointment',
            name='pet',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='vet_appointments',
                to='pets.pet',
            ),
        ),
        migrations.AddField(
            model_name='veterinaryappointment',
            name='clinic_patient',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='clinic_appointments',
                help_text='سجل المريض في لوحة العيادة (للمواعيد غير المرتبطة بالمستخدم بعد)',
                to='clinics.clinicpatientrecord',
            ),
        ),
        migrations.RunPython(backfill_clinic_patient, migrations.RunPython.noop),
    ]
