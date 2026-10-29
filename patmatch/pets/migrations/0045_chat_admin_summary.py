from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('pets', '0044_story_replies')]
    operations = [
        migrations.AddField('chatroom', 'admin_last_message_at', models.DateTimeField(null=True, blank=True, db_index=True)),
        migrations.AddField('chatroom', 'admin_last_message_preview', models.CharField(max_length=120, blank=True, default='')),
        migrations.AddField('chatroom', 'admin_message_count', models.PositiveIntegerField(null=True, blank=True)),
        migrations.AddField('chatroom', 'admin_summary_version', models.PositiveBigIntegerField(default=0)),
        migrations.AlterModelOptions('chatroom', options={'verbose_name': 'Chat Conversation', 'verbose_name_plural': 'Chat Conversations', 'ordering': ['-updated_at'], 'permissions': [('view_chat_conversation', 'Can view private chat conversations')]}),
    ]
