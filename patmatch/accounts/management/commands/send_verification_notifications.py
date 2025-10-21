from django.core.management.base import BaseCommand, CommandError

from accounts.models import AccountVerification


class Command(BaseCommand):
    help = "Send email and push notifications for approved account verifications."

    def add_arguments(self, parser):
        parser.add_argument(
            "--verification-id",
            type=int,
            dest="verification_id",
            help="ID of a specific AccountVerification to notify.",
        )
        parser.add_argument(
            "--user-id",
            type=int,
            dest="user_id",
            help="Send notifications for the latest approved verification of this user.",
        )
        parser.add_argument(
            "--all",
            action="store_true",
            dest="send_all",
            help="Send notifications for every approved verification.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            dest="dry_run",
            help="List which verifications would be notified without sending anything.",
        )

    def handle(self, *args, **options):
        verification_id = options.get("verification_id")
        user_id = options.get("user_id")
        send_all = options.get("send_all")
        dry_run = options.get("dry_run")

        selection_count = sum(
            bool(choice) for choice in (verification_id, user_id, send_all)
        )
        if selection_count != 1:
            raise CommandError(
                "You must specify exactly one target: "
                "--verification-id, --user-id, or --all."
            )

        if verification_id:
            try:
                queryset = [AccountVerification.objects.get(pk=verification_id)]
            except AccountVerification.DoesNotExist as exc:
                raise CommandError(f"AccountVerification {verification_id} not found.") from exc
        elif user_id:
            verification = (
                AccountVerification.objects.filter(user_id=user_id)
                .order_by("-created_at")
                .first()
            )
            if not verification:
                raise CommandError(
                    f"No account verification requests found for user {user_id}."
                )
            queryset = [verification]
        else:  # send_all
            queryset = (
                AccountVerification.objects.filter(status="approved")
                .order_by("user_id", "-created_at")
                .iterator()
            )

        total = 0
        processed = 0
        for verification in queryset:
            total += 1
            if verification.status != "approved":
                self.stdout.write(
                    self.style.WARNING(
                        f"Skipping verification {verification.id} for user {verification.user_id}: status={verification.status}"
                    )
                )
                continue

            message = (
                f"{'(dry-run) ' if dry_run else ''}"
                f"Sending notifications for verification {verification.id} (user {verification.user_id})."
            )
            self.stdout.write(message)

            if dry_run:
                continue

            try:
                verification.send_approval_notifications()
                processed += 1
            except Exception as exc:
                self.stderr.write(
                    self.style.ERROR(
                        f"Failed to send notifications for verification {verification.id}: {exc}"
                    )
                )

        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(f"Dry run complete. {total} verifications inspected.")
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Notifications dispatched for {processed} approved verifications."
                )
            )
