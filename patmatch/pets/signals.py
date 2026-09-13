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
