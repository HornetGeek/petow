from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('pets', '0032_petlike_storyreaction_engagementevent'),
    ]

    operations = [
        migrations.CreateModel(
            name='SavedSearch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120)),
                ('target_type', models.CharField(choices=[('pet', 'حيوانات'), ('adoption_pet', 'حيوانات للتبني'), ('breeding_pet', 'حيوانات للتزاوج'), ('service', 'خدمات')], default='pet', max_length=24)),
                ('filters', models.JSONField(blank=True, default=dict)),
                ('city', models.CharField(blank=True, default='', max_length=120)),
                ('latitude', models.DecimalField(blank=True, decimal_places=8, max_digits=10, null=True)),
                ('longitude', models.DecimalField(blank=True, decimal_places=8, max_digits=11, null=True)),
                ('radius_km', models.PositiveIntegerField(default=25)),
                ('alerts_enabled', models.BooleanField(default=True)),
                ('is_active', models.BooleanField(db_index=True, default=True)),
                ('last_checked_at', models.DateTimeField(blank=True, null=True)),
                ('last_notified_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='saved_searches', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'بحث محفوظ',
                'verbose_name_plural': 'البحوث المحفوظة',
                'ordering': ['-updated_at'],
            },
        ),
        migrations.CreateModel(
            name='SavedSearchMatch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('target_type', models.CharField(max_length=24)),
                ('target_id', models.PositiveBigIntegerField()),
                ('matched_at', models.DateTimeField(auto_now_add=True)),
                ('notified_at', models.DateTimeField(blank=True, null=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('saved_search', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='matches', to='pets.savedsearch')),
            ],
            options={
                'verbose_name': 'نتيجة بحث محفوظ',
                'verbose_name_plural': 'نتائج البحوث المحفوظة',
                'ordering': ['-matched_at'],
            },
        ),
        migrations.AlterField(
            model_name='notification',
            name='type',
            field=models.CharField(choices=[('breeding_request_received', 'تم استلام طلب مقابلة جديد'), ('breeding_request_approved', 'تم قبول طلب المقابلة'), ('breeding_request_rejected', 'تم رفض طلب المقابلة'), ('breeding_request_completed', 'تم إكمال المقابلة'), ('favorite_added', 'تم إضافة حيوانك إلى المفضلة'), ('pet_status_changed', 'تم تغيير حالة حيوانك'), ('system_message', 'رسالة من النظام'), ('chat_message_received', 'تم استلام رسالة جديدة'), ('pet_nearby', 'حيوان جديد بالقرب منك'), ('adoption_pet_nearby', 'حيوان للتبني بالقرب منك'), ('saved_search_match', 'نتيجة جديدة لبحث محفوظ'), ('clinic_broadcast', 'إشعار من العيادة'), ('clinic_invite', 'دعوة ربط عيادة'), ('breeding_request_pending_reminder', 'تذكير بطلب مقابلة معلق'), ('adoption_request_received', 'تم استلام طلب تبني جديد'), ('adoption_request_approved', 'تم قبول طلب التبني'), ('adoption_request_pending_reminder', 'تذكير بطلب تبني معلق'), ('account_verification_approved', 'تم اعتماد التحقق من الحساب')], help_text='نوع الإشعار', max_length=64),
        ),
        migrations.AddIndex(
            model_name='savedsearch',
            index=models.Index(fields=['user', 'is_active', '-updated_at'], name='pets_saved_user_active_idx'),
        ),
        migrations.AddIndex(
            model_name='savedsearch',
            index=models.Index(fields=['target_type', 'is_active'], name='pets_saved_target_idx'),
        ),
        migrations.AddIndex(
            model_name='savedsearchmatch',
            index=models.Index(fields=['saved_search', '-matched_at'], name='pets_saved_match_idx'),
        ),
        migrations.AddIndex(
            model_name='savedsearchmatch',
            index=models.Index(fields=['target_type', 'target_id'], name='pets_saved_target_id_idx'),
        ),
        migrations.AddConstraint(
            model_name='savedsearchmatch',
            constraint=models.UniqueConstraint(fields=('saved_search', 'target_type', 'target_id'), name='pets_saved_match_uniq'),
        ),
    ]
