"""
إرسال إشعار دفع جماعي يدعو المستخدمين لتحديث التطبيق والاستفادة من ميزة التبني الجديدة.
"""
import logging

from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import User
from accounts.firebase_service import firebase_service
from pets.notifications import create_notification


logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'إرسال إشعار دفع إلى جميع المستخدمين لتحديث التطبيق و تجربة ميزة التبني الجديدة.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='استعراض عدد المستخدمين المستهدفين بدون إنشاء إشعارات أو إرسال تنبيهات.',
        )

    def handle(self, *args, **options):
        if not firebase_service.is_initialized and not options['dry_run']:
            self.stdout.write(self.style.ERROR('خدمة Firebase غير مهيأة - لا يمكن إرسال الإشعارات.'))
            return

        title = "تحديث جديد لتطبيق PetMatch ✨"
        body = "قم بتحديث التطبيق الآن لاكتشاف ميزة التبني الجديدة ومجتمع واسع من الأصدقاء للحيوانات الأليفة! 🐾"
        extra_data = {
            'type': 'app_update',
            'action': 'open_store',
            'feature': 'adoption',
        }

        users = User.objects.filter(fcm_token__isnull=False).exclude(fcm_token='').distinct()
        total = users.count()

        if options['dry_run']:
            self.stdout.write(self.style.WARNING(f'تشغيل تجريبي: {total} مستخدم سيتم استهدافهم.'))
            return

        sent = 0
        failures = 0

        self.stdout.write(self.style.NOTICE(f'بدء إرسال الإشعارات إلى {total} مستخدم...'))

        for user in users.iterator():
            try:
                with transaction.atomic():
                    create_notification(
                        user=user,
                        notification_type='system_message',
                        title=title,
                        message=body,
                        extra_data=extra_data,
                    )

                payload = extra_data.copy()
                payload.update({
                    'title': title,
                    'body': body,
                })

                success = firebase_service.send_notification(
                    fcm_token=user.fcm_token,
                    title=title,
                    body=body,
                    data=payload,
                )

                if success:
                    sent += 1
                else:
                    failures += 1
                    logger.warning("فشل إرسال إشعار التحديث إلى المستخدم %s", user.id)
            except Exception as exc:
                failures += 1
                logger.exception("حدث خطأ أثناء إرسال إشعار التحديث للمستخدم %s: %s", user.id, exc)

        self.stdout.write(self.style.SUCCESS(f'تم إرسال {sent} إشعار بنجاح.'))

        if failures:
            self.stdout.write(self.style.WARNING(f'لم يتم إرسال {failures} إشعار بسبب أخطاء موثقة في السجلات.'))
