from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pets', '0020_chatroom_clinic_message_chatroom_clinic_patient_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='type',
            field=models.CharField(
                choices=[
                    ('breeding_request_received', 'تم استلام طلب مقابلة جديد'),
                    ('breeding_request_approved', 'تم قبول طلب المقابلة'),
                    ('breeding_request_rejected', 'تم رفض طلب المقابلة'),
                    ('breeding_request_completed', 'تم إكمال المقابلة'),
                    ('favorite_added', 'تم إضافة حيوانك إلى المفضلة'),
                    ('pet_status_changed', 'تم تغيير حالة حيوانك'),
                    ('system_message', 'رسالة من النظام'),
                    ('chat_message_received', 'تم استلام رسالة جديدة'),
                    ('pet_nearby', 'حيوان جديد بالقرب منك'),
                    ('clinic_broadcast', 'إشعار من العيادة'),
                    ('clinic_invite', 'دعوة ربط عيادة'),
                    ('breeding_request_pending_reminder', 'تذكير بطلب مقابلة معلق'),
                ],
                help_text='نوع الإشعار',
                max_length=64,
            ),
        ),
    ]

