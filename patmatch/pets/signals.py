from django.db.models.signals import post_save
from django.dispatch import receiver

from accounts.models import User

from .models import Pet


@receiver(post_save, sender=Pet)
def set_first_pet_created_at(sender, instance: Pet, created: bool, **kwargs):
    """
    Persist the timestamp of the first-ever pet created by a user.
    We only set it once and never overwrite it afterwards.
    """
    if not created or not instance.owner_id:
        return

    User.objects.filter(
        id=instance.owner_id,
        first_pet_created_at__isnull=True,
    ).update(first_pet_created_at=instance.created_at)


from .models import AdoptionRequest, BreedingRequest


@receiver(post_save, sender=AdoptionRequest)
@receiver(post_save, sender=BreedingRequest)
def track_availability_approval(sender, instance, raw=False, **kwargs):
    if raw:
        return
    from .availability import track_approval
    track_approval(instance)


@receiver(post_save, sender=Pet)
def initialize_pet_availability(sender, instance, created, raw=False, **kwargs):
    if not created or raw:
        return
    from datetime import timedelta
    from django.conf import settings
    from django.utils import timezone
    # Creation is not an explicit availability confirmation. Give new pets 30 days.
    from .availability import enabled_for_owner
    due = timezone.now() + timedelta(days=settings.PET_AVAILABILITY_INTERVAL_DAYS) if enabled_for_owner(instance.owner_id) else None
    Pet.objects.filter(pk=instance.pk).update(availability_check_due_at=due)
    instance.availability_check_due_at = due
