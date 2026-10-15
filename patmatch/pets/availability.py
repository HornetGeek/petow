"""Owner-confirmed listing freshness; never infer availability from activity."""
from datetime import timedelta
import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import Pet, PetAvailabilityFollowUp, AdoptionRequest, Notification, NotificationOutbox

logger = logging.getLogger(__name__)
AVAILABLE = {'available', 'available_for_adoption'}
CHECKABLE = AVAILABLE | {'adoption_pending'}


def days(name):
    return timedelta(days=getattr(settings, 'PET_AVAILABILITY_' + name))


def enabled_for_owner(owner_id):
    return (settings.PET_AVAILABILITY_ENABLED and
            int(owner_id) % 100 < max(0, min(100, settings.PET_AVAILABILITY_ROLLOUT_PERCENT)))


def track_approval(request):
    kind = 'adoption' if isinstance(request, AdoptionRequest) else 'breeding'
    pet_ids = [request.pet_id] if kind == 'adoption' else [request.target_pet_id, request.requester_pet_id]
    if request.status != 'approved':
        PetAvailabilityFollowUp.objects.filter(request_kind=kind, request_id=request.pk,
                                               resolved_at__isnull=True).update(resolved_at=timezone.now())
        return
    # Unique rows preserve the first approval timestamp across retries and later edits.
    for pet in Pet.objects.filter(pk__in=pet_ids):
        if enabled_for_owner(pet.owner_id):
            PetAvailabilityFollowUp.objects.get_or_create(
                pet=pet, request_kind=kind, request_id=request.pk,
                defaults={'approved_at': getattr(request, 'approved_at', None) or timezone.now()})


def open_followups(pet):
    return pet.availability_followups.filter(resolved_at__isnull=True).order_by('approved_at', 'id')


def record_response(pet, now=None):
    """Called while holding the pet lock, after an explicit answer/status change."""
    now = now or timezone.now()
    pet.availability_confirmed_at = now if pet.status in AVAILABLE else None
    pet.availability_check_due_at = now + days('INTERVAL_DAYS') if pet.status in CHECKABLE else None
    pet.availability_prompt_after = None
    if pet.status in AVAILABLE:
        pet.discovery_paused_at = None
    pet.save(update_fields=['availability_confirmed_at', 'availability_check_due_at',
                            'availability_prompt_after', 'discovery_paused_at', 'updated_at'])
    open_followups(pet).update(resolved_at=now)
    Notification.objects.filter(user_id=pet.owner_id, related_pet=pet,
                                type='pet_availability_check', is_read=False).update(is_read=True)
    logger.info('pet_availability_response pet=%s status=%s', pet.pk, pet.status)


def check_data(pet, now=None):
    now = now or timezone.now()
    followups = list(open_followups(pet))
    due_followups = [f for f in followups if f.approved_at + days('APPROVAL_DAYS') <= now]
    fresh_due = bool(pet.availability_check_due_at and pet.availability_check_due_at <= now)
    due = pet.status in CHECKABLE and (fresh_due or bool(due_followups) or bool(pet.discovery_paused_at))
    requests = []
    if pet.status in {'adoption_pending', 'available_for_adoption'}:
        requests = list(AdoptionRequest.objects.filter(pet=pet, status='approved')
                        .order_by('id').values('id', 'adopter_name'))
    return {
        'pet_id': pet.pk, 'pet_name': pet.name, 'status': pet.status,
        'expected_status': pet.status, 'due': due,
        'reason': 'approval' if due_followups else 'freshness',
        'pause_at': (pet.availability_check_due_at + days('GRACE_DAYS')).isoformat()
                    if pet.availability_check_due_at and settings.PET_AVAILABILITY_AUTO_PAUSE else None,
        'discovery_paused_at': pet.discovery_paused_at,
        'approved_adoption_requests': requests,
    }


def respond(pet, data):
    action = data.get('action')
    now = timezone.now()
    if data.get('expected_status') != pet.status:
        raise ValidationError({'code': 'availability_changed', 'error': 'Pet status changed. Please refresh.'})
    if action == 'later':
        pet.availability_prompt_after = now + timedelta(hours=24)
        pet.save(update_fields=['availability_prompt_after'])
        return
    if action == 'confirm':
        if pet.status not in AVAILABLE:
            raise ValidationError('Choose an available status to restore this listing.')
    elif action == 'arranging':
        if pet.status != 'adoption_pending':
            raise ValidationError('This pet has no adoption in progress.')
    elif action == 'complete':
        req = AdoptionRequest.objects.select_for_update().filter(
            pk=data.get('request_id'), pet=pet, status='approved').first()
        if not req or pet.status not in {'adoption_pending', 'available_for_adoption'}:
            raise ValidationError('Select an approved adoption request for this pet.')
        # Reuse the canonical request completion operation; ownership checked by the view.
        req.pet = pet
        req.complete()
    elif action == 'status':
        status = data.get('status')
        # Adoption completion must use an approved request when one exists.
        allowed = {'available', 'mating', 'pregnant', 'unavailable', 'available_for_adoption', 'adopted'}
        if status not in allowed:
            raise ValidationError('Unsupported status.')
        if status == 'adopted':
            if pet.status != 'available_for_adoption' or AdoptionRequest.objects.filter(pet=pet, status='approved').exists():
                raise ValidationError('Complete the approved adoption request instead.')
            AdoptionRequest.objects.filter(pet=pet, status='pending').update(status='rejected')
        pet.status = status
        # Save only the status, never an old copy of the pet's other editable fields.
        pet.save(update_fields=['status', 'updated_at'])
    else:
        raise ValidationError('Unsupported availability action.')
    record_response(pet, now)


