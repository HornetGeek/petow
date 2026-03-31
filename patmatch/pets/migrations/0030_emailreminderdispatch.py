from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('pets', '0029_notification_engagement_policy'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='EmailReminderDispatch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reminder_key', models.CharField(choices=[('daily_unread_messages', 'Daily unread messages')], default='daily_unread_messages', max_length=64)),
                ('target_date', models.DateField()),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('processing', 'Processing'), ('sent', 'Sent'), ('failed', 'Failed')], default='pending', max_length=16)),
                ('attempts', models.PositiveIntegerField(default=0)),
                ('recipient_email', models.EmailField(blank=True, default='', max_length=254)),
                ('last_error', models.TextField(blank=True, default='')),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='email_reminder_dispatches', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'سجل إرسال تذكير بريدي',
                'verbose_name_plural': 'سجلات إرسال التذكيرات البريدية',
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(fields=['reminder_key', 'target_date', 'status'], name='pets_eml_rem_key_dt_st_idx'),
                    models.Index(fields=['user', 'target_date'], name='pets_eml_rem_usr_dt_idx'),
                ],
            },
        ),
        migrations.AddConstraint(
            model_name='emailreminderdispatch',
            constraint=models.UniqueConstraint(fields=('user', 'reminder_key', 'target_date'), name='pets_email_reminder_user_key_date_uniq'),
        ),
    ]
