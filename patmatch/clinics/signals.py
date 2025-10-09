"""Signal handlers for clinic invites."""
from django.db.models.signals import post_save
from django.dispatch import receiver

from accounts.models import User

from .invite_service import claim_invites_for_user, create_invite_for_patient
from .models import ClinicPatientRecord


@receiver(post_save, sender=ClinicPatientRecord)
def create_invite_when_patient_added(sender, instance: ClinicPatientRecord, created: bool, **kwargs):
    """Automatically create an invite when a clinic registers a new pet."""
    if created:
        create_invite_for_patient(instance)


@receiver(post_save, sender=User)
def claim_invites_when_user_updates(sender, instance: User, created: bool, update_fields=None, **kwargs):
    """Attach pending clinic invites to the user when they register or update contact info."""
    if created:
        claim_invites_for_user(instance)
        return

    if update_fields is None:
        # Full save without explicit fields – conservatively attempt to claim.
        claim_invites_for_user(instance)
        return

    tracked_fields = {'email', 'phone'}
    if tracked_fields.intersection(update_fields):
        claim_invites_for_user(instance)
