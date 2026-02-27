import logging
import random
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import NotificationOutbox
from .notification_events import NotificationEventPermanentError, dispatch_notification_event

logger = logging.getLogger(__name__)


def _compute_retry_delay_seconds(attempt_number):
    base_delay = max(1, int(settings.CELERY_NOTIFICATION_RETRY_BASE_SECONDS))
    max_delay = max(base_delay, int(settings.CELERY_NOTIFICATION_RETRY_MAX_SECONDS))
    exponential_delay = min(max_delay, base_delay * (2 ** max(0, attempt_number - 1)))
    jitter = random.randint(0, base_delay)
    return min(max_delay, exponential_delay + jitter)


def _claim_outbox_event(event_id):
    with transaction.atomic():
        try:
            event = NotificationOutbox.objects.select_for_update().get(id=event_id)
        except NotificationOutbox.DoesNotExist:
            return None

        if event.status in {NotificationOutbox.STATUS_SUCCEEDED, NotificationOutbox.STATUS_FAILED}:
            return None

        if event.status == NotificationOutbox.STATUS_PROCESSING:
            return None

        now = timezone.now()
        if event.next_attempt_at and event.next_attempt_at > now:
            return None

        event.status = NotificationOutbox.STATUS_PROCESSING
        event.attempts = event.attempts + 1
        event.last_error = ''
        event.save(update_fields=['status', 'attempts', 'last_error', 'updated_at'])
        return event


def _mark_event_succeeded(event_id):
    NotificationOutbox.objects.filter(id=event_id).update(
        status=NotificationOutbox.STATUS_SUCCEEDED,
        processed_at=timezone.now(),
        last_error='',
    )


def _mark_event_retry_or_failed(event_id, error_message):
    with transaction.atomic():
        event = NotificationOutbox.objects.select_for_update().get(id=event_id)
        max_attempts = max(1, int(settings.CELERY_NOTIFICATION_MAX_ATTEMPTS))

        truncated_error = str(error_message)[:4000]
        if event.attempts >= max_attempts:
            event.status = NotificationOutbox.STATUS_FAILED
            event.processed_at = timezone.now()
            event.last_error = truncated_error
            event.save(update_fields=['status', 'processed_at', 'last_error', 'updated_at'])
            return False, None

        retry_delay = _compute_retry_delay_seconds(event.attempts)
        event.status = NotificationOutbox.STATUS_PENDING
        event.next_attempt_at = timezone.now() + timedelta(seconds=retry_delay)
        event.last_error = truncated_error
        event.save(update_fields=['status', 'next_attempt_at', 'last_error', 'updated_at'])
        return True, retry_delay


@shared_task(bind=True, ignore_result=True, name='pets.tasks.process_notification_outbox_event')
def process_notification_outbox_event(self, event_id):
    outbox_event = _claim_outbox_event(event_id)
    if not outbox_event:
        return {'status': 'skipped', 'event_id': event_id}

    try:
        dispatch_notification_event(outbox_event)
    except NotificationEventPermanentError as exc:
        NotificationOutbox.objects.filter(id=event_id).update(
            status=NotificationOutbox.STATUS_FAILED,
            processed_at=timezone.now(),
            last_error=str(exc)[:4000],
        )
        logger.warning("Outbox event %s marked failed (permanent): %s", event_id, exc)
        return {'status': 'failed_permanent', 'event_id': event_id}
    except Exception as exc:  # noqa: BLE001
        should_retry, retry_delay = _mark_event_retry_or_failed(event_id, str(exc))
        logger.exception("Outbox event %s failed", event_id)

        if should_retry and settings.NOTIFICATIONS_DELIVERY_MODE == 'async':
            process_notification_outbox_event.apply_async(
                args=[event_id],
                queue=settings.CELERY_NOTIFICATION_QUEUE,
                countdown=retry_delay,
            )
            return {'status': 'retry_scheduled', 'event_id': event_id, 'retry_in': retry_delay}

        return {'status': 'retry_pending', 'event_id': event_id}

    _mark_event_succeeded(event_id)
    return {'status': 'succeeded', 'event_id': event_id}


@shared_task(ignore_result=True, name='pets.tasks.sweep_notification_outbox')
def sweep_notification_outbox(limit=200):
    now = timezone.now()
    stale_cutoff = now - timedelta(seconds=max(60, int(settings.CELERY_NOTIFICATION_STUCK_SECONDS)))
    recovered = NotificationOutbox.objects.filter(
        status=NotificationOutbox.STATUS_PROCESSING,
        updated_at__lt=stale_cutoff,
    ).update(
        status=NotificationOutbox.STATUS_PENDING,
        next_attempt_at=now,
        last_error='Recovered stale processing lock',
    )

    safe_limit = max(1, int(limit))
    pending_event_ids = list(
        NotificationOutbox.objects.filter(
            status=NotificationOutbox.STATUS_PENDING,
            next_attempt_at__lte=now,
        )
        .order_by('next_attempt_at', 'created_at')
        .values_list('id', flat=True)[:safe_limit]
    )

    for event_id in pending_event_ids:
        if settings.NOTIFICATIONS_DELIVERY_MODE == 'async':
            process_notification_outbox_event.apply_async(
                args=[event_id],
                queue=settings.CELERY_NOTIFICATION_QUEUE,
            )
        else:
            process_notification_outbox_event(event_id)

    return {
        'recovered': recovered,
        'queued': len(pending_event_ids),
    }

