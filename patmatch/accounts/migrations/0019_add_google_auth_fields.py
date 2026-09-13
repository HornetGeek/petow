from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0018_user_first_pet_created_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="auth_provider",
            field=models.CharField(
                choices=[("email", "بريد إلكتروني"), ("google", "Google")],
                default="email",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="google_id",
            field=models.CharField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.AlterField(
            model_name="user",
            name="phone",
            field=models.CharField(
                blank=True, default="", help_text="رقم الهاتف", max_length=20
            ),
        ),
    ]
