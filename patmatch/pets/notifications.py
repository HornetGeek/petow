"""
Utilities for creating and managing notifications
"""
import logging
from math import radians, sin, cos, sqrt, atan2


from .models import Notification, Pet, BreedingRequest
from accounts.models import User
from accounts.firebase_service import firebase_service
from .email_notifications import (
    send_breeding_request_email, 
    send_breeding_request_approved_email,
    send_adoption_request_email,
    send_adoption_request_approved_email
)

logger = logging.getLogger(__name__)


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

def create_notification(
    user,
    notification_type,
    title,
    message,
    related_pet=None,
    related_breeding_request=None,
    extra_data=None
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
        related_pet=related_pet,
        related_breeding_request=related_breeding_request,
        extra_data=extra_data or {}
    )

def notify_breeding_request_received(breeding_request):
    """إشعار باستلام طلب مقابلة جديد"""
    receiver = breeding_request.receiver
    target_pet = breeding_request.target_pet
    requester_pet = breeding_request.requester_pet
    
    title = f"طلب مقابلة جديد من {breeding_request.requester.get_full_name()}"
    message = f"يريد {breeding_request.requester.get_full_name()} ترتيب مقابلة بين {requester_pet.name} و {target_pet.name}"
    
    # إضافة معلومات العيادة البيطرية إذا كانت متوفرة
    extra_data = {
        'requester_name': breeding_request.requester.get_full_name(),
        'requester_pet_name': requester_pet.name,
        'meeting_date': breeding_request.meeting_date.isoformat(),
    }
    
    # إضافة معلومات العيادة البيطرية فقط إذا كانت متوفرة
    if breeding_request.veterinary_clinic:
        extra_data['clinic_name'] = breeding_request.veterinary_clinic.name
        message += f" في {breeding_request.veterinary_clinic.name}"
    else:
        message += " (مكان المقابلة سيتم تحديده لاحقاً)"
    
    # إنشاء الإشعار
    notification = create_notification(
        user=receiver,
        notification_type='breeding_request_received',
        title=title,
        message=message,
        related_pet=target_pet,
        related_breeding_request=breeding_request,
        extra_data=extra_data
    )

    # إرسال إيميل
    send_breeding_request_email(breeding_request)

    # إرسال إشعار دفع
    push_payload = {
        'type': 'breeding_request_received',
        'breeding_request_id': str(breeding_request.id),
        'pet_id': str(target_pet.id),
    }
    _send_push_notification(receiver, title, message, push_payload)

    return notification

def notify_breeding_request_approved(breeding_request):
    """إشعار بقبول طلب المقابلة"""
    requester = breeding_request.requester
    target_pet = breeding_request.target_pet
    
    # تخصيص الرسالة بناءً على وجود العيادة البيطرية
    if breeding_request.veterinary_clinic:
        title = f"تم قبول طلب مقابلتك مع {target_pet.name}"
        message = f"تم قبول طلب المقابلة الخاص بك! يمكنك الآن ترتيب المقابلة في {breeding_request.veterinary_clinic.name}"
        
        extra_data = {
            'clinic_name': breeding_request.veterinary_clinic.name,
            'clinic_phone': breeding_request.veterinary_clinic.phone,
            'meeting_date': breeding_request.meeting_date.isoformat()
        }
    else:
        title = f"تم قبول طلب مقابلتك مع {target_pet.name}"
        message = f"تم قبول طلب المقابلة الخاص بك! يمكنك الآن ترتيب المقابلة في المكان المناسب لكما."
        
        extra_data = {
            'meeting_date': breeding_request.meeting_date.isoformat()
        }
    
    # إنشاء الإشعار
    notification = create_notification(
        user=requester,
        notification_type='breeding_request_approved',
        title=title,
        message=message,
        related_pet=target_pet,
        related_breeding_request=breeding_request,
        extra_data=extra_data
    )

    # إرسال إيميل
    send_breeding_request_approved_email(breeding_request)

    push_payload = {
        'type': 'breeding_request_approved',
        'breeding_request_id': str(breeding_request.id),
        'pet_id': str(target_pet.id),
    }
    _send_push_notification(requester, title, message, push_payload)

    return notification

