from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import pets.models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('pets', '0030_emailreminderdispatch'),
    ]

    operations = [
        migrations.CreateModel(
            name='Story',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('image', models.ImageField(upload_to=pets.models.story_image_upload_path)),
                ('caption', models.CharField(blank=True, default='', max_length=160)),
                ('expires_at', models.DateTimeField(db_index=True)),
                ('is_hidden', models.BooleanField(db_index=True, default=False)),
                ('hidden_reason', models.TextField(blank=True, default='')),
                ('hidden_at', models.DateTimeField(blank=True, null=True)),
                ('deleted_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('author', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='stories', to=settings.AUTH_USER_MODEL)),
                ('hidden_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='hidden_stories', to=settings.AUTH_USER_MODEL)),
                ('pet', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='stories', to='pets.pet')),
            ],
            options={
                'verbose_name': 'قصة',
                'verbose_name_plural': 'القصص',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='StoryView',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('viewed_at', models.DateTimeField(auto_now_add=True)),
                ('story', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='views', to='pets.story')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='story_views', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'مشاهدة قصة',
                'verbose_name_plural': 'مشاهدات القصص',
                'ordering': ['-viewed_at'],
            },
        ),
        migrations.CreateModel(
            name='StoryReport',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reason', models.CharField(choices=[('inappropriate', 'محتوى غير مناسب'), ('spam', 'إزعاج أو إعلان'), ('safety', 'مشكلة أمان'), ('other', 'سبب آخر')], max_length=32)),
                ('details', models.TextField(blank=True, default='')),
                ('status', models.CharField(choices=[('open', 'مفتوح'), ('reviewed', 'تمت المراجعة'), ('dismissed', 'تم التجاهل')], default='open', max_length=16)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('reporter', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='story_reports', to=settings.AUTH_USER_MODEL)),
                ('reviewed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reviewed_story_reports', to=settings.AUTH_USER_MODEL)),
                ('story', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reports', to='pets.story')),
            ],
            options={
                'verbose_name': 'بلاغ قصة',
                'verbose_name_plural': 'بلاغات القصص',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='story',
            index=models.Index(fields=['is_hidden', 'deleted_at', 'expires_at'], name='pets_story_active_idx'),
        ),
        migrations.AddIndex(
            model_name='story',
            index=models.Index(fields=['author', '-created_at'], name='pets_story_author_idx'),
        ),
        migrations.AddIndex(
            model_name='storyview',
            index=models.Index(fields=['user', '-viewed_at'], name='pets_storyview_user_idx'),
        ),
        migrations.AddConstraint(
            model_name='storyview',
            constraint=models.UniqueConstraint(fields=('story', 'user'), name='pets_storyview_user_story_uniq'),
        ),
        migrations.AddIndex(
            model_name='storyreport',
            index=models.Index(fields=['status', '-created_at'], name='pets_storyrep_status_idx'),
        ),
        migrations.AddConstraint(
            model_name='storyreport',
            constraint=models.UniqueConstraint(fields=('story', 'reporter'), name='pets_storyrep_usr_story_uniq'),
        ),
    ]
