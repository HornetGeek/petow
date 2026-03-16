"""
Utilities for creating and managing notifications
"""
import logging
from datetime import timedelta
from math import radians, sin, cos, sqrt, atan2

from django.conf import settings
from django.db import IntegrityError
from django.utils import timezone as django_timezone
from zoneinfo import ZoneInfo

from .models import (
    Notification,
    Pet,
    BreedingRequest,
    NotificationDeliveryAttempt,
)
from accounts.models import User, UserNotificationSettings
from accounts.firebase_service import firebase_service
from .email_notifications import (
    send_breeding_request_email,
    send_breeding_request_approved_email,
    send_adoption_request_email,
    send_adoption_request_approved_email
)
from .push_targets import attach_push_targets

logger = logging.getLogger(__name__)

TRANSACTIONAL_NOTIFICATION_TYPES = {
    'chat_message_received',
    'breeding_request_received',
    'breeding_request_approved',
    'breeding_request_rejected',
    'adoption_request_received',
    'adoption_request_approved',
    'clinic_invite',
}

DISCOVERY_NOTIFICATION_TYPES = {
    'pet_nearby',
    'adoption_pet_nearby',
}

REMINDER_NOTIFICATION_TYPES = {
    'breeding_request_pending_reminder',
    'adoption_request_pending_reminder',
}

CHAT_NOTIFICATION_TYPES = {
    'chat_message_received',
    'clinic_chat_message',
}

BREEDING_NOTIFICATION_TYPES = {
    'breeding_request_received',
    'breeding_request_approved',
    'breeding_request_rejected',
    'breeding_request_completed',
    'breeding_request_pending_reminder',
    'pet_nearby',
}

ADOPTION_NOTIFICATION_TYPES = {
    'adoption_request_received',
    'adoption_request_approved',
    'adoption_request_pending_reminder',
    'adoption_pet_nearby',
}

CLINIC_NOTIFICATION_TYPES = {
    'clinic_invite',
    'clinic_broadcast',
    'clinic_chat_message',
}

SYSTEM_NOTIFICATION_TYPES = {
    'system_message',
    'account_verification_approved',
}


def get_notification_category(notification_type):
    notification_type = (notification_type or '').strip().lower()
    if notification_type in REMINDER_NOTIFICATION_TYPES:
        return 'reminders'
    if notification_type in DISCOVERY_NOTIFICATION_TYPES:
        return 'discovery'
    if notification_type in CHAT_NOTIFICATION_TYPES:
        return 'chat'
    if notification_type in BREEDING_NOTIFICATION_TYPES:
        return 'breeding'
    if notification_type in ADOPTION_NOTIFICATION_TYPES:
        return 'adoption'
    if notification_type in CLINIC_NOTIFICATION_TYPES:
        return 'clinic'
    if notification_type in SYSTEM_NOTIFICATION_TYPES:
        return 'system'
    return 'transactional' if notification_type in TRANSACTIONAL_NOTIFICATION_TYPES else 'system'


def get_notification_priority(notification_type):
    notification_type = (notification_type or '').strip().lower()
    if notification_type in TRANSACTIONAL_NOTIFICATION_TYPES:
        return 'high'
    if notification_type in REMINDER_NOTIFICATION_TYPES:
        return 'normal'
    if notification_type in DISCOVERY_NOTIFICATION_TYPES:
        return 'low'
    return 'normal'


def _hash_user_bucket(user_id):
    # Deterministic bucket [0, 99].
    return ((int(user_id) * 2654435761) % 100)


def is_user_in_variant_cohort(user):
    if not user or not getattr(user, 'id', None):
        return False

    rollout_phase = int(getattr(settings, 'NOTIFICATION_EXPERIMENT_PHASE', 100))
    rollout_phase = max(0, min(100, rollout_phase))
    bucket = _hash_user_bucket(user.id)
    return bucket < rollout_phase


def _resolve_settings_timezone(user_settings):
    try:
        return ZoneInfo(user_settings.timezone or 'UTC')
    except Exception:
        return ZoneInfo('UTC')


def _is_now_in_quiet_hours(user_settings, now=None):
    now = now or django_timezone.now()
    tz = _resolve_settings_timezone(user_settings)
    local_now = now.astimezone(tz)
    current_time = local_now.time()
    start = user_settings.quiet_hours_start
    end = user_settings.quiet_hours_end

    if start == end:
        return False

    if start < end:
        return start <= current_time < end
    return current_time >= start or current_time < end


