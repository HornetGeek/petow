from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('pets', '0031_story_storyreport_storyview_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='StoryReaction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reaction', models.CharField(choices=[('heart', 'أعجبني'), ('cute', 'لطيف'), ('helpful', 'مفيد'), ('interested', 'مهتم')], max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('story', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reactions', to='pets.story')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='story_reactions', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'تفاعل قصة',
                'verbose_name_plural': 'تفاعلات القصص',
                'ordering': ['-updated_at'],
            },
        ),
        migrations.CreateModel(
            name='PetLike',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('pet', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='liked_by', to='pets.pet')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pet_likes', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'إعجاب حيوان',
                'verbose_name_plural': 'إعجابات الحيوانات',
                'ordering': ['-created_at'],
                'unique_together': {('user', 'pet')},
            },
        ),
        migrations.CreateModel(
            name='EngagementEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_type', models.CharField(choices=[('pet_like', 'إعجاب بحيوان'), ('pet_unlike', 'إزالة إعجاب بحيوان'), ('story_reaction', 'تفاعل مع قصة'), ('story_reaction_removed', 'إزالة تفاعل قصة'), ('story_view', 'مشاهدة قصة'), ('cta_tap', 'ضغط دعوة لاتخاذ إجراء'), ('favorite', 'إضافة للمفضلة'), ('unfavorite', 'إزالة من المفضلة')], max_length=32)),
                ('source', models.CharField(choices=[('pet_card', 'بطاقة الحيوان'), ('pet_details', 'تفاصيل الحيوان'), ('story_viewer', 'عارض القصص'), ('home_story_rail', 'شريط القصص'), ('notification', 'إشعار'), ('other', 'مصدر آخر')], default='other', max_length=32)),
                ('target_type', models.CharField(choices=[('pet', 'حيوان'), ('story', 'قصة'), ('clinic', 'عيادة'), ('service', 'خدمة')], max_length=24)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('pet', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='engagement_events', to='pets.pet')),
                ('story', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='engagement_events', to='pets.story')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='engagement_events', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'حدث تفاعل',
                'verbose_name_plural': 'أحداث التفاعل',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='storyreaction',
            index=models.Index(fields=['story', 'reaction'], name='pets_storyreact_summary_idx'),
        ),
        migrations.AddIndex(
            model_name='storyreaction',
            index=models.Index(fields=['user', '-updated_at'], name='pets_storyreact_user_idx'),
        ),
        migrations.AddConstraint(
            model_name='storyreaction',
            constraint=models.UniqueConstraint(fields=('story', 'user'), name='pets_strreact_user_uniq'),
        ),
        migrations.AddIndex(
            model_name='petlike',
            index=models.Index(fields=['pet', '-created_at'], name='pets_petlike_pet_idx'),
        ),
        migrations.AddIndex(
            model_name='petlike',
            index=models.Index(fields=['user', '-created_at'], name='pets_petlike_user_idx'),
        ),
        migrations.AddIndex(
            model_name='engagementevent',
            index=models.Index(fields=['event_type', '-created_at'], name='pets_engage_event_idx'),
        ),
        migrations.AddIndex(
            model_name='engagementevent',
            index=models.Index(fields=['target_type', '-created_at'], name='pets_engage_target_idx'),
        ),
        migrations.AddIndex(
            model_name='engagementevent',
            index=models.Index(fields=['user', '-created_at'], name='pets_engage_user_idx'),
        ),
    ]
