from django.core.management.base import BaseCommand
from django.utils import timezone

from pets.models import BreedingRequest, Notification
from pets.notifications import notify_breeding_request_pending_reminder


class Command(BaseCommand):
    help = 'إرسال تذكيرات يومية للطلبات المعلقة في قسم التزاوج'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='عرض عدد الطلبات التي سيتم تذكيرها بدون إرسال الإشعارات فعلياً',
        )

    def handle(self, *args, **options):
        now = timezone.now()
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)

        pending_requests = (
            BreedingRequest.objects.filter(status='pending')
            .select_related('receiver', 'requester', 'target_pet', 'requester_pet')
        )

        total = pending_requests.count()
        self.stdout.write(self.style.NOTICE(f'Found {total} pending breeding requests'))

        reminders_sent = 0
        skipped_today = 0

        for request in pending_requests:
            already_notified = Notification.objects.filter(
                related_breeding_request=request,
                type='breeding_request_pending_reminder',
                created_at__gte=start_of_day,
            ).exists()

            if already_notified:
                skipped_today += 1
                continue

            if options['dry_run']:
                reminders_sent += 1
                continue

            notify_breeding_request_pending_reminder(request)
            reminders_sent += 1

        if options['dry_run']:
            self.stdout.write(
                self.style.WARNING(
                    f"[DRY RUN] سيتم إرسال {reminders_sent} تذكيراً، "
                    f"وتم تخطي {skipped_today} تذكيراً تم إرساله اليوم بالفعل"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f'تم إرسال {reminders_sent} تذكيراً، '
                    f'وتم تخطي {skipped_today} طلباً تم تذكيرها اليوم مسبقاً'
                )
            )

