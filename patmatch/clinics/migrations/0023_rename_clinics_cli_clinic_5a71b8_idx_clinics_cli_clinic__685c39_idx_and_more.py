from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('clinics', '0022_simple_veterinary_sessions'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='clinicpatientdocument',
            new_name='clinics_cli_clinic__685c39_idx',
            old_name='clinics_cli_clinic_5a71b8_idx',
        ),
        migrations.RenameIndex(
            model_name='clinicpatientdocument',
            new_name='clinics_cli_clinic__f89481_idx',
            old_name='clinics_cli_clinic_6b86b7_idx',
        ),
        migrations.RenameIndex(
            model_name='clinicpatientnote',
            new_name='clinics_cli_clinic__0ab24e_idx',
            old_name='clinics_cli_clinic_71d917_idx',
        ),
    ]
