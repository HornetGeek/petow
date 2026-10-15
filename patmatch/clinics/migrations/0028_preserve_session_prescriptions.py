from django.db import migrations


def preserve_prescriptions(apps, schema_editor):
    Session = apps.get_model('clinics', 'VeterinarySession')
    Entry = apps.get_model('clinics', 'ClinicMedicalEntry')
    for session in Session.objects.exclude(clinic_patient_id=None).iterator():
        if not session.medications:
            continue
        Entry.objects.get_or_create(session_id=session.id, kind='prescription', defaults={
            'clinic_id': session.clinic_id, 'patient_id': session.clinic_patient_id,
            'title': 'وصفة الزيارة', 'date': session.session_date,
            'data': {'medications': session.medications, 'veterinarian': session.care_provider_name},
        })


class Migration(migrations.Migration):
    dependencies = [('clinics', '0027_patient_medical_record')]
    operations = [migrations.RunPython(preserve_prescriptions, migrations.RunPython.noop)]
