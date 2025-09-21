"""
Django management command لإرسال تذكرة يومية للرسائل غير المقروءة
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from pets.email_notifications import send_daily_unread_messages_reminder
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'إرسال تذكرة يومية للمستخدمين الذين لديهم رسائل غير مقروءة'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='تشغيل تجريبي بدون إرسال إيميلات فعلية',
        )

    def handle(self, *args, **options):
        self.stdout.write(
            self.style.SUCCESS(f'بدء إرسال التذكرة اليومية في {timezone.now()}')
        )
        
        try:
            if options['dry_run']:
                self.stdout.write(
                    self.style.WARNING('تشغيل تجريبي - لن يتم إرسال إيميلات فعلية')
                )
                # يمكن إضافة منطق للتشغيل التجريبي هنا
                users_count = 0
            else:
                users_count = send_daily_unread_messages_reminder()
            
            self.stdout.write(
                self.style.SUCCESS(
                    f'تم إرسال التذكرة اليومية إلى {users_count} مستخدم'
                )
            )
            
        except Exception as e:
            logger.error(f"Error in send_daily_reminders command: {str(e)}")
            self.stdout.write(
                self.style.ERROR(f'حدث خطأ أثناء إرسال التذكرة: {str(e)}')
            )
            return
        
        self.stdout.write(
            self.style.SUCCESS('تم الانتهاء من إرسال التذكرة اليومية')
        ) 