def _record_delivery_attempt(notification, status, error='', metadata=None):
    try:
        NotificationDeliveryAttempt.objects.create(
            notification=notification,
            channel=NotificationDeliveryAttempt.CHANNEL_PUSH,
            provider='fcm',
            status=status,
            error=error or '',
            metadata=metadata or {},
        )
    except Exception:
        logger.exception("Failed to persist notification delivery attempt for notification=%s", getattr(notification, 'id', None))


def _can_send_non_transactional_now(user, user_settings, notification_type):
    now = django_timezone.now()
    category = get_notification_category(notification_type)

    if not user_settings.enabled_global:
        return False, 'global_notifications_disabled'

    if _is_now_in_quiet_hours(user_settings, now=now):
        return False, 'quiet_hours_active'

    day_ago = now - timedelta(hours=24)
    sent_today_qs = NotificationDeliveryAttempt.objects.filter(
        notification__user=user,
        channel=NotificationDeliveryAttempt.CHANNEL_PUSH,
        status=NotificationDeliveryAttempt.STATUS_SENT,
        created_at__gte=day_ago,
    )
    sent_count = sent_today_qs.count()
    if sent_count >= user_settings.max_push_per_day:
        return False, 'max_push_per_day_exceeded'

    if category == 'discovery':
        discovery_count = sent_today_qs.filter(
            notification__type__in=DISCOVERY_NOTIFICATION_TYPES
        ).count()
        if discovery_count >= user_settings.max_discovery_per_day:
            return False, 'max_discovery_per_day_exceeded'

    min_gap = max(0, int(user_settings.min_minutes_between_non_transactional))
    if min_gap > 0:
        last_sent = sent_today_qs.exclude(
            notification__type__in=TRANSACTIONAL_NOTIFICATION_TYPES
        ).order_by('-created_at').values_list('created_at', flat=True).first()
        if last_sent and (now - last_sent) < timedelta(minutes=min_gap):
            return False, 'min_interval_not_elapsed'

    return True, None


def _is_category_enabled(user, user_settings, category):
    if not user_settings.enabled_global:
        return False
    if category == 'chat':
        return user_settings.allow_chat
    if category == 'breeding':
        return user_settings.allow_breeding
    if category == 'adoption':
        return user_settings.allow_adoption
    if category == 'clinic':
        return user_settings.allow_clinic
    if category == 'discovery':
        return user_settings.allow_discovery
    if category == 'reminders':
        return user_settings.allow_reminders
    if category == 'transactional':
        return user_settings.allow_transactional
    return True


def _should_deliver_push(user, notification_type):
    """
    Return (allowed: bool, reason: str|None, settings_obj).
    Applies:
    - Legacy toggles for all users.
    - New policy controls only for users in experiment variant.
    """
    if not user:
        return False, 'missing_user', None

    if (notification_type in BREEDING_NOTIFICATION_TYPES) and getattr(user, 'notify_breeding_requests', True) is False:
        return False, 'legacy_breeding_opt_out', None
    if (notification_type in ADOPTION_NOTIFICATION_TYPES) and getattr(user, 'notify_adoption_pets', True) is False:
        return False, 'legacy_adoption_opt_out', None

    user_settings, _ = UserNotificationSettings.objects.get_or_create(user=user)
    user_settings.sync_from_legacy_user_fields()

    category = get_notification_category(notification_type)
    if not _is_category_enabled(user, user_settings, category):
        return False, f'category_disabled:{category}', user_settings

    # Keep control cohort behavior close to legacy; variant gets full anti-fatigue policy.
    if not is_user_in_variant_cohort(user):
        return True, None, user_settings

    if notification_type in TRANSACTIONAL_NOTIFICATION_TYPES:
        return True, None, user_settings

    allowed, reason = _can_send_non_transactional_now(user, user_settings, notification_type)
    return allowed, reason, user_settings


def _send_push_notification(user, title, message, data=None):
    """Helper to send a push notification if the user has a valid FCM token."""
    if not user or not user.fcm_token:
        return False

    if not firebase_service.is_initialized:
        logger.debug("Firebase not initialised; skipping push notification for %s", user.id)
        return False

    payload = data or {}
    try:
        success = firebase_service.send_notification(
            fcm_token=user.fcm_token,
            title=title,
            body=message,
            data=payload
        )
        if not success:
            logger.warning("Failed to deliver push notification to user %s", user.id)
        return success
    except Exception as exc:
        logger.error("Error sending push notification to user %s: %s", user.id, exc)
        return False


