from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('pets', '0045_chat_admin_summary'), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(name='DailyChallenge', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('slug', models.SlugField(unique=True)), ('title', models.CharField(max_length=100)),
            ('description', models.CharField(max_length=240)), ('category', models.CharField(default='community', max_length=40)),
            ('cover', models.ImageField(blank=True, upload_to='challenges/covers/')),
            ('starts_at', models.DateTimeField(blank=True, null=True)), ('ends_at', models.DateTimeField(blank=True, null=True)),
            ('is_published', models.BooleanField(default=False)), ('is_disabled', models.BooleanField(default=False)),
            ('created_at', models.DateTimeField(auto_now_add=True)), ('updated_at', models.DateTimeField(auto_now=True)),
        ], options={'indexes': [models.Index(fields=['is_published', 'is_disabled', 'starts_at', 'ends_at'], name='challenge_schedule_idx')]}),
        migrations.CreateModel(name='ChallengeEntry', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('image', models.ImageField(upload_to='challenges/entries/')),
            ('thumbnail', models.ImageField(blank=True, upload_to='challenges/thumbs/')),
            ('caption', models.CharField(blank=True, max_length=160)), ('is_hidden', models.BooleanField(default=False)),
            ('deleted_at', models.DateTimeField(blank=True, null=True)), ('created_at', models.DateTimeField(auto_now_add=True)),
            ('challenge', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='entries', to='pets.dailychallenge')),
            ('pet', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='pets.pet')),
            ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
        ], options={'indexes': [models.Index(fields=['challenge', 'is_hidden', 'deleted_at', '-created_at'], name='challenge_gallery_idx')],
                    'constraints': [models.UniqueConstraint(condition=models.Q(deleted_at__isnull=True), fields=('challenge', 'user'), name='challenge_one_active_entry')]}),
        migrations.CreateModel(name='ChallengeReaction', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('created_at', models.DateTimeField(auto_now_add=True)),
            ('entry', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reactions', to='pets.challengeentry')),
            ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
        ], options={'constraints': [models.UniqueConstraint(fields=('entry', 'user'), name='challenge_one_reaction')]}),
        migrations.CreateModel(name='ChallengeReport', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('reason', models.CharField(choices=[('inappropriate', 'محتوى غير مناسب'), ('spam', 'إزعاج أو إعلان'), ('safety', 'مشكلة أمان'), ('other', 'سبب آخر')], max_length=32)),
            ('details', models.CharField(blank=True, max_length=500)), ('status', models.CharField(default='open', max_length=16)),
            ('created_at', models.DateTimeField(auto_now_add=True)),
            ('entry', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reports', to='pets.challengeentry')),
            ('reporter', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
        ], options={'constraints': [models.UniqueConstraint(fields=('entry', 'reporter'), name='challenge_one_report')]}),
    ]
