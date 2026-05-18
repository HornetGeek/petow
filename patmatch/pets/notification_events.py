import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import AdoptionRequest, BreedingRequest, ChatRoom, Notification, NotificationOutbox, Pet
from .notifications import (
    notify_chat_message_received,
    notify_adoption_request_approved,
    notify_adoption_request_received,
    notify_breeding_request_approved,
    notify_breeding_request_received,
    notify_breeding_request_rejected,
    deliver_outbox_notification_push,
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


def _process_chat_message_received(object_id, payload):
    try:
        chat_room = ChatRoom.objects.select_related(
            'breeding_request__requester',
            'breeding_request__target_pet__owner',
            'adoption_request__adopter',
            'adoption_request__pet__owner',
            'clinic_patient__linked_user',
            'clinic_staff',
        ).get(id=object_id)
    except ChatRoom.DoesNotExist as exc:
        raise NotificationEventPermanentError(f"ChatRoom {object_id} not found") from exc

    sender_id = payload.get('sender_id')
    recipient_id = payload.get('recipient_id')
    message_content = payload.get('message_content', '')

    if not sender_id or not recipient_id:
        raise NotificationEventPermanentError("sender_id and recipient_id are required for chat message events")

    try:
        sender_id = int(sender_id)
        recipient_id = int(recipient_id)
    except (TypeError, ValueError) as exc:
        raise NotificationEventPermanentError("sender_id and recipient_id must be integers") from exc

    participants_list = chat_room.get_participants()
    participants = {participant.id for participant in participants_list}
    if sender_id not in participants or recipient_id not in participants:
        raise NotificationEventPermanentError("sender_id or recipient_id is not a participant in this chat room")

    sender = next((participant for participant in participants_list if participant.id == sender_id), None)
    recipient = next((participant for participant in participants_list if participant.id == recipient_id), None)
    if not sender or not recipient:
        raise NotificationEventPermanentError("Unable to resolve sender or recipient user for chat message event")

    message_id = payload.get('message_id') or payload.get('firebase_message_id') or payload.get('event_nonce') or ''
    event_key = payload.get('event_key') or f"chat_message_received:{chat_room.id}:{sender.id}:{recipient.id}:{message_id}"
    notify_chat_message_received(
        recipient_user=recipient,
        sender_user=sender,
        chat_room=chat_room,
        message_content=message_content,
        event_key=event_key,
    )


def _get_notification_or_raise(notification_id):
    try:
        return Notification.objects.select_related('user').get(id=notification_id)
    except Notification.DoesNotExist as exc:
        raise NotificationEventPermanentError(f"Notification {notification_id} not found") from exc


def _process_clinic_invite_push(object_id, payload):
    notification = _get_notification_or_raise(object_id)
    delivered = deliver_outbox_notification_push(
        notification,
        title=payload.get('title'),
        message=payload.get('message'),
        push_payload=payload.get('push_payload') or {},
        push_type='clinic_invite',
    )
    extra_data = notification.extra_data if isinstance(notification.extra_data, dict) else {}
    extra_data['delivered'] = bool(delivered)
    notification.extra_data = extra_data
    notification.save(update_fields=['extra_data', 'updated_at'])


def _process_clinic_broadcast_push(object_id, payload):
    notification = _get_notification_or_raise(object_id)
    delivered = deliver_outbox_notification_push(
        notification,
        title=payload.get('title'),
        message=payload.get('message'),
        push_payload=payload.get('push_payload') or {},
        push_type='clinic_broadcast',
    )
    extra_data = notification.extra_data if isinstance(notification.extra_data, dict) else {}
    extra_data['delivered'] = bool(delivered)
    notification.extra_data = extra_data
    notification.save(update_fields=['extra_data', 'updated_at'])


def _process_clinic_chat_message_push(object_id, payload):
    notification = _get_notification_or_raise(object_id)
    delivered = deliver_outbox_notification_push(
        notification,
        title=payload.get('title'),
        message=payload.get('message'),
        push_payload=payload.get('push_payload') or {},
        push_type='clinic_chat_message',
    )
    extra_data = notification.extra_data if isinstance(notification.extra_data, dict) else {}
    extra_data['delivered'] = bool(delivered)
    notification.extra_data = extra_data
    notification.save(update_fields=['extra_data', 'updated_at'])


def _process_account_verification_approved_push(object_id, payload):
    notification = _get_notification_or_raise(object_id)
    delivered = deliver_outbox_notification_push(
        notification,
        title=payload.get('title'),
        message=payload.get('message'),
        push_payload=payload.get('push_payload') or {},
        push_type='account_verification_approved',
    )
    extra_data = notification.extra_data if isinstance(notification.extra_data, dict) else {}
    extra_data['delivered'] = bool(delivered)
    notification.extra_data = extra_data
    notification.save(update_fields=['extra_data', 'updated_at'])


EVENT_HANDLERS = {
    NotificationOutbox.EVENT_PET_CREATED: _process_pet_created,
    NotificationOutbox.EVENT_BREEDING_REQUEST_RECEIVED: _process_breeding_request_received,
    NotificationOutbox.EVENT_BREEDING_REQUEST_APPROVED: _process_breeding_request_approved,
    NotificationOutbox.EVENT_BREEDING_REQUEST_REJECTED: _process_breeding_request_rejected,
    NotificationOutbox.EVENT_ADOPTION_REQUEST_RECEIVED: _process_adoption_request_received,
    NotificationOutbox.EVENT_ADOPTION_REQUEST_APPROVED: _process_adoption_request_approved,
    NotificationOutbox.EVENT_CHAT_MESSAGE_RECEIVED: _process_chat_message_received,
    NotificationOutbox.EVENT_CLINIC_INVITE_PUSH: _process_clinic_invite_push,
    NotificationOutbox.EVENT_CLINIC_BROADCAST_PUSH: _process_clinic_broadcast_push,
    NotificationOutbox.EVENT_CLINIC_CHAT_MESSAGE_PUSH: _process_clinic_chat_message_push,
    NotificationOutbox.EVENT_ACCOUNT_VERIFICATION_APPROVED_PUSH: _process_account_verification_approved_push,
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
