"""Utility helpers for managing clinic invitations."""
import secrets
from typing import Iterable, Optional, List

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



def create_invite_for_patient(
    patient: ClinicPatientRecord,
    *,
    resend: bool = False,
    intended_pet=None,
) -> ClinicInvite:
    """Create (or refresh) an invite for a clinic patient and return it for sharing.

    intended_pet: optional pets.Pet to be prioritized upon acceptance.
    """
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
        if intended_pet and invite.intended_pet_id != getattr(intended_pet, 'id', None):
            invite.intended_pet = intended_pet
            updated_fields.append('intended_pet')
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
            intended_pet=intended_pet if intended_pet else None,
        )

    _trigger_immediate_invite_notifications(
        invite,
        email=email,
        raw_phone=owner.phone,
        normalized_phone=phone,
    )

    return invite


def _trigger_immediate_invite_notifications(
    invite: ClinicInvite,
    *,
    email: Optional[str],
    raw_phone: Optional[str],
    normalized_phone: Optional[str],
) -> None:
    """
    If an existing app user already matches this invite's contact details,
    attach the invite to that user and send the push notification immediately.
    """
    contact_filters: List[Q] = []

    if email:
        contact_filters.append(Q(email__iexact=email))

    phone_query = _build_phone_lookup_query(raw_phone, normalized_phone)
    if phone_query is not None:
        contact_filters.append(phone_query)

    if not contact_filters:
        return

    combined_filter = contact_filters.pop()
    for extra_filter in contact_filters:
        combined_filter |= extra_filter

    matched_users = list(User.objects.filter(combined_filter).distinct())
    if not matched_users:
        return

    for user in matched_users:
        update_fields: list[str] = []
        if invite.recipient_id and invite.recipient_id != user.id:
            continue

        if invite.recipient_id != user.id:
            invite.recipient = user
            update_fields.append('recipient')

        if not invite.claimed_at:
            invite.claimed_at = timezone.now()
            update_fields.append('claimed_at')

        if update_fields:
            update_fields.append('updated_at')
            invite.save(update_fields=update_fields)

        _ensure_invite_notification(invite)

        claim_invites_for_user(user)
        break




def _build_phone_lookup_query(
    raw_phone: Optional[str],
    normalized_phone: Optional[str],
) -> Optional[Q]:
    """Build an OR query that matches likely representations of a phone number."""
    variants: set[str] = set()
    digits_variants: set[str] = set()

    for candidate in (raw_phone, normalized_phone):
        if not candidate:
            continue
        candidate = str(candidate).strip()
        if not candidate:
            continue
        variants.add(candidate)

        digits = ''.join(ch for ch in candidate if ch.isdigit())
        if digits:
            variants.add(digits)
            digits_variants.add(digits)

            stripped = digits.lstrip('0')
            if stripped and stripped != digits:
                digits_variants.add(stripped)

            if len(digits) > 7:
                for length in (10, 9, 8):
                    if len(digits) >= length:
                        tail = digits[-length:]
                        if tail:
                            digits_variants.add(tail)

    if not variants and not digits_variants:
        return None

    phone_query: Optional[Q] = None

    def _or_clause(current: Optional[Q], clause: Q) -> Q:
        return clause if current is None else current | clause

    for value in variants:
        phone_query = _or_clause(phone_query, Q(phone=value))

    for digits in digits_variants:
        if len(digits) >= 7:
            phone_query = _or_clause(phone_query, Q(phone__icontains=digits))
            phone_query = _or_clause(phone_query, Q(phone__endswith=digits))

    return phone_query


def _matched_invites_for_user(user: User) -> Iterable[ClinicInvite]:
    queries = []
    email = _normalize_email(user.email)
    phone = _normalize_phone(user.phone)
    if email:
        queries.append(Q(email__iexact=email))

    phone_query = _build_phone_lookup_query(user.phone, phone)
    if phone_query is not None:
        queries.append(phone_query)

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

        # Delete the notification after the invite is handled
        # This prevents the accept button from reappearing when the app is reopened
        user.notifications.filter(
            type='clinic_invite',
            extra_data__invite_token=str(invite.token)
        ).delete()

        if fields:
            invite.save(update_fields=fields)

    return invite
