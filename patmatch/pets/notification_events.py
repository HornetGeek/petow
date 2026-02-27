import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import AdoptionRequest, BreedingRequest, NotificationOutbox, Pet
from .notifications import (
    notify_adoption_request_approved,
    notify_adoption_request_received,
    notify_breeding_request_approved,
    notify_breeding_request_received,
    notify_breeding_request_rejected,
    notify_new_adoption_pet,
    notify_new_pet_added,
)

logger = logging.getLogger(__name__)


class NotificationEventPermanentError(Exception):
    """Raised when an outbox event cannot be processed and should not be retried."""


def _process_pet_created(object_id, payload):
    try:
        pet = Pet.objects.get(id=object_id)
    except Pet.DoesNotExist as exc:
        raise NotificationEventPermanentError(f"Pet {object_id} not found") from exc

    if pet.status == 'available_for_adoption':
        notify_new_adoption_pet(
            pet,
            radius_km=payload.get('radius_km', 10),
            event_key_prefix=f"adoption_pet_nearby:{pet.id}",
        )
        return

    notify_new_pet_added(
        pet,
        radius_km=payload.get('radius_km', 30),
        event_key_prefix=f"pet_nearby:{pet.id}",
    )


def _process_breeding_request_received(object_id, payload):
    try:
        breeding_request = BreedingRequest.objects.get(id=object_id)
    except BreedingRequest.DoesNotExist as exc:
        raise NotificationEventPermanentError(f"BreedingRequest {object_id} not found") from exc

    event_key = f"breeding_request_received:{breeding_request.id}:{breeding_request.receiver_id}"
    notify_breeding_request_received(breeding_request, event_key=event_key)


def _process_breeding_request_approved(object_id, payload):
    try:
        breeding_request = BreedingRequest.objects.get(id=object_id)
    except BreedingRequest.DoesNotExist as exc:
        raise NotificationEventPermanentError(f"BreedingRequest {object_id} not found") from exc

    event_key = f"breeding_request_approved:{breeding_request.id}:{breeding_request.requester_id}"
    notify_breeding_request_approved(breeding_request, event_key=event_key)


def _process_breeding_request_rejected(object_id, payload):
    try:
        breeding_request = BreedingRequest.objects.get(id=object_id)
    except BreedingRequest.DoesNotExist as exc:
        raise NotificationEventPermanentError(f"BreedingRequest {object_id} not found") from exc

    event_key = f"breeding_request_rejected:{breeding_request.id}:{breeding_request.requester_id}"
    notify_breeding_request_rejected(breeding_request, event_key=event_key)


def _process_adoption_request_received(object_id, payload):
    try:
        adoption_request = AdoptionRequest.objects.select_related('pet').get(id=object_id)
    except AdoptionRequest.DoesNotExist as exc:
        raise NotificationEventPermanentError(f"AdoptionRequest {object_id} not found") from exc

    event_key = f"adoption_request_received:{adoption_request.id}:{adoption_request.pet.owner_id}"
    notify_adoption_request_received(adoption_request, event_key=event_key)


def _process_adoption_request_approved(object_id, payload):
    try:
        adoption_request = AdoptionRequest.objects.select_related('pet').get(id=object_id)
    except AdoptionRequest.DoesNotExist as exc:
        raise NotificationEventPermanentError(f"AdoptionRequest {object_id} not found") from exc

    event_key = f"adoption_request_approved:{adoption_request.id}:{adoption_request.adopter_id}"
    notify_adoption_request_approved(adoption_request, event_key=event_key)


EVENT_HANDLERS = {
    NotificationOutbox.EVENT_PET_CREATED: _process_pet_created,
    NotificationOutbox.EVENT_BREEDING_REQUEST_RECEIVED: _process_breeding_request_received,
    NotificationOutbox.EVENT_BREEDING_REQUEST_APPROVED: _process_breeding_request_approved,
    NotificationOutbox.EVENT_BREEDING_REQUEST_REJECTED: _process_breeding_request_rejected,
    NotificationOutbox.EVENT_ADOPTION_REQUEST_RECEIVED: _process_adoption_request_received,
    NotificationOutbox.EVENT_ADOPTION_REQUEST_APPROVED: _process_adoption_request_approved,
}


def dispatch_notification_event(outbox_event):
    handler = EVENT_HANDLERS.get(outbox_event.event_type)
    if not handler:
        raise NotificationEventPermanentError(f"Unsupported event type: {outbox_event.event_type}")
    payload = outbox_event.payload or {}
    handler(outbox_event.object_id, payload)


def enqueue_notification_event(event_type, object_id, dedupe_key, payload=None):
    payload = payload or {}
    outbox_event, created = NotificationOutbox.objects.get_or_create(
        dedupe_key=dedupe_key,
        defaults={
            'event_type': event_type,
            'object_id': object_id,
            'payload': payload,
            'status': NotificationOutbox.STATUS_PENDING,
            'next_attempt_at': timezone.now(),
        },
    )

    if not created:
        if outbox_event.event_type != event_type or outbox_event.object_id != object_id:
            logger.warning(
                "Outbox dedupe key collision for %s (existing=%s:%s, incoming=%s:%s)",
                dedupe_key,
                outbox_event.event_type,
                outbox_event.object_id,
                event_type,
                object_id,
            )
            return outbox_event

        if outbox_event.status == NotificationOutbox.STATUS_FAILED:
            outbox_event.status = NotificationOutbox.STATUS_PENDING
            outbox_event.next_attempt_at = timezone.now()
            outbox_event.last_error = ''
            outbox_event.processed_at = None
            outbox_event.save(
                update_fields=['status', 'next_attempt_at', 'last_error', 'processed_at', 'updated_at']
            )

    should_schedule = created or outbox_event.status == NotificationOutbox.STATUS_PENDING
    if should_schedule:
        transaction.on_commit(lambda: _schedule_outbox_event(outbox_event.id))

    return outbox_event


def _schedule_outbox_event(event_id, countdown=None):
    from .tasks import process_notification_outbox_event

    if settings.NOTIFICATIONS_DELIVERY_MODE == 'async':
        options = {'queue': settings.CELERY_NOTIFICATION_QUEUE}
        if countdown is not None:
            options['countdown'] = countdown
        process_notification_outbox_event.apply_async(args=[event_id], **options)
        return

    process_notification_outbox_event(event_id)

