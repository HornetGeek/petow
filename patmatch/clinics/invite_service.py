"""Utility helpers for managing clinic invitations."""
import secrets
from typing import Iterable, Optional

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from accounts.models import User
from pets.notifications import create_notification, _send_push_notification

from .models import ClinicInvite, ClinicPatientRecord


def _generate_token() -> str:
    """Generate a short, URL-safe invite token."""
    # token_urlsafe returns about 1.33 chars per byte. 9 bytes -> 12 chars.
    for _ in range(5):
        token = secrets.token_urlsafe(9)
        if not ClinicInvite.objects.filter(token=token).exists():
            return token
    # Last resort: fall back to 32 hex characters to guarantee uniqueness
    return secrets.token_hex(16)


def _normalize_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = ''.join(ch for ch in phone if ch.isdigit())
    if not digits:
        return None
    if phone.strip().startswith('+'):
        return '+' + digits
    return digits


def _normalize_email(email: Optional[str]) -> Optional[str]:
    if not email:
        return None
    return email.strip().lower() or None


def build_invite_link(token: str) -> str:
    base = getattr(settings, 'MOBILE_APP_INVITE_LINK_BASE', 'https://app.petmatch.com/invite')
    base = base.rstrip('/')
    return f"{base}/{token}"


def build_invite_message(invite: ClinicInvite) -> str:
    link = build_invite_link(invite.token)
    download_url = getattr(settings, 'MOBILE_APP_DOWNLOAD_URL', link)
    owner_name = invite.owner_record.full_name or 'صاحب الحيوان'
    pet_name = invite.patient.name or 'حيوانك'
    clinic_name = invite.clinic.name or 'عيادتك'
    lines = [
        f"مرحباً {owner_name}،",
        f"عيادة {clinic_name} أضافت حيوانك {pet_name} إلى منصة PetMatch.",
        f"حمّل التطبيق من: {download_url}",
        f"ثم استخدم رابط الدعوة الخاص بك لإكمال التسجيل: {link}",
    ]
    return '\n'.join(lines)



def create_invite_for_patient(patient: ClinicPatientRecord, *, resend: bool = False) -> ClinicInvite:
    """Create (or refresh) an invite for a clinic patient and return it for sharing."""
    owner = patient.owner
    clinic = patient.clinic
    phone = _normalize_phone(owner.phone)
    email = _normalize_email(owner.email)

    invite = (
        patient.invites.filter(status=ClinicInvite.STATUS_PENDING).order_by('-created_at').first()
    )
    if invite:
        updated_fields = []
        if phone and invite.phone != phone:
            invite.phone = phone
            updated_fields.append('phone')
        if email and invite.email != email:
            invite.email = email
            updated_fields.append('email')
        if updated_fields:
            updated_fields.append('updated_at')
            invite.save(update_fields=updated_fields)
    else:
        invite = ClinicInvite.objects.create(
            clinic=clinic,
            patient=patient,
            owner_record=owner,
            token=_generate_token(),
            phone=phone,
            email=email,
        )

    return invite


def _matched_invites_for_user(user: User) -> Iterable[ClinicInvite]:
    queries = []
    email = _normalize_email(user.email)
    phone = _normalize_phone(user.phone)
    if email:
        queries.append(Q(email=email))
    if phone:
        queries.append(Q(phone=phone))
    if not queries:
        return ClinicInvite.objects.none()

    combined_query = queries.pop()
    for q in queries:
        combined_query |= q

    return ClinicInvite.objects.filter(
        status=ClinicInvite.STATUS_PENDING
    ).filter(combined_query)


def _ensure_invite_notification(invite: ClinicInvite) -> None:
    user = invite.recipient
    if not user:
        return

    existing = user.notifications.filter(
        type='clinic_invite',
        extra_data__invite_token=str(invite.token)
    ).first()
    if existing:
        return

    title = f"دعوة من عيادة {invite.clinic.name}"
    message = (
        f"أضافت عيادة {invite.clinic.name} حيوانك {invite.patient.name} إلى سجلها. "
        "اضغط للموافقة وربط حيوانك بحسابك."
    )
    extra = {
        'invite_token': str(invite.token),
        'clinic_id': str(invite.clinic_id),
        'clinic_name': invite.clinic.name,
        'patient_id': str(invite.patient_id),
        'patient_name': invite.patient.name,
    }
    notification = create_notification(
        user=user,
        notification_type='clinic_invite',
        title=title,
        message=message,
        extra_data=extra,
    )
    _send_push_notification(user, title, message, {
        'type': 'clinic_invite',
        **extra,
    })
    return None


def claim_invites_for_user(user: User) -> None:
    invites = list(_matched_invites_for_user(user))
    if not invites:
        return

    now = timezone.now()
    with transaction.atomic():
        for invite in invites:
            to_update = []
            if invite.recipient_id != user.id:
                invite.recipient = user
                to_update.append('recipient')
            if not invite.claimed_at:
                invite.claimed_at = now
                to_update.append('claimed_at')
            if to_update:
                to_update.append('updated_at')
                invite.save(update_fields=to_update)
            _ensure_invite_notification(invite)


def respond_to_invite(invite: ClinicInvite, *, user: User, accept: bool) -> ClinicInvite:
    """Accept or decline a clinic invite on behalf of a user."""
    if invite.status != ClinicInvite.STATUS_PENDING:
        return invite

    with transaction.atomic():
        fields = []
        if invite.recipient_id != user.id:
            invite.recipient = user
            fields.append('recipient')
        if not invite.claimed_at:
            invite.claimed_at = timezone.now()
            fields.append('claimed_at')

        if accept:
            invite.mark_accepted(user=user)
            invite.patient.refresh_from_db(fields=['linked_user', 'updated_at'])
        else:
            invite.mark_declined(user=user)

        _ensure_invite_notification(invite)

        if fields:
            invite.save(update_fields=fields)

    return invite
