"""
Django management command لإرسال تذكرة يومية للرسائل غير المقروءة
"""
from django.core.management.base import BaseCommand
from django.conf import settings
from django.utils import timezone
from pets.email_notifications import (
    get_daily_unread_reminder_candidates,
    send_daily_unread_messages_reminder,
)
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
        target_date = timezone.localdate()
        self.stdout.write(
            self.style.SUCCESS(f'بدء إرسال التذكرة اليومية في {timezone.now()} (تاريخ الاستهداف: {target_date})')
        )
        
        try:
            if options['dry_run']:
                self.stdout.write(
                    self.style.WARNING('تشغيل تجريبي - لن يتم إرسال إيميلات فعلية')
                )
                dry_run = get_daily_unread_reminder_candidates(target_date=target_date, sample_limit=10)
                self.stdout.write(
                    self.style.WARNING(
                        'Dry-run summary: '
                        f"users_with_unread={dry_run['users_with_unread']}, "
                        f"eligible_count={dry_run['eligible_count']}, "
                        f"skipped_missing_email={dry_run['skipped_missing_email']}, "
                        f"skipped_opt_out={dry_run['skipped_opt_out']}, "
                        f"skipped_deduped={dry_run['skipped_deduped']}"
                    )
                )
                if dry_run['sample_recipients']:
                    self.stdout.write(
                        self.style.WARNING(
                            f"Sample recipients ({len(dry_run['sample_recipients'])}): "
                            f"{', '.join(dry_run['sample_recipients'])}"
                        )
                    )
                else:
                    self.stdout.write(self.style.WARNING('Sample recipients: none'))
            else:
                result = send_daily_unread_messages_reminder(target_date=target_date)
                self.stdout.write(
                    self.style.SUCCESS(
                        'Daily reminder result: '
                        f"users_with_unread={result['users_with_unread']}, "
                        f"attempted={result['attempted']}, sent={result['sent']}, "
                        f"failed={result['failed']}, "
                        f"skipped_missing_email={result['skipped_missing_email']}, "
                        f"skipped_opt_out={result['skipped_opt_out']}, "
                        f"skipped_deduped={result['skipped_deduped'] + result['skipped_deduped_runtime']}, "
                        f"skipped_zero_unread={result['skipped_zero_unread']}"
                    )
                )
                if result.get('failure_reasons'):
                    self.stdout.write(
                        self.style.WARNING(f"Failure reasons: {result['failure_reasons']}")
                    )

                attempted = max(int(result.get('attempted', 0)), 0)
                failed = max(int(result.get('failed', 0)), 0)
                failure_threshold = float(getattr(settings, 'EMAIL_REMINDER_FAILURE_ALERT_THRESHOLD', 0.4))
                if attempted > 0 and (failed / attempted) >= failure_threshold:
                    logger.error(
                        "daily_reminder_failure_alert attempted=%s failed=%s threshold=%.2f target_date=%s",
                        attempted,
                        failed,
                        failure_threshold,
                        target_date.isoformat(),
                    )
                    self.stdout.write(
                        self.style.ERROR(
                            f"ALERT: high failure ratio ({failed}/{attempted}) تجاوز العتبة {failure_threshold:.2f}"
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
