"""
إرسال إشعار اعتذار جماعي بعد حدوث مشكلة في النظام.
"""
import json
import logging

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import User
from accounts.firebase_service import firebase_service
from pets.notifications import create_notification

logger = logging.getLogger(__name__)

DEFAULT_TITLE = "نعتذر عن الانقطاع المفاجئ"
DEFAULT_MESSAGE = (
    "واجهنا مشكلة تقنية خلال الساعات الماضية لكن تم حلها الآن. "
    "نقدّر صبرك وتفهّمك، وإذا صادفت أي مشكلة إضافية من فضلك راسل فريق الدعم."
)


class Command(BaseCommand):
    help = "إرسال إشعار اعتذار بخصوص مشكلة تقنية تم حلّها إلى جميع المستخدمين."

    def add_arguments(self, parser):
        parser.add_argument(
            "--title",
            default=DEFAULT_TITLE,
            help="عنوان الإشعار (القيمة الافتراضية تناسب رسائل الاعتذار).",
        )
        parser.add_argument(
            "--message",
            default=DEFAULT_MESSAGE,
            help="محتوى الإشعار. استخدم الاقتباسات عند تمرير نص يحتوي على مسافات.",
        )
        parser.add_argument(
            "--extra-data",
            dest="extra_data",
            default="",
            help="JSON مخصّص يُدمج مع بيانات الإشعار الإضافية (اختياري).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="استعراض عدد المستخدمين المستهدفين بدون إنشاء إشعارات أو إرسال تنبيهات.",
        )

    def handle(self, *args, **options):
        title = options["title"]
        message = options["message"]
        dry_run = options["dry_run"]

        extra_data = {
            "type": "system_issue_apology",
            "category": "incident_update",
            "status": "resolved",
        }

        if options["extra_data"]:
            try:
                custom_extra = json.loads(options["extra_data"])
            except json.JSONDecodeError as exc:
                raise CommandError(f"Invalid JSON passed to --extra-data: {exc}") from exc
            else:
                if not isinstance(custom_extra, dict):
                    raise CommandError("--extra-data must be a JSON object.")
                extra_data.update(custom_extra)

        users = User.objects.all().order_by("id")
        total_users = users.count()

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"تشغيل تجريبي: سيتم إنشاء إشعار اعتذار لـ {total_users} مستخدم."
                )
            )
            return

        firebase_ready = firebase_service.is_initialized
        if not firebase_ready:
            self.stdout.write(
                self.style.WARNING(
                    "خدمة Firebase غير مهيأة حالياً؛ سيتم إنشاء الإشعارات بدون إرسال تنبيهات دفع."
                )
            )

        created_notifications = 0
        push_sent = 0
        push_failed = 0
        skipped_push = 0

        self.stdout.write(
            self.style.NOTICE(
                f"بدء إرسال إشعار الاعتذار إلى {total_users} مستخدم..."
            )
        )

        for user in users.iterator():
            try:
                with transaction.atomic():
                    create_notification(
                        user=user,
                        notification_type="system_message",
                        title=title,
                        message=message,
                        extra_data=extra_data,
                    )
                    created_notifications += 1
            except Exception as exc:
                logger.exception("تعذّر إنشاء إشعار للمستخدم %s: %s", user.id, exc)
                continue

            if not firebase_ready or not user.fcm_token:
                skipped_push += 1
                continue

            payload = extra_data.copy()
            payload.update({"title": title, "body": message})

            try:
                success = firebase_service.send_notification(
                    fcm_token=user.fcm_token,
                    title=title,
                    body=message,
                    data=payload,
                )
            except Exception as exc:
                push_failed += 1
                logger.exception(
                    "حدث خطأ أثناء إرسال إشعار الاعتذار للمستخدم %s: %s",
                    user.id,
                    exc,
                )
                continue

            if success:
                push_sent += 1
            else:
                push_failed += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"تم إنشاء {created_notifications} إشعار اعتذار في قاعدة البيانات."
            )
        )
        self.stdout.write(
            f"تم إرسال {push_sent} تنبيه دفع، فشل {push_failed}, وتخطّي {skipped_push} بسبب عدم توفر FCM token أو خدمة Firebase."
        )