def _send_push_if_allowed(user, title, message, data=None, category=None, notification=None, notification_type=None):
    """
    Respect legacy + granular policy preferences before sending push.
    Returns bool delivery status.
    """
    if not user:
        _record_delivery_attempt(notification, NotificationDeliveryAttempt.STATUS_SUPPRESSED, error='missing_user')
        return False

    resolved_type = (notification_type or (notification.type if notification else '') or '').strip().lower()
    allowed, reason, _ = _should_deliver_push(user, resolved_type)
    if not allowed:
        logger.info("Push suppressed for user %s reason=%s type=%s", user.id, reason, resolved_type)
        _record_delivery_attempt(
            notification,
            NotificationDeliveryAttempt.STATUS_SUPPRESSED,
            error=reason or 'suppressed',
            metadata={'type': resolved_type, 'category': category or get_notification_category(resolved_type)},
        )
        return False

    payload = dict(data or {})
    if notification and notification.id and not payload.get('notification_id'):
        payload['notification_id'] = str(notification.id)
    if resolved_type and not payload.get('type'):
        payload['type'] = resolved_type

    if not user.fcm_token:
        _record_delivery_attempt(
            notification,
            NotificationDeliveryAttempt.STATUS_SUPPRESSED,
            error='missing_fcm_token',
            metadata={'type': resolved_type, 'category': category or get_notification_category(resolved_type), 'payload': payload},
        )
        return False

    if not firebase_service.is_initialized:
        _record_delivery_attempt(
            notification,
            NotificationDeliveryAttempt.STATUS_SUPPRESSED,
            error='firebase_not_initialized',
            metadata={'type': resolved_type, 'category': category or get_notification_category(resolved_type), 'payload': payload},
        )
        return False

    delivered = _send_push_notification(user, title, message, payload)
    _record_delivery_attempt(
        notification,
        NotificationDeliveryAttempt.STATUS_SENT if delivered else NotificationDeliveryAttempt.STATUS_FAILED,
        error='' if delivered else 'provider_delivery_failed',
        metadata={'type': resolved_type, 'category': category or get_notification_category(resolved_type), 'payload': payload},
    )
    return delivered


def _adoption_notifications_enabled(user):
    return getattr(user, 'notify_adoption_pets', True) is not False


def deliver_outbox_notification_push(notification, title=None, message=None, push_payload=None, push_type=None):
    """
    Push delivery helper for outbox handlers.
    Applies policy checks + delivery attempt tracking.
    """
    if not notification:
        return False

    resolved_type = (push_type or notification.type or '').strip().lower()
    payload = attach_push_targets(
        dict(push_payload or {}),
        resolved_type,
        context={
            **(notification.extra_data or {}),
            'pet_id': getattr(notification, 'related_pet_id', None),
            'breeding_request_id': getattr(notification, 'related_breeding_request_id', None),
            'chat_room_id': getattr(notification, 'related_chat_room_id', None),
        },
    )
    payload.setdefault('type', resolved_type)

    return _send_push_if_allowed(
        user=notification.user,
        title=title or notification.title,
        message=message or notification.message,
        data=payload,
        category=get_notification_category(resolved_type),
        notification=notification,
        notification_type=resolved_type,
    )

def create_notification(
    user,
    notification_type,
    title,
    message,
    related_pet=None,
    related_breeding_request=None,
    related_chat_room=None,
    extra_data=None,
    event_key=None,
):
    """
    إنشاء إشعار جديد
    
    Args:
        user: المستخدم المرسل إليه الإشعار
        notification_type: نوع الإشعار
        title: عنوان الإشعار
        message: محتوى الإشعار
        related_pet: الحيوان المرتبط (اختياري)
        related_breeding_request: طلب المقابلة المرتبط (اختياري)
        extra_data: بيانات إضافية (اختياري)
    
    Returns:
        Notification: الإشعار المُنشأ
    """
    return Notification.objects.create(
        user=user,
        type=notification_type,
        title=title,
        message=message,
        event_key=event_key,
        related_pet=related_pet,
        related_breeding_request=related_breeding_request,
        related_chat_room=related_chat_room,
        extra_data=extra_data or {}
    )


def create_notification_once(
    user,
    notification_type,
    title,
    message,
    related_pet=None,
    related_breeding_request=None,
    related_chat_room=None,
    extra_data=None,
    event_key=None,
):
    if not event_key:
        return create_notification(
            user=user,
            notification_type=notification_type,
            title=title,
            message=message,
            related_pet=related_pet,
            related_breeding_request=related_breeding_request,
            related_chat_room=related_chat_room,
            extra_data=extra_data,
        ), True

    defaults = {
        'type': notification_type,
        'title': title,
        'message': message,
        'related_pet': related_pet,
        'related_breeding_request': related_breeding_request,
        'related_chat_room': related_chat_room,
        'extra_data': extra_data or {},
    }
    try:
        notification, created = Notification.objects.get_or_create(
            user=user,
            event_key=event_key,
            defaults=defaults,
        )
        return notification, created
    except IntegrityError:
        notification = Notification.objects.get(user=user, event_key=event_key)
        return notification, False