def notify_breeding_request_rejected(breeding_request):
    """إشعار برفض طلب المقابلة"""
    requester = breeding_request.requester
    target_pet = breeding_request.target_pet
    
    title = f"تم رفض طلب مقابلتك مع {target_pet.name}"
    message = f"نأسف، تم رفض طلب المقابلة الخاص بك. يمكنك البحث عن حيوانات أخرى للتزاوج."
    
    notification = create_notification(
        user=requester,
        notification_type='breeding_request_rejected',
        title=title,
        message=message,
        related_pet=target_pet,
        related_breeding_request=breeding_request,
        extra_data={
            'rejection_reason': breeding_request.response_message or ''
        }
    )

    push_payload = {
        'type': 'breeding_request_rejected',
        'breeding_request_id': str(breeding_request.id),
        'pet_id': str(target_pet.id),
    }
    _send_push_notification(requester, title, message, push_payload)

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

        push_payload = {
            'type': 'breeding_request_completed',
            'breeding_request_id': str(breeding_request.id),
        }
        _send_push_notification(user, title, message, push_payload)

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

    push_payload = {
        'type': 'pet_status_changed',
        'pet_id': str(pet.id),
        'old_status': old_status,
        'new_status': new_status,
    }
    _send_push_notification(pet_owner, title, message, push_payload)

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


def notify_new_pet_added(pet, radius_km=30):
    """إرسال إشعار عند إضافة حيوان جديد للمستخدمين القريبين أو في نفس المدينة."""
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
        notification = create_notification(
            user=user,
            notification_type='pet_nearby',
            title=title,
            message=message,
            related_pet=pet,
            extra_data=extra
        )
        notifications.append(notification)

        push_payload = {
            'type': 'pet_nearby',
            'pet_id': str(pet.id),
            'pet_name': pet.name,
            'location': location_text,
        }
        _send_push_notification(user, title, message, push_payload)

    logger.info("Sent nearby pet notifications for pet %s to %d users", pet.id, len(notifications))
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

def notify_adoption_request_received(adoption_request):
    """إشعار باستلام طلب تبني جديد"""
    from .email_notifications import send_adoption_request_email
    
    pet_owner = adoption_request.pet.owner
    pet = adoption_request.pet
    adopter = adoption_request.adopter
    
    title = f"طلب تبني جديد لحيوانك {pet.name}"
    message = f"يريد {adoption_request.adopter_name} تبني حيوانك {pet.name}"
    
    # إنشاء الإشعار
    notification = create_notification(
        user=pet_owner,
        notification_type='adoption_request_received',
        title=title,
        message=message,
        related_pet=pet,
        extra_data={
            'adopter_name': adoption_request.adopter_name,
            'adopter_phone': adoption_request.adopter_phone,
            'adopter_email': adoption_request.adopter_email,
        }
    )
    
    # إرسال إيميل
    send_adoption_request_email(adoption_request)
    
    return notification

def notify_adoption_request_approved(adoption_request):
    """إشعار بقبول طلب التبني"""
    from .email_notifications import send_adoption_request_approved_email
    
    adopter = adoption_request.adopter
    pet = adoption_request.pet
    
    title = f"تم قبول طلب تبني {pet.name}!"
    message = f"مبروك! تم قبول طلب التبني الخاص بك لحيوان {pet.name}"
    
    # إنشاء الإشعار
    notification = create_notification(
        user=adopter,
        notification_type='adoption_request_approved',
        title=title,
        message=message,
        related_pet=pet,
        extra_data={
            'pet_owner_name': pet.owner.get_full_name(),
            'pet_owner_phone': pet.owner.phone,
        }
    )
    
    # إرسال إيميل
    send_adoption_request_approved_email(adoption_request)
    
    return notification 
