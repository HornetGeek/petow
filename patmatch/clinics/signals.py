"""Signal handlers for clinic invites and data consistency."""
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db.models import Q

from accounts.models import User

from .invite_service import claim_invites_for_user, create_invite_for_patient
from .models import ClinicPatientRecord, ClinicClientRecord, VeterinaryAppointment
from django.utils import timezone


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


@receiver(post_save, sender=VeterinaryAppointment)
def update_last_visit_when_appointment_completed(sender, instance: VeterinaryAppointment, created: bool, update_fields=None, **kwargs):
    """When a clinic appointment is marked completed, update the patient's last_visit.

    Match priority:
      1) Clinic patient with linked_pet == appointment.pet
      2) Clinic patient by owner record (email/phone) and by pet name, else first for that owner
    Only update if newer than current last_visit.
    """
    try:
        if instance.status != 'completed':
            return

        clinic = instance.clinic
        target_date = instance.scheduled_date

        # 1) Prefer an exact linked pet match
        patient = ClinicPatientRecord.objects.filter(
            clinic=clinic,
            linked_pet=instance.pet,
        ).first()

        # 2) Fallback by owner (email/phone) and optionally by name
        if not patient:
            owner_filter = Q()
            owner_email = (instance.owner.email or '').strip()
            owner_phone = (instance.owner.phone or '').strip()
            if owner_email:
                owner_filter |= Q(email__iexact=owner_email)
            if owner_phone:
                owner_filter |= Q(phone=owner_phone)

            owner_record = None
            if owner_filter:
                owner_record = ClinicClientRecord.objects.filter(clinic=clinic).filter(owner_filter).first()

            if owner_record:
                qs = ClinicPatientRecord.objects.filter(clinic=clinic, owner=owner_record)
                patient = qs.filter(name__iexact=instance.pet.name).first() or qs.first()

        if not patient:
            return

        if (patient.last_visit is None) or (patient.last_visit < target_date):
            patient.last_visit = target_date
            patient.save(update_fields=['last_visit', 'updated_at'])
    except Exception:
        # Avoid breaking save flow due to analytics/backfill issues
        pass