def notify_breeding_request_received(breeding_request, event_key=None):
    """إشعار باستلام طلب مقابلة جديد"""
    receiver = breeding_request.receiver
    target_pet = breeding_request.target_pet
    requester_pet = breeding_request.requester_pet

    title = f"طلب مقابلة جديد من {breeding_request.requester.get_full_name()}"
    message = f"يريد {breeding_request.requester.get_full_name()} ترتيب مقابلة بين {requester_pet.name} و {target_pet.name}"
    meeting_date_value = (
        breeding_request.meeting_date.isoformat()
        if breeding_request.meeting_date
        else None
    )

    # إعداد البيانات الإضافية للإشعار
    extra_data = {
        'requester_name': breeding_request.requester.get_full_name(),
        'requester_pet_name': requester_pet.name,
    }
    if meeting_date_value:
        extra_data['meeting_date'] = meeting_date_value

    # إضافة معلومات العيادة البيطرية فقط إذا كانت متوفرة
    if breeding_request.veterinary_clinic:
        extra_data['clinic_name'] = breeding_request.veterinary_clinic.name
        message += f" في {breeding_request.veterinary_clinic.name}"
    else:
        message += " (مكان المقابلة سيتم تحديده لاحقاً)"

    # إنشاء الإشعار
    notification, created = create_notification_once(
        user=receiver,
        notification_type='breeding_request_received',
        title=title,
        message=message,
        related_pet=target_pet,
        related_breeding_request=breeding_request,
        extra_data=extra_data,
        event_key=event_key,
    )

    if created:
        # إرسال إيميل
        send_breeding_request_email(breeding_request)

        # إرسال إشعار دفع
        push_payload = attach_push_targets({
            'type': 'breeding_request_received',
            'breeding_request_id': str(breeding_request.id),
            'pet_id': str(target_pet.id),
        }, 'breeding_request_received')
        _send_push_if_allowed(
            receiver,
            title,
            message,
            push_payload,
            category='breeding',
            notification=notification,
            notification_type='breeding_request_received',
        )

    return notification


def notify_chat_message_received(recipient_user, sender_user, chat_room, message_content, event_key=None):
    """Create chat-message notification and optionally deliver push."""
    if not recipient_user or not sender_user or not chat_room:
        return None
    if recipient_user.id == sender_user.id:
        return None

    message_content = (message_content or '').strip() or 'رسالة جديدة'
    title = f"رسالة جديدة من {sender_user.get_full_name()}"
    message = f"{message_content[:100]}..." if len(message_content) > 100 else message_content

    notification, created = create_notification_once(
        user=recipient_user,
        notification_type='chat_message_received',
        title=title,
        message=message,
        related_chat_room=chat_room,
        extra_data={
            'sender_name': sender_user.get_full_name(),
            'sender_id': sender_user.id,
            'chat_id': chat_room.firebase_chat_id,
            'message_preview': message_content[:50],
        },
        event_key=event_key,
    )

    if created:
        push_payload = attach_push_targets({
            'type': 'chat_message_received',
            'chat_id': chat_room.firebase_chat_id,
            'sender_id': str(sender_user.id),
            'sender_name': sender_user.get_full_name(),
        }, 'chat_message_received')
        _send_push_if_allowed(
            recipient_user,
            title,
            message,
            push_payload,
            category='chat',
            notification=notification,
            notification_type='chat_message_received',
        )

    return notification


