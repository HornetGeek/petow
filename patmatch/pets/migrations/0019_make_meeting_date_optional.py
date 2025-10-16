# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pets', '0018_alter_notification_type'),
    ]

    operations = [
        migrations.AlterField(
            model_name='breedingrequest',
            name='meeting_date',
            field=models.DateField(blank=True, help_text='تاريخ المقابلة المقترح (اختياري)', null=True),
        ),
    ]
