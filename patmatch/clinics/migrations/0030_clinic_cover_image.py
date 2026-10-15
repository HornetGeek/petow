from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('clinics', '0029_session_creation_key')]

    operations = [
        migrations.AddField(
            model_name='clinic',
            name='cover_image',
            field=models.ImageField(blank=True, null=True, upload_to='clinics/covers/'),
        ),
    ]