def notify_breeding_request_approved(breeding_request, event_key=None):
    """إشعار بقبول طلب المقابلة"""
    requester = breeding_request.requester
    target_pet = breeding_request.target_pet
    meeting_date_value = (
        breeding_request.meeting_date.isoformat()
        if breeding_request.meeting_date
        else None
    )

    # تخصيص الرسالة بناءً على وجود العيادة البيطرية
    if breeding_request.veterinary_clinic:
        title = f"تم قبول طلب مقابلتك مع {target_pet.name}"
        message = f"تم قبول طلب المقابلة الخاص بك! يمكنك الآن ترتيب المقابلة في {breeding_request.veterinary_clinic.name}"

        extra_data = {
            'clinic_name': breeding_request.veterinary_clinic.name,
            'clinic_phone': breeding_request.veterinary_clinic.phone,
        }
    else:
        title = f"تم قبول طلب مقابلتك مع {target_pet.name}"
        message = f"تم قبول طلب المقابلة الخاص بك! يمكنك الآن ترتيب المقابلة في المكان المناسب لكما."

        extra_data = {}

    if meeting_date_value:
        extra_data['meeting_date'] = meeting_date_value

    # إنشاء الإشعار
    notification, created = create_notification_once(
        user=requester,
        notification_type='breeding_request_approved',
        title=title,
        message=message,
        related_pet=target_pet,
        related_breeding_request=breeding_request,
        extra_data=extra_data,
        event_key=event_key,
    )

    if created:
        # إرسال إيميل
        send_breeding_request_approved_email(breeding_request)

        push_payload = attach_push_targets({
            'type': 'breeding_request_approved',
            'breeding_request_id': str(breeding_request.id),
            'pet_id': str(target_pet.id),
        }, 'breeding_request_approved')
        _send_push_if_allowed(
            requester,
            title,
            message,
            push_payload,
            category='breeding',
            notification=notification,
            notification_type='breeding_request_approved',
        )

    return notification


def notify_breeding_request_rejected(breeding_request, event_key=None):
    """إشعار برفض طلب المقابلة"""
    requester = breeding_request.requester
    target_pet = breeding_request.target_pet
    
    title = f"تم رفض طلب مقابلتك مع {target_pet.name}"
    message = f"نأسف، تم رفض طلب المقابلة الخاص بك. يمكنك البحث عن حيوانات أخرى للتزاوج."
    
    notification, created = create_notification_once(
        user=requester,
        notification_type='breeding_request_rejected',
        title=title,
        message=message,
        related_pet=target_pet,
        related_breeding_request=breeding_request,
        extra_data={
            'rejection_reason': breeding_request.response_message or ''
        },
        event_key=event_key,
    )

    if created:
        push_payload = attach_push_targets({
            'type': 'breeding_request_rejected',
            'breeding_request_id': str(breeding_request.id),
            'pet_id': str(target_pet.id),
        }, 'breeding_request_rejected')
        _send_push_if_allowed(
            requester,
            title,
            message,
            push_payload,
            category='breeding',
            notification=notification,
            notification_type='breeding_request_rejected',
        )

    return notification


def notify_breeding_request_pending_reminder(breeding_request):
    """
    إرسال تذكير للمستلم بأن هناك طلب تزاوج ما زال قيد المراجعة.
    يتم استخدامه عادة في المهام المجدولة لتذكير المستخدمين باتخاذ إجراء.
    """
    receiver = breeding_request.receiver
    target_pet = breeding_request.target_pet
    requester = breeding_request.requester

    title = f"تذكير بطلب تزاوج لـ {target_pet.name}"
    message = (
        f"هناك طلب تزاوج من {requester.get_full_name()} بانتظار ردك. "
        "فضلاً قم بقبول أو رفض الطلب لإبلاغ الطرف الآخر."
    )

    notification = create_notification(
        user=receiver,
        notification_type='breeding_request_pending_reminder',
        title=title,
        message=message,
        related_pet=target_pet,
        related_breeding_request=breeding_request,
        extra_data={
            'requester_name': requester.get_full_name(),
            'requester_pet_name': breeding_request.requester_pet.name,
        },
    )

    push_payload = attach_push_targets({
        'type': 'breeding_request_pending_reminder',
        'breeding_request_id': str(breeding_request.id),
        'pet_id': str(target_pet.id),
    }, 'breeding_request_pending_reminder')
    _send_push_if_allowed(
        receiver,
        title,
        message,
        push_payload,
        category='reminders',
        notification=notification,
        notification_type='breeding_request_pending_reminder',
    )

    return notification


def notify_adoption_request_pending_reminder(adoption_request):
    """
    إرسال تذكير لمالك الحيوان بأن هناك طلب تبنّي ما زال قيد المراجعة.
    يتم استخدامه عادة في المهام المجدولة لتذكير المستخدمين باتخاذ إجراء.
    """
    pet = adoption_request.pet
    pet_owner = pet.owner
    adopter = adoption_request.adopter

    title = f"تذكير بطلب تبنّي لـ {pet.name}"
    message = (
        f"هناك طلب تبنّي من {adoption_request.adopter_name} بانتظار ردك. "
        "فضلاً قم بقبول أو رفض الطلب لإبلاغ الطرف الآخر."
    )

    if not _adoption_notifications_enabled(pet_owner):
        logger.info("Adoption notifications disabled for user %s", pet_owner.id)
        return None

    notification = create_notification(
        user=pet_owner,
        notification_type='adoption_request_pending_reminder',
        title=title,
        message=message,
        related_pet=pet,
        extra_data={
            'adopter_name': adoption_request.adopter_name,
            'adoption_request_id': adoption_request.id,
        },
    )

    push_payload = attach_push_targets({
        'type': 'adoption_request_pending_reminder',
        'adoption_request_id': str(adoption_request.id),
        'pet_id': str(pet.id),
    }, 'adoption_request_pending_reminder')
    _send_push_if_allowed(
        pet_owner,
        title,
        message,
        push_payload,
        category='reminders',
        notification=notification,
        notification_type='adoption_request_pending_reminder',
    )

    return notification

