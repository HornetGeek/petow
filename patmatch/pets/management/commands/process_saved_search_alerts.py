from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import IntegrityError
from django.utils import timezone

from pets.models import Notification, SavedSearch, SavedSearchMatch
from pets.notifications import create_notification_once, deliver_outbox_notification_push
from pets.push_targets import attach_push_targets
from pets.saved_searches import get_saved_search_queryset, recent_saved_search_cutoff


class Command(BaseCommand):
    help = "Evaluate active saved searches and send deduped smart alerts."

    def add_arguments(self, parser):
        parser.add_argument("--limit-searches", type=int, default=500)
        parser.add_argument("--limit-matches", type=int, default=5)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        limit_searches = max(1, int(options["limit_searches"]))
        limit_matches = max(1, int(options["limit_matches"]))
        dry_run = bool(options["dry_run"])
        now = timezone.now()
        day_ago = now - timedelta(hours=24)
        search_cooldown_cutoff = now - timedelta(hours=12)

        searches = (
            SavedSearch.objects
            .filter(is_active=True, alerts_enabled=True)
            .select_related("user")
            .order_by("last_checked_at", "id")[:limit_searches]
        )

        evaluated = 0
        created_matches = 0
        notifications_sent = 0

        for saved_search in searches:
            evaluated += 1
            since = recent_saved_search_cutoff(saved_search)
            queryset = get_saved_search_queryset(saved_search, user=saved_search.user, since=since)
            matches = list(queryset[:limit_matches])

            if not dry_run:
                saved_search.last_checked_at = now
                saved_search.save(update_fields=["last_checked_at", "updated_at"])

            for target in matches:
                target_id = getattr(target, "id", None)
                if not target_id:
                    continue
                try:
                    match, created = SavedSearchMatch.objects.get_or_create(
                        saved_search=saved_search,
                        target_type=saved_search.target_type,
                        target_id=target_id,
                        defaults={"metadata": {"source": "smart_alert"}},
                    )
                except IntegrityError:
                    match = SavedSearchMatch.objects.filter(
                        saved_search=saved_search,
                        target_type=saved_search.target_type,
                        target_id=target_id,
                    ).first()
                    created = False

                if created:
                    created_matches += 1
                if not match or match.notified_at:
                    continue

                if saved_search.last_notified_at and saved_search.last_notified_at > search_cooldown_cutoff:
                    continue

                user_sent_today = Notification.objects.filter(
                    user=saved_search.user,
                    type="saved_search_match",
                    created_at__gte=day_ago,
                ).count()
                if user_sent_today >= 3:
                    continue

                title = "وصلت نتائج جديدة تناسب بحثك"
                target_name = getattr(target, "name", saved_search.name)
                message = f"{target_name} ضمن بحثك: {saved_search.name}"
                pet = target if saved_search.target_type != SavedSearch.TARGET_SERVICE else None
                extra_data = {
                    "saved_search_id": saved_search.id,
                    "target_type": saved_search.target_type,
                    "target_id": target_id,
                    "campaign_key": "saved_search_match",
                }
                if pet:
                    extra_data["pet_id"] = pet.id

                if dry_run:
                    notifications_sent += 1
                    continue

                notification, created_notification = create_notification_once(
                    user=saved_search.user,
                    notification_type="saved_search_match",
                    title=title,
                    message=message,
                    related_pet=pet,
                    extra_data=extra_data,
                    event_key=f"saved_search_match:{saved_search.id}:{saved_search.target_type}:{target_id}",
                )
                if created_notification:
                    push_payload = attach_push_targets(
                        {
                            "type": "saved_search_match",
                            "saved_search_id": str(saved_search.id),
                            "target_type": saved_search.target_type,
                            "target_id": str(target_id),
                            **({"pet_id": str(pet.id)} if pet else {}),
                        },
                        "saved_search_match",
                    )
                    deliver_outbox_notification_push(
                        notification,
                        title=title,
                        message=message,
                        push_payload=push_payload,
                        push_type="saved_search_match",
                    )
                    notifications_sent += 1

                match.notified_at = now
                match.save(update_fields=["notified_at"])
                saved_search.last_notified_at = now
                saved_search.save(update_fields=["last_notified_at", "updated_at"])
                break

        self.stdout.write(
            self.style.SUCCESS(
                f"saved_search_alerts evaluated={evaluated} matches_created={created_matches} notifications={notifications_sent} dry_run={dry_run}"
            )
        )