def run_checks(now=None):
    """Hourly worker. Each pet lock serializes expiry, confirmations, and new requests."""
    now = now or timezone.now()
    counts = {'checked': 0, 'paused': 0, 'notifications': 0}
    if not settings.PET_AVAILABILITY_ENABLED:
        return counts
    for pk, owner_id in Pet.objects.filter(status__in=CHECKABLE).values_list('pk', 'owner_id').iterator():
        if not enabled_for_owner(owner_id):
            continue
        with transaction.atomic():
            pet = Pet.objects.select_for_update().filter(pk=pk).first()
            if not pet or pet.status not in CHECKABLE:
                continue
            counts['checked'] += 1
            if pet.availability_check_due_at is None:
                # Existing inventory starts its grace period at rollout, never at upload time.
                pet.availability_check_due_at = now
                pet.save(update_fields=['availability_check_due_at'])
            due_at = pet.availability_check_due_at
            if pet.discovery_paused_at:
                continue
            if now >= due_at + days('GRACE_DAYS') and settings.PET_AVAILABILITY_AUTO_PAUSE:
                # A late rollout toggle or worker outage must not hide inventory
                # before owners have received a final in-app warning and grace.
                final_key = f'pet_availability:{pet.pk}:freshness:{due_at.isoformat()}:final'
                warned = Notification.objects.filter(
                    user_id=pet.owner_id, event_key=final_key,
                    created_at__lte=now - (days('GRACE_DAYS') - days('REMINDER_DAYS')),
                ).exclude(extra_data__notice_en='').exists()
                if warned:
                    pet.discovery_paused_at = now
                    pet.save(update_fields=['discovery_paused_at'])
                    counts['paused'] += 1
                    logger.info('pet_availability_paused pet=%s', pet.pk)
                    continue
                pet.availability_check_due_at = due_at = now
                pet.save(update_fields=['availability_check_due_at'])
            # One notification per pet per sweep, with freshness taking precedence.
            cycle = None
            if now >= due_at:
                stage = 'final' if now >= due_at + days('REMINDER_DAYS') else 'first'
                cycle = f'freshness:{due_at.isoformat()}:{stage}'
            else:
                for followup in open_followups(pet):
                    if now >= followup.approved_at + days('APPROVAL_DAYS'):
                        stage = 'final' if now >= followup.approved_at + days('APPROVAL_REMINDER_DAYS') else 'first'
                        cycle = f'approval:{followup.pk}:{stage}'
                        break
            if cycle:
                counts['notifications'] += int(queue_check(pet, cycle, now))
    logger.info('pet_availability_sweep %s', counts)
    return counts


def queue_check(pet, cycle, now):
    from .notifications import create_notification_once
    from .notification_events import enqueue_notification_event
    from .notification_templates import render_notification
    # Suppress multiple approvals for the same pet on the same day, even across worker runs.
    recent = Notification.objects.filter(user_id=pet.owner_id, related_pet=pet,
        type='pet_availability_check', created_at__gt=now - timedelta(hours=24)).exists()
    key = f'pet_availability:{pet.pk}:{cycle}'
    if recent and not Notification.objects.filter(user_id=pet.owner_id, event_key=key).exists():
        return False
    pause_at = pet.availability_check_due_at + days('GRACE_DAYS')
    notice_en = notice_ar = ''
    if settings.PET_AVAILABILITY_AUTO_PAUSE:
        notice_en = f'Without confirmation, this listing will be paused on {pause_at:%Y-%m-%d}.'
        notice_ar = f'سيتم إيقاف ظهور الإعلان مؤقتاً يوم {pause_at:%Y-%m-%d} إذا لم تؤكد الحالة.'
    context = {'pet_id': pet.pk, 'pet_name': pet.name, 'notice_en': notice_en, 'notice_ar': notice_ar,
               'deep_link': f'petow://pet-availability?pet_id={pet.pk}', 'cycle': cycle,
               'check_due_at': pet.availability_check_due_at.isoformat()}
    title, message = render_notification('pet_availability_check', context,
                                         getattr(pet.owner, 'preferred_language', 'ar'), '', '')
    notification, created = create_notification_once(user=pet.owner, notification_type='pet_availability_check',
        title=title, message=message, related_pet=pet, extra_data=context, event_key=key)
    if created:
        enqueue_notification_event(NotificationOutbox.EVENT_PET_AVAILABILITY_PUSH, notification.pk, key,
                                   payload=context)
    return created


def deliver_check_push(notification_id, payload):
    from .notifications import deliver_outbox_notification_push, _should_deliver_push
    notification = Notification.objects.select_related('user', 'related_pet').filter(pk=notification_id).first()
    if not notification or notification.is_read or notification.delivery_attempts.filter(status='sent').exists():
        return
    pet = notification.related_pet
    if not pet or not enabled_for_owner(pet.owner_id) or pet.discovery_paused_at or pet.status not in CHECKABLE:
        return
    if not pet.availability_check_due_at or pet.availability_check_due_at.isoformat() != payload.get('check_due_at'):
        return
    cycle = payload.get('cycle', '')
    if cycle.startswith('approval:') and not open_followups(pet).filter(pk=cycle.split(':')[1]).exists():
        return
    allowed, reason, _ = _should_deliver_push(notification.user, 'pet_availability_check')
    if not allowed and reason in {'quiet_hours_active', 'max_push_per_day_exceeded', 'min_interval_not_elapsed'}:
        from .notification_events import NotificationEventDeferred
        raise NotificationEventDeferred('Availability push deferred: ' + reason)
    delivered = deliver_outbox_notification_push(notification, push_payload=payload,
                                                 push_type='pet_availability_check')
    latest_attempt = notification.delivery_attempts.order_by('-created_at', '-id').first()
    if not delivered and latest_attempt and latest_attempt.status == 'failed':
        raise RuntimeError('Availability push delivery failed')