def notify_breeding_request_completed(breeding_request):
    """إشعار بإكمال المقابلة"""
    # إشعار لكلا الطرفين
    notifications = []
    
    for user in [breeding_request.requester, breeding_request.receiver]:
        title = "تم إكمال المقابلة بنجاح"
        message = f"تم إكمال مقابلة التزاوج بنجاح! نتمنى لكم التوفيق."

        notification = create_notification(
            user=user,
            notification_type='breeding_request_completed',
            title=title,
            message=message,
            related_breeding_request=breeding_request,
            extra_data={
                'completed_date': breeding_request.completed_at.isoformat() if breeding_request.completed_at else None
            }
        )
        notifications.append(notification)

        push_payload = attach_push_targets({
            'type': 'breeding_request_completed',
            'breeding_request_id': str(breeding_request.id),
        }, 'breeding_request_completed')
        _send_push_if_allowed(
            user,
            title,
            message,
            push_payload,
            category='breeding',
            notification=notification,
            notification_type='breeding_request_completed',
        )

    return notifications

def notify_favorite_added(pet, user_who_favorited):
    """إشعار بإضافة الحيوان إلى المفضلة"""
    pet_owner = pet.owner
    
    if pet_owner == user_who_favorited:
        return None  # لا نرسل إشعار إذا أضاف المالك حيوانه إلى المفضلة
    
    title = f"تم إضافة {pet.name} إلى المفضلة"
    message = f"قام {user_who_favorited.get_full_name()} بإضافة حيوانك {pet.name} إلى قائمة المفضلة!"
    
    return create_notification(
        user=pet_owner,
        notification_type='favorite_added',
        title=title,
        message=message,
        related_pet=pet,
        extra_data={
            'user_name': user_who_favorited.get_full_name()
        }
    )

def notify_pet_status_changed(pet, old_status, new_status):
    """إشعار بتغيير حالة الحيوان"""
    pet_owner = pet.owner

    title = f"تم تغيير حالة {pet.name}"
    message = f"تم تغيير حالة حيوانك {pet.name} من {old_status} إلى {new_status}"

    notification = create_notification(
        user=pet_owner,
        notification_type='pet_status_changed',
        title=title,
        message=message,
        related_pet=pet,
        extra_data={
            'old_status': old_status,
            'new_status': new_status
        }
    )

    push_payload = attach_push_targets({
        'type': 'pet_status_changed',
        'pet_id': str(pet.id),
        'old_status': old_status,
        'new_status': new_status,
    }, 'pet_status_changed')
    _send_push_if_allowed(
        pet_owner,
        title,
        message,
        push_payload,
        category='adoption',
        notification=notification,
        notification_type='pet_status_changed',
    )

    if new_status == 'available_for_adoption':
        try:
            notify_new_adoption_pet(pet)
        except Exception as exc:
            logger.error('Failed to send adoption notifications after status change for pet %s: %s', pet.id, exc)

    return notification



def _normalise_location(location):
    if not location:
        return ''
    primary = str(location).split(',')[0]
    return primary.strip().lower()


