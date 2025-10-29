"""
Command to auto-manage pending breeding/adoption requests:
- Send daily reminders while pending
- Auto-reject on 3rd reminder
- Auto-reject after 7 days pending
- After 3 auto-rejects due to inactivity for the same pet, set the pet unavailable

Usage:
  python manage.py auto_manage_requests [--dry-run]
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db.models import Q

from pets.models import BreedingRequest, AdoptionRequest, Notification, Pet
from pets.notifications import (
    notify_breeding_request_pending_reminder,
    notify_adoption_request_pending_reminder,
    notify_breeding_request_rejected,
    send_system_message,
)


DAYS_TO_AUTO_REJECT = 7
MAX_REMINDERS_BEFORE_REJECT = 3  # reject on 3rd attempt
AUTO_REJECTS_BEFORE_PET_UNAVAILABLE = 3


class Command(BaseCommand):
    help = (
        "Auto-manage pending breeding/adoption requests: daily reminders, "
        "auto-reject after 7 days or on 3rd reminder, and mark pet unavailable after 3 auto-rejects."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would happen without changing data",
        )

    def handle(self, *args, **options):
        dry_run = options.get("dry_run", False)

        now = timezone.now()
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        cutoff = now - timezone.timedelta(days=DAYS_TO_AUTO_REJECT)

        summary = {
            "breeding": {"reminders": 0, "auto_rejects": 0},
            "adoption": {"reminders": 0, "auto_rejects": 0},
            "pets_unavailable": 0,
        }

        # ---- Breeding requests ----
        breeding_qs = BreedingRequest.objects.filter(status="pending").select_related(
            "receiver", "requester", "target_pet", "requester_pet"
        )

        for br in breeding_qs:
            # If older than cutoff -> auto reject
            if br.created_at <= cutoff:
                if not dry_run:
                    br.status = "rejected"
                    # mark reason for counting strikes later
                    br.response_message = (br.response_message or "")
                    marker = "auto_rejected_due_to_inactivity"
                    if marker not in (br.response_message or ""):
                        br.response_message = f"{(br.response_message or '').strip()} {marker}".strip()
                    br.save(update_fields=["status", "response_message", "updated_at"])
                    # Use existing reject push type
                    try:
                        notify_breeding_request_rejected(br)
                    except Exception:
                        pass
                summary["breeding"]["auto_rejects"] += 1
                continue

            # Count total reminders for this request
            total_reminders = Notification.objects.filter(
                type="breeding_request_pending_reminder",
                related_breeding_request=br,
            ).count()
            reminded_today = Notification.objects.filter(
                type="breeding_request_pending_reminder",
                related_breeding_request=br,
                created_at__gte=start_of_day,
            ).exists()

            # On 3rd reminder, auto-reject instead of sending another reminder
            if total_reminders >= (MAX_REMINDERS_BEFORE_REJECT - 1) and not reminded_today:
                if not dry_run:
                    br.status = "rejected"
                    br.response_message = (br.response_message or "")
                    marker = "auto_rejected_due_to_inactivity"
                    if marker not in (br.response_message or ""):
                        br.response_message = f"{(br.response_message or '').strip()} {marker}".strip()
                    br.save(update_fields=["status", "response_message", "updated_at"])
                    try:
                        notify_breeding_request_rejected(br)
                    except Exception:
                        pass
                summary["breeding"]["auto_rejects"] += 1
            else:
                # Send daily reminder if not already today
                if not reminded_today:
                    if not dry_run:
                        try:
                            notify_breeding_request_pending_reminder(br)
                        except Exception:
                            pass
                    summary["breeding"]["reminders"] += 1

        # ---- Adoption requests ----
        adoption_qs = AdoptionRequest.objects.filter(status="pending").select_related(
            "adopter", "pet", "pet__owner"
        )

        for ar in adoption_qs:
            if ar.created_at <= cutoff:
                if not dry_run:
                    ar.status = "rejected"
                    # tag reason in admin_notes
                    marker = "auto_rejected_due_to_inactivity"
                    base = (ar.admin_notes or "").strip()
                    ar.admin_notes = f"{base} {marker}".strip() if marker not in base else base
                    ar.save(update_fields=["status", "admin_notes", "updated_at"])
                    # No dedicated adoption reject push type; inform adopter via system message
                    try:
                        send_system_message(
                            ar.adopter,
                            title=f"تم رفض طلب تبنّي {ar.pet.name}",
                            message="تم رفض الطلب تلقائياً بعد 7 أيام من عدم الرد.",
                            extra_data={"adoption_request_id": ar.id, "pet_id": ar.pet.id},
                        )
                    except Exception:
                        pass
                summary["adoption"]["auto_rejects"] += 1
                continue

            total_reminders = Notification.objects.filter(
                type="adoption_request_pending_reminder",
                extra_data__adoption_request_id=ar.id,
            ).count()
            reminded_today = Notification.objects.filter(
                type="adoption_request_pending_reminder",
                extra_data__adoption_request_id=ar.id,
                created_at__gte=start_of_day,
            ).exists()

            if total_reminders >= (MAX_REMINDERS_BEFORE_REJECT - 1) and not reminded_today:
                if not dry_run:
                    ar.status = "rejected"
                    marker = "auto_rejected_due_to_inactivity"
                    base = (ar.admin_notes or "").strip()
                    ar.admin_notes = f"{base} {marker}".strip() if marker not in base else base
                    ar.save(update_fields=["status", "admin_notes", "updated_at"])
                    try:
                        send_system_message(
                            ar.adopter,
                            title=f"تم رفض طلب تبنّي {ar.pet.name}",
                            message="تم رفض الطلب تلقائياً بعد 3 تذكيرات بدون رد.",
                            extra_data={"adoption_request_id": ar.id, "pet_id": ar.pet.id},
                        )
                    except Exception:
                        pass
                summary["adoption"]["auto_rejects"] += 1
            else:
                if not reminded_today:
                    if not dry_run:
                        try:
                            notify_adoption_request_pending_reminder(ar)
                        except Exception:
                            pass
                    summary["adoption"]["reminders"] += 1

        # ---- Mark pets unavailable on 3 strikes ----
        # Pets that had >= 3 auto-rejects (breeding/adoption) due to inactivity
        pets_to_check = set(
            list(
                BreedingRequest.objects.filter(
                    status="rejected",
                    response_message__icontains="auto_rejected_due_to_inactivity",
                ).values_list("target_pet_id", flat=True)
            )
            + list(
                AdoptionRequest.objects.filter(
                    status="rejected",
                    admin_notes__icontains="auto_rejected_due_to_inactivity",
                ).values_list("pet_id", flat=True)
            )
        )

        changed_pets = 0
        for pet_id in pets_to_check:
            try:
                pet = Pet.objects.get(id=pet_id)
            except Pet.DoesNotExist:
                continue

            breeding_rejects = BreedingRequest.objects.filter(
                target_pet=pet,
                status="rejected",
                response_message__icontains="auto_rejected_due_to_inactivity",
            ).count()
            adoption_rejects = AdoptionRequest.objects.filter(
                pet=pet,
                status="rejected",
                admin_notes__icontains="auto_rejected_due_to_inactivity",
            ).count()
            total_strikes = breeding_rejects + adoption_rejects

            if total_strikes >= AUTO_REJECTS_BEFORE_PET_UNAVAILABLE and pet.status != "unavailable":
                if not dry_run:
                    pet.status = "unavailable"
                    pet.save(update_fields=["status", "updated_at"]) if hasattr(pet, "updated_at") else pet.save(update_fields=["status"])  # tolerate missing field
                    try:
                        send_system_message(
                            pet.owner,
                            title=f"تم إيقاف {pet.name}",
                            message=(
                                "تم تعيين حالة الحيوان غير متاح تلقائياً بعد 3 رفضات تلقائية"
                            ),
                            extra_data={"pet_id": pet.id, "strikes": total_strikes},
                        )
                    except Exception:
                        pass
                changed_pets += 1

        summary["pets_unavailable"] = changed_pets

        # ---- Summary output ----
        self.stdout.write(
            self.style.SUCCESS(
                "Auto-manage completed: "
                f"breeding reminders={summary['breeding']['reminders']}, "
                f"breeding auto_rejects={summary['breeding']['auto_rejects']}, "
                f"adoption reminders={summary['adoption']['reminders']}, "
                f"adoption auto_rejects={summary['adoption']['auto_rejects']}, "
                f"pets_marked_unavailable={summary['pets_unavailable']}"
            )
        )

