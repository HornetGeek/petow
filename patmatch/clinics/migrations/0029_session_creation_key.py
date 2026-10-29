from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('clinics', '0028_preserve_session_prescriptions')]
    operations = [migrations.AddField(model_name='veterinarysession', name='creation_key',
        field=models.CharField(max_length=100, null=True, blank=True, unique=True, editable=False))]