def _haversine_km(lat1, lng1, lat2, lng2):
    try:
        lat1, lng1, lat2, lng2 = map(float, (lat1, lng1, lat2, lng2))
    except (TypeError, ValueError):
        return None

    rlat1, rlng1, rlat2, rlng2 = map(radians, (lat1, lng1, lat2, lng2))
    dlat = rlat2 - rlat1
    dlng = rlng2 - rlng1
    a = sin(dlat / 2) ** 2 + cos(rlat1) * cos(rlat2) * sin(dlng / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    earth_radius_km = 6371
    return earth_radius_km * c


def notify_new_pet_added(pet, radius_km=30, event_key_prefix=None):
    """إرسال إشعار عند إضافة حيوان جديد للمستخدمين القريبين أو في نفس المدينة."""
    if pet.status == 'available_for_adoption':
        return notify_new_adoption_pet(pet, radius_km=10, event_key_prefix=event_key_prefix)

    if pet.status != 'available':
        logger.info("Skipping nearby pet notifications for pet %s with status %s", pet.id, pet.status)
        return []

    recipients = set()

    normalised_location = _normalise_location(pet.location)
    candidate_pets = Pet.objects.filter(status='available').exclude(owner=pet.owner)

    if normalised_location:
        for row in candidate_pets.exclude(location__isnull=True).values('owner_id', 'location'):
            if _normalise_location(row['location']) == normalised_location:
                recipients.add(row['owner_id'])

    if pet.latitude is not None and pet.longitude is not None:
        geo_candidates = candidate_pets.exclude(latitude__isnull=True).exclude(longitude__isnull=True)
        for row in geo_candidates.values('owner_id', 'latitude', 'longitude'):
            distance = _haversine_km(pet.latitude, pet.longitude, row['latitude'], row['longitude'])
            if distance is not None and distance <= radius_km:
                recipients.add(row['owner_id'])

    if not recipients:
        return []

    users = User.objects.filter(
        id__in=recipients,
        fcm_token__isnull=False
    ).exclude(fcm_token='').distinct()

    if not users:
        return []

    notifications = []
    title = "حيوان جديد بالقرب منك"
    location_text = pet.location or 'مدينتك'
    message = f"{pet.name} متاح الآن للتزاوج في {location_text}. تعرف على التفاصيل وابدأ المحادثة!"
    extra = {
        'pet_id': pet.id,
        'pet_name': pet.name,
        'pet_type': pet.pet_type,
        'location': location_text,
    }

    for user in users:
        event_key = f"{event_key_prefix}:{user.id}" if event_key_prefix else None
        notification, created = create_notification_once(
            user=user,
            notification_type='pet_nearby',
            title=title,
            message=message,
            related_pet=pet,
            extra_data=extra,
            event_key=event_key,
        )
        notifications.append(notification)

        if created:
            push_payload = attach_push_targets({
                'type': 'pet_nearby',
                'pet_id': str(pet.id),
                'pet_name': pet.name,
                'location': location_text,
            }, 'pet_nearby')
            _send_push_if_allowed(
                user,
                title,
                message,
                push_payload,
                category='discovery',
                notification=notification,
                notification_type='pet_nearby',
            )

    logger.info("Sent nearby pet notifications for pet %s to %d users", pet.id, len(notifications))
    return notifications


def notify_new_adoption_pet(pet, radius_km=10, event_key_prefix=None):
    """إرسال إشعار عند توفر حيوان للتبني للمستخدمين القريبين."""
    if pet.status != 'available_for_adoption':
        logger.info("Skipping adoption notifications for pet %s with status %s", pet.id, pet.status)
        return []

    recipients = {}

    pet_lat = pet.latitude
    pet_lng = pet.longitude

    if pet_lat is not None and pet_lng is not None:
        geo_users = User.objects.exclude(id=pet.owner_id).exclude(
            latitude__isnull=True
        ).exclude(
            longitude__isnull=True
        ).exclude(
            fcm_token__isnull=True
        ).exclude(
            fcm_token=''
        )

        for user in geo_users:
            distance = _haversine_km(pet_lat, pet_lng, user.latitude, user.longitude)
            if distance is not None and distance <= radius_km:
                recipients[user.id] = (user, distance)

    normalised_location = _normalise_location(pet.location)
    if normalised_location:
        location_users = User.objects.exclude(id=pet.owner_id).exclude(
            fcm_token__isnull=True
        ).exclude(
            fcm_token=''
        )
        for user in location_users:
            if _normalise_location(getattr(user, 'address', '')) == normalised_location:
                recipients.setdefault(user.id, (user, None))

    # Fallback: if still no recipients and pet has coordinates, try nearby users based on their pets' coordinates
    if not recipients and pet_lat is not None and pet_lng is not None:
        pet_based_users = User.objects.exclude(id=pet.owner_id).exclude(
            fcm_token__isnull=True
        ).exclude(
            fcm_token=''
        ).filter(
            pets__latitude__isnull=False,
            pets__longitude__isnull=False,
        ).distinct()
        for user in pet_based_users:
            for upet in user.pets.all():
                if upet.latitude is None or upet.longitude is None:
                    continue
                distance = _haversine_km(pet_lat, pet_lng, upet.latitude, upet.longitude)
                if distance is not None and distance <= radius_km:
                    recipients[user.id] = (user, distance)
                    break  # one match is enough per user

    if not recipients:
        logger.info("No nearby users found for adoption pet %s", pet.id)
        return []

    notifications = []
    location_text = pet.location or 'بالقرب منك'

    for user, distance in recipients.values():
        if not _adoption_notifications_enabled(user):
            continue
        if distance is not None:
            distance_text = f"على بعد حوالي {distance:.1f} كم"
        else:
            distance_text = f"في {location_text}"

        title = "فرصة تبني قريبة منك"
        message = f"🐾 {pet.name or 'حيوان أليف'} متاح للتبني مجاناً {distance_text}. شاهد التفاصيل الآن!"

        extra = {
            'pet_id': pet.id,
            'pet_name': pet.name,
            'pet_type': pet.pet_type,
            'distance_km': round(distance, 1) if distance is not None else None,
            'location': location_text,
        }

        event_key = f"{event_key_prefix}:{user.id}" if event_key_prefix else None
        notification, created = create_notification_once(
            user=user,
            notification_type='adoption_pet_nearby',
            title=title,
            message=message,
            related_pet=pet,
            extra_data=extra,
            event_key=event_key,
        )
        notifications.append(notification)

        if created:
            push_payload = attach_push_targets({
                'type': 'adoption_pet_nearby',
                'pet_id': str(pet.id),
                'pet_name': pet.name,
                'distance_km': extra['distance_km'],
                'location': location_text,
            }, 'adoption_pet_nearby')
            _send_push_if_allowed(
                user,
                title,
                message,
                push_payload,
                category='discovery',
                notification=notification,
                notification_type='adoption_pet_nearby',
            )

    logger.info("Sent adoption pet notifications for pet %s to %d users", pet.id, len(notifications))
    return notifications

def send_system_message(user, title, message, extra_data=None):
    """إرسال رسالة نظام"""
    return create_notification(
        user=user,
        notification_type='system_message',
        title=title,
        message=message,
        extra_data=extra_data or {}
    )

def notify_adoption_request_received(adoption_request, event_key=None):
    """إشعار باستلام طلب تبني جديد"""

    pet_owner = adoption_request.pet.owner
    pet = adoption_request.pet
    title = f"طلب تبني جديد لحيوانك {pet.name}"
    message = f"يريد {adoption_request.adopter_name} تبني حيوانك {pet.name}"
    
    # إنشاء الإشعار
    extra_data = {
        'adopter_name': adoption_request.adopter_name,
        'adopter_phone': adoption_request.adopter_phone,
        'adopter_email': adoption_request.adopter_email,
        'adoption_request_id': adoption_request.id,
    }

    if not _adoption_notifications_enabled(pet_owner):
        logger.info("Adoption notifications disabled for user %s", pet_owner.id)
        return None

    notification, created = create_notification_once(
        user=pet_owner,
        notification_type='adoption_request_received',
        title=title,
        message=message,
        related_pet=pet,
        extra_data=extra_data,
        event_key=event_key,
    )

    if created:
        push_payload = attach_push_targets({
            'type': 'adoption_request_received',
            'adoption_request_id': str(adoption_request.id),
            'pet_id': str(pet.id),
        }, 'adoption_request_received')
        _send_push_if_allowed(
            pet_owner,
            title,
            message,
            push_payload,
            category='adoption',
            notification=notification,
            notification_type='adoption_request_received',
        )

        # إرسال إيميل
        send_adoption_request_email(adoption_request)

    return notification

def notify_adoption_request_approved(adoption_request, event_key=None):
    """إشعار بقبول طلب التبني"""

    adopter = adoption_request.adopter
    pet = adoption_request.pet
    
    title = f"تم قبول طلب تبني {pet.name}!"
    message = f"مبروك! تم قبول طلب التبني الخاص بك لحيوان {pet.name}"
    
    # إنشاء الإشعار
    if not _adoption_notifications_enabled(adopter):
        logger.info("Adoption notifications disabled for user %s", adopter.id)
        return None

    notification, created = create_notification_once(
        user=adopter,
        notification_type='adoption_request_approved',
        title=title,
        message=message,
        related_pet=pet,
        extra_data={
            'pet_owner_name': pet.owner.get_full_name(),
            'pet_owner_phone': pet.owner.phone,
            'adoption_request_id': adoption_request.id,
        },
        event_key=event_key,
    )

    if created:
        # إرسال إيميل
        send_adoption_request_approved_email(adoption_request)

        push_payload = attach_push_targets({
            'type': 'adoption_request_approved',
            'adoption_request_id': str(adoption_request.id),
            'pet_id': str(pet.id),
        }, 'adoption_request_approved')
        _send_push_if_allowed(
            adopter,
            title,
            message,
            push_payload,
            category='adoption',
            notification=notification,
            notification_type='adoption_request_approved',
        )

    return notification 